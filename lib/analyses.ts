import "server-only";
import { coverageOf, type Coverage } from "@/lib/coverage";
import type { MapFile, MapLink } from "@/lib/map-scene";
import { folderOf } from "@/parser/paths.mts";
import {
  type AnalysisStage,
  type AnalysisStatus,
  type AnalysisSummary,
} from "@/lib/progress";
import { createSupabaseClient } from "@/lib/supabase";

export type { AnalysisStage, AnalysisStatus, AnalysisSummary };

export type AnalysisGraph = {
  repository: string;
  files: MapFile[];
  links: MapLink[];
  coverage: Coverage;
};

const LIST_LIMIT = 100;

// No organization filter: the policy on `analyses` and `projects` scopes rows
// to the organization in the session token. Switching organization changes
// the token, not this query.
export async function listAnalyses(): Promise<AnalysisSummary[]> {
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, status, stage, stage_message, commit_sha, failure_reason, created_at, updated_at, project:projects!inner(repository)",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    throw new Error(`Could not list analyses: ${error.message}`);
  }

  return data.map((row) => ({
    id: row.id,
    repository: row.project.repository,
    status: row.status,
    stage: row.stage,
    stageMessage: row.stage_message,
    commitSha: row.commit_sha,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getAnalysis(id: string): Promise<AnalysisSummary | null> {
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, status, stage, stage_message, commit_sha, failure_reason, created_at, updated_at, project:projects!inner(repository)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load analysis: ${error.message}`);
  }
  if (data === null) return null;

  return {
    id: data.id,
    repository: data.project.repository,
    status: data.status,
    stage: data.stage,
    stageMessage: data.stage_message,
    commitSha: data.commit_sha,
    failureReason: data.failure_reason,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getAnalysisGraph(id: string): Promise<AnalysisGraph> {
  const supabase = await createSupabaseClient();

  const analysis = await getAnalysis(id);
  if (analysis === null) {
    throw new Error(`Analysis ${id} was not found`);
  }

  const { data: fileRows, error: filesError } = await supabase
    .from("files")
    .select("id, path, lines, skip_reason")
    .eq("analysis_id", id);
  if (filesError) {
    throw new Error(`Could not load files: ${filesError.message}`);
  }

  const { data: edgeRows, error: edgesError } = await supabase
    .from("edges")
    .select("source_file_id, target_file_id")
    .eq("analysis_id", id);
  if (edgesError) {
    throw new Error(`Could not load edges: ${edgesError.message}`);
  }

  const pathById = new Map<string, string>();
  const files: MapFile[] = [];
  for (const row of fileRows) {
    if (row.skip_reason !== null) continue;
    if (row.lines === null) {
      throw new Error(`Parsed file ${row.path} has no line count`);
    }
    pathById.set(row.id, row.path);
    files.push({ path: row.path, folder: folderOf(row.path), lines: row.lines });
  }

  const links: MapLink[] = [];
  for (const row of edgeRows) {
    const source = pathById.get(row.source_file_id);
    const target = pathById.get(row.target_file_id);
    if (source === undefined || target === undefined) {
      throw new Error("An edge points at a file that is not a parsed node");
    }
    links.push({ source, target });
  }

  return {
    repository: analysis.repository,
    files,
    links,
    coverage: coverageOf(fileRows),
  };
}
