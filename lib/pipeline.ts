import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAdapter } from "../parser/detect.mts";
import { parseWalked, repositoryRoot } from "../parser/parse.mts";
import type { ParseResult } from "../parser/types.mts";
import { walkRepository } from "../parser/walk.mts";
import {
  fetchPublicRepository,
  parseGithubRepository,
  RepositoryFetchError,
} from "./github.ts";
import { STAGE_MESSAGE } from "./progress.ts";
import type { Database } from "../types/database.ts";

export type AnalysisStage = Database["public"]["Enums"]["analysis_stage"];
export type AnalysisStatus = Database["public"]["Enums"]["analysis_status"];

export type AnalysisRun =
  | { kind: "existing"; id: string }
  | { kind: "complete"; id: string }
  | { kind: "failed"; id: string; stage: AnalysisStage | null; reason: string };

export type CreatedAnalysis =
  | { kind: "existing"; id: string }
  | { kind: "created"; id: string };

type AnalysisClient = SupabaseClient<Database>;

const INSERT_BATCH = 500;

export async function startAnalysis(
  organizationId: string,
  repositoryUrl: string,
  supabase: AnalysisClient,
): Promise<AnalysisRun> {
  const created = await createAnalysis(organizationId, repositoryUrl, supabase);
  if (created.kind === "existing") return created;
  return runAnalysis(supabase, {
    id: created.id,
    organizationId,
    repositoryUrl,
  });
}

export async function createAnalysis(
  organizationId: string,
  repositoryUrl: string,
  supabase: AnalysisClient,
): Promise<CreatedAnalysis> {
  const repository = parseGithubRepository(repositoryUrl);

  const existing = await findExistingAnalysis(
    supabase,
    organizationId,
    repository,
  );
  if (existing !== null) {
    return { kind: "existing", id: existing };
  }

  await ensureOrganization(supabase, organizationId);
  const projectId = await ensureProject(supabase, organizationId, repository);
  const started = await insertRunningAnalysis(
    supabase,
    organizationId,
    projectId,
  );
  if (!started.created) {
    return { kind: "existing", id: started.id };
  }
  return { kind: "created", id: started.id };
}

export async function runAnalysis(
  supabase: AnalysisClient,
  analysis: { id: string; organizationId: string; repositoryUrl: string },
): Promise<AnalysisRun> {
  let stage: AnalysisStage = "fetch";
  let fetched: Awaited<ReturnType<typeof fetchPublicRepository>> | undefined;

  try {
    fetched = await fetchPublicRepository(analysis.repositoryUrl);
    await write(supabase, analysis.id, {
      commit_sha: fetched.commitSha,
    });

    stage = "select";
    await setStage(supabase, analysis.id, stage);
    const root = repositoryRoot(fetched.directory);
    const adapter = selectAdapter(root);
    const walked = walkRepository(root, adapter);

    stage = "parse";
    await setStage(supabase, analysis.id, stage);
    const parsed = parseWalked(root, walked, adapter);

    stage = "store";
    await setStage(supabase, analysis.id, stage);
    await storeParseResult(supabase, analysis.id, analysis.organizationId, parsed);

    await write(supabase, analysis.id, {
      status: "complete",
      stage,
      stage_message: "Saved",
      failure_reason: null,
      framework: parsed.framework,
    });

    return { kind: "complete", id: analysis.id };
  } catch (error) {
    const reason = failReason(error);
    try {
      await write(supabase, analysis.id, {
        status: "failed",
        stage,
        stage_message: reason,
        failure_reason: reason,
      });
    } catch (writeError) {
      throw new Error(
        `Run failed (${reason}) and could not record the failure: ${failReason(writeError)}`,
      );
    }
    return { kind: "failed", id: analysis.id, stage, reason };
  } finally {
    await fetched?.cleanup();
  }
}

export async function storeParseResult(
  supabase: AnalysisClient,
  analysisId: string,
  organizationId: string,
  parsed: ParseResult,
): Promise<void> {
  const fileRows = [
    ...parsed.files.map((file) => ({
      organization_id: organizationId,
      analysis_id: analysisId,
      path: file.path,
      lines: file.lines,
      skip_reason: null,
    })),
    ...parsed.skipped.map((file) => ({
      organization_id: organizationId,
      analysis_id: analysisId,
      path: file.path,
      lines: null,
      skip_reason: file.reason,
    })),
  ];

  const ids = new Map<string, string>();
  for (const batch of chunks(fileRows, INSERT_BATCH)) {
    const { data, error } = await supabase
      .from("files")
      .insert(batch)
      .select("id, path");
    if (error) {
      throw new Error(`Could not store files: ${error.message}`);
    }
    for (const row of data) ids.set(row.path, row.id);
  }

  const edgeRows = parsed.edges.map((edge) => {
    const sourceFileId = ids.get(edge.source);
    const targetFileId = ids.get(edge.target);
    if (sourceFileId === undefined || targetFileId === undefined) {
      throw new Error(
        `Edge ${edge.source} -> ${edge.target} points at a file that was not stored`,
      );
    }
    return {
      organization_id: organizationId,
      analysis_id: analysisId,
      source_file_id: sourceFileId,
      target_file_id: targetFileId,
      kind: edge.kind,
      specifier: edge.specifier,
    };
  });

  for (const batch of chunks(edgeRows, INSERT_BATCH)) {
    const { error } = await supabase.from("edges").insert(batch);
    if (error) {
      throw new Error(`Could not store edges: ${error.message}`);
    }
  }

  const roleRows = parsed.roles.map((role) => {
    const fileId = ids.get(role.path);
    if (fileId === undefined) {
      throw new Error(`Role for ${role.path} points at a file that was not stored`);
    }
    return {
      organization_id: organizationId,
      analysis_id: analysisId,
      file_id: fileId,
      role: role.role,
      source: "convention" as const,
    };
  });

  for (const batch of chunks(roleRows, INSERT_BATCH)) {
    const { error } = await supabase.from("file_roles").insert(batch);
    if (error) {
      throw new Error(`Could not store roles: ${error.message}`);
    }
  }

  const routeRows = parsed.routes.map((route) => {
    const fileId = ids.get(route.file);
    if (fileId === undefined) {
      throw new Error(
        `Route ${route.method} ${route.pattern} points at a file that was not stored`,
      );
    }
    return {
      organization_id: organizationId,
      analysis_id: analysisId,
      file_id: fileId,
      method: route.method,
      path: route.pattern,
    };
  });

  for (const batch of chunks(routeRows, INSERT_BATCH)) {
    const { error } = await supabase.from("routes").insert(batch);
    if (error) {
      throw new Error(`Could not store routes: ${error.message}`);
    }
  }
}

async function findExistingAnalysis(
  supabase: AnalysisClient,
  organizationId: string,
  repository: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, analyses(id)")
    .eq("organization_id", organizationId)
    .eq("repository", repository)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not look up ${repository}: ${error.message}`);
  }
  const analysis = data?.analyses[0];
  return analysis === undefined ? null : analysis.id;
}

async function ensureOrganization(
  supabase: AnalysisClient,
  organizationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .upsert({ id: organizationId }, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    throw new Error(`Could not record organization: ${error.message}`);
  }
}

async function ensureProject(
  supabase: AnalysisClient,
  organizationId: string,
  repository: string,
): Promise<string> {
  // Insert, not upsert: upsert is ON CONFLICT DO UPDATE, and authenticated
  // has no UPDATE on projects — members create a project, they don't edit it.
  const { data, error } = await supabase
    .from("projects")
    .insert({ organization_id: organizationId, repository })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const existing = await projectFor(supabase, organizationId, repository);
    if (existing !== null) return existing;
  }
  if (error || data === null) {
    throw new Error(
      `Could not record project ${repository}: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}

async function projectFor(
  supabase: AnalysisClient,
  organizationId: string,
  repository: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("repository", repository)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not look up ${repository}: ${error.message}`);
  }
  return data?.id ?? null;
}

async function insertRunningAnalysis(
  supabase: AnalysisClient,
  organizationId: string,
  projectId: string,
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await supabase
    .from("analyses")
    .insert({
      organization_id: organizationId,
      project_id: projectId,
      status: "running",
      stage: "fetch",
      stage_message: STAGE_MESSAGE.fetch,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const existing = await analysisForProject(supabase, organizationId, projectId);
    if (existing !== null) return { id: existing, created: false };
  }
  if (error || data === null) {
    throw new Error(
      `Could not start analysis: ${error?.message ?? "no row returned"}`,
    );
  }
  return { id: data.id, created: true };
}

async function analysisForProject(
  supabase: AnalysisClient,
  organizationId: string,
  projectId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("analyses")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not look up analysis: ${error.message}`);
  }
  return data?.id ?? null;
}

async function setStage(
  supabase: AnalysisClient,
  analysisId: string,
  stage: AnalysisStage,
): Promise<void> {
  await write(supabase, analysisId, {
    status: "running",
    stage,
    stage_message: STAGE_MESSAGE[stage],
    failure_reason: null,
  });
}

async function write(
  supabase: AnalysisClient,
  analysisId: string,
  values: Database["public"]["Tables"]["analyses"]["Update"],
): Promise<void> {
  const { error } = await supabase.from("analyses").update(values).eq("id", analysisId);
  if (error) {
    throw new Error(`Could not update analysis: ${error.message}`);
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function failReason(error: unknown): string {
  if (error instanceof RepositoryFetchError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
