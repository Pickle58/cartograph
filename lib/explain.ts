import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnalysis, getAnalysisGraph } from "@/lib/analyses";
import { completeText, PINNED_MODEL, traced } from "@/lib/ai";
import { readCache, writeCache } from "@/lib/ai-cache";
import { categoryLabel, resolveRole } from "@/lib/categories";
import { sha256 } from "@/lib/content-hash";
import type { Explanation, ExplainTarget } from "@/lib/explanation";
import { foldRepository } from "@/lib/fold";
import {
  fetchHeadCommit,
  fetchRepositoryFile,
  RepositoryFetchError,
} from "@/lib/github";
import { getActiveOrganization } from "@/lib/organization";
import { createSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

const SOURCE_EXCERPT = 12_000;

const FORMATTING = `You may format the reply with \`inline code\`, **bold**, and lines that start with "- ". No headings, no code fences, no links, no tables, no numbered lists.`;

type CacheClient = SupabaseClient<Database>;

type StoredExplanation = {
  body: string;
  contentHash: string;
};

export async function explainSelection(
  analysisId: string,
  target: ExplainTarget,
): Promise<Explanation> {
  try {
    switch (target.kind) {
      case "file":
        return await explainFile(analysisId, target.path);
      case "folder":
        return await explainFolder(analysisId, target.directory);
      default: {
        const unhandled: never = target;
        throw new Error(`Unhandled explain target: ${String(unhandled)}`);
      }
    }
  } catch (error) {
    return { status: "failed", message: errorMessage(error) };
  }
}

async function explainFile(analysisId: string, filePath: string): Promise<Explanation> {
  const loaded = await loadAnalysis(analysisId);
  if (loaded.status !== "ok") return loaded.explanation;
  const { supabase, organizationId, repository, commitSha } = loaded;

  const file = await fileRow(supabase, analysisId, filePath);
  if (file === null) {
    return { status: "failed", message: `${filePath} is not a parsed file in this analysis.` };
  }

  const neighbours = await neighbourLists(supabase, analysisId, file.id);
  const stored = await storedExplanation(supabase, analysisId, file.id);
  const head = await fetchHeadCommit(repository);
  const commitMoved = head !== commitSha;

  if (commitMoved) {
    const fileChanged = await fileChangedAt(repository, head, filePath, stored);
    return {
      status: "stale",
      body: stored?.body ?? null,
      fileChanged,
      commitMoved: true,
    };
  }

  const bytes = await fetchRepositoryFile(repository, commitSha, filePath);
  const contentHash = sha256([bytes]);
  if (stored !== null && stored.contentHash !== contentHash) {
    return {
      status: "stale",
      body: stored.body,
      fileChanged: true,
      commitMoved: false,
    };
  }

  const source = decodeUtf8(bytes);
  const body = await traced("explain-file", async () => {
    const cacheKey = sha256([
      [
        `file-explanation-v1-${SOURCE_EXCERPT}`,
        contentHash,
        "imports",
        ...neighbours.imports,
        "imported-by",
        ...neighbours.importedBy,
      ].join("\n"),
    ]);
    const hit = await readCache(supabase, "file-explanation", cacheKey);
    const text =
      hit ??
      (await completeText(
        `You explain one file a parser has already mapped. You do not decide which files are connected, and you do not invent files. Use only the file and the neighbours below. ${FORMATTING}`,
        filePrompt(filePath, source, neighbours),
        800,
      ));
    if (hit === null) {
      await writeCache(supabase, organizationId, "file-explanation", cacheKey, text);
    }
    await rememberExplanation(supabase, organizationId, analysisId, file.id, text, contentHash);
    return text;
  });

  return { status: "ready", body };
}

async function explainFolder(
  analysisId: string,
  directory: string,
): Promise<Explanation> {
  const loaded = await loadAnalysis(analysisId);
  if (loaded.status !== "ok") return loaded.explanation;
  const { supabase, organizationId, repository, commitSha } = loaded;

  const head = await fetchHeadCommit(repository);
  if (head !== commitSha) {
    return {
      status: "stale",
      body: null,
      fileChanged: false,
      commitMoved: true,
    };
  }

  const graph = await getAnalysisGraph(analysisId);
  const fold = foldRepository(graph.files);
  const node = fold.directories.find((item) => item.directory === directory);
  if (node === undefined) {
    return { status: "failed", message: `${directory} is not a folder on this map.` };
  }

  const inside = new Set(node.files);
  const files = node.files.map((filePath) => {
    const file = graph.files.find((item) => item.path === filePath);
    if (file === undefined) {
      throw new Error(`File ${filePath} is not in the analysis`);
    }
    return { path: file.path, role: file.role };
  });
  files.sort((left, right) => compareText(left.path, right.path));

  const inbound = graph.links
    .filter((link) => inside.has(link.target) && !inside.has(link.source))
    .map((link) => ({ source: link.source, target: link.target }))
    .sort(
      (left, right) =>
        compareText(left.source, right.source) || compareText(left.target, right.target),
    );

  const body = await traced("explain-folder", async () => {
    const cacheKey = sha256([
      [
        "folder-explanation-v1",
        directory,
        ...files.map((file) => `${file.path} ${file.role}`),
        "",
        ...inbound.map((edge) => `${edge.source} ${edge.target}`),
      ].join("\n"),
    ]);
    const hit = await readCache(supabase, "folder-explanation", cacheKey);
    const text =
      hit ??
      (await completeText(
        `You explain one folder, not a single file inside it. You do not decide which files are connected, and you do not invent files. Use only the files and the imports below. ${FORMATTING}`,
        folderPrompt(directory, files, inbound),
        800,
      ));
    if (hit === null) {
      await writeCache(supabase, organizationId, "folder-explanation", cacheKey, text);
    }
    return text;
  });

  return { status: "ready", body };
}

function filePrompt(
  filePath: string,
  source: string,
  neighbours: {
    imports: readonly string[];
    importedBy: readonly string[];
    roles: ReadonlyMap<string, string>;
  },
): string {
  const excerpt =
    source.length <= SOURCE_EXCERPT
      ? source
      : `${source.slice(0, SOURCE_EXCERPT)}\n\n[${source.length - SOURCE_EXCERPT} characters omitted]`;
  return [
    "Explain this file in a short paragraph. Say what it does given the files it imports and the files that import it. Name a neighbour when it matters. Do not name any file that is not listed.",
    "",
    `File: ${filePath}`,
    "",
    "Imports:",
    neighbourLines(neighbours.imports, neighbours.roles),
    "",
    "Imported by:",
    neighbourLines(neighbours.importedBy, neighbours.roles),
    "",
    "Source:",
    excerpt,
  ].join("\n");
}

function folderPrompt(
  directory: string,
  files: readonly { path: string; role: string }[],
  inbound: readonly { source: string; target: string }[],
): string {
  const fileLines =
    files.length === 0
      ? "None."
      : files.map((file) => `- ${file.path} (${file.role})`).join("\n");
  const inboundLines =
    inbound.length === 0
      ? "Nothing outside this folder imports these files."
      : inbound.map((edge) => `- ${edge.source} imports ${edge.target}`).join("\n");
  return [
    "Explain this folder. Say what is in it, and why files outside it import the files inside it. Do not summarise one file and call that the folder. Do not name any file that is not listed.",
    "",
    `Folder: ${directory}`,
    "",
    "Files in this folder:",
    fileLines,
    "",
    "Imported from outside:",
    inboundLines,
  ].join("\n");
}

function neighbourLines(paths: readonly string[], roles: ReadonlyMap<string, string>): string {
  if (paths.length === 0) return "None.";
  return paths.map((filePath) => `- ${filePath} (${roles.get(filePath) ?? "unidentified"})`).join("\n");
}

async function loadAnalysis(analysisId: string): Promise<
  | {
      status: "ok";
      supabase: CacheClient;
      organizationId: string;
      repository: string;
      commitSha: string;
    }
  | { status: "failed"; explanation: Explanation }
> {
  const analysis = await getAnalysis(analysisId);
  if (analysis === null) {
    return { status: "failed", explanation: { status: "failed", message: "Analysis not found." } };
  }
  if (analysis.commitSha === null) {
    return {
      status: "failed",
      explanation: {
        status: "failed",
        message: "This analysis has no commit, so it cannot be explained.",
      },
    };
  }
  const organization = await getActiveOrganization();
  const supabase = await createSupabaseClient();
  return {
    status: "ok",
    supabase,
    organizationId: organization.id,
    repository: analysis.repository,
    commitSha: analysis.commitSha,
  };
}

async function fileRow(
  supabase: CacheClient,
  analysisId: string,
  filePath: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("files")
    .select("id, skip_reason")
    .eq("analysis_id", analysisId)
    .eq("path", filePath)
    .maybeSingle();
  if (error) throw new Error(`Could not load ${filePath}: ${error.message}`);
  if (data === null || data.skip_reason !== null) return null;
  return { id: data.id };
}

async function neighbourLists(
  supabase: CacheClient,
  analysisId: string,
  fileId: string,
): Promise<{
  imports: string[];
  importedBy: string[];
  roles: Map<string, string>;
}> {
  const outgoing = await relatedEdges(supabase, analysisId, fileId, "imports");
  const incoming = await relatedEdges(supabase, analysisId, fileId, "imported-by");
  const importIds = [...new Set(outgoing)];
  const importedByIds = [...new Set(incoming)];
  const ids = [...new Set([...importIds, ...importedByIds])];
  const paths = await pathsById(supabase, ids);
  const assigned = await rolesByPath(supabase, analysisId, ids, paths);

  const imports = importIds.map((id) => requiredPath(paths, id));
  const importedBy = importedByIds.map((id) => requiredPath(paths, id));
  imports.sort(compareText);
  importedBy.sort(compareText);

  const roles = new Map<string, string>();
  for (const filePath of [...imports, ...importedBy]) {
    roles.set(filePath, categoryLabel(resolveRole(filePath, assigned)));
  }
  return { imports, importedBy, roles };
}

// PostgREST stops a select at its row cap. Page until the range is short so a
// file imported by more than a thousand others is not explained from a prefix.
async function relatedEdges(
  supabase: CacheClient,
  analysisId: string,
  fileId: string,
  direction: "imports" | "imported-by",
): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; ) {
    const filtered =
      direction === "imports"
        ? supabase
            .from("edges")
            .select("id, target_file_id")
            .eq("analysis_id", analysisId)
            .eq("source_file_id", fileId)
        : supabase
            .from("edges")
            .select("id, source_file_id")
            .eq("analysis_id", analysisId)
            .eq("target_file_id", fileId);
    const { data, error } = await filtered.order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`Could not load neighbours: ${error.message}`);
    if (data.length === 0) break;
    for (const row of data) {
      ids.push("target_file_id" in row ? row.target_file_id : row.source_file_id);
    }
    if (data.length < 1000) break;
    from += data.length;
  }
  return ids;
}

async function pathsById(
  supabase: CacheClient,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    const { data, error } = await supabase.from("files").select("id, path").in("id", slice);
    if (error) throw new Error(`Could not load neighbour files: ${error.message}`);
    for (const row of data) paths.set(row.id, row.path);
  }
  return paths;
}

async function rolesByPath(
  supabase: CacheClient,
  analysisId: string,
  ids: readonly string[],
  paths: ReadonlyMap<string, string>,
): Promise<Map<string, string>> {
  const assigned = new Map<string, string>();
  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    const { data, error } = await supabase
      .from("file_roles")
      .select("file_id, role")
      .eq("analysis_id", analysisId)
      .in("file_id", slice);
    if (error) throw new Error(`Could not load neighbour roles: ${error.message}`);
    for (const row of data) {
      const filePath = paths.get(row.file_id);
      if (filePath === undefined) {
        throw new Error("A role points at a file that is not a neighbour");
      }
      assigned.set(filePath, row.role);
    }
  }
  return assigned;
}

function requiredPath(paths: ReadonlyMap<string, string>, id: string): string {
  const filePath = paths.get(id);
  if (filePath === undefined) {
    throw new Error("An edge points at a file that was not stored");
  }
  return filePath;
}

async function storedExplanation(
  supabase: CacheClient,
  analysisId: string,
  fileId: string,
): Promise<StoredExplanation | null> {
  const { data, error } = await supabase
    .from("explanations")
    .select("body, content_hash")
    .eq("analysis_id", analysisId)
    .eq("file_id", fileId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the stored explanation: ${error.message}`);
  if (data === null) return null;
  return { body: data.body, contentHash: data.content_hash };
}

async function fileChangedAt(
  repository: string,
  commitSha: string,
  filePath: string,
  stored: StoredExplanation | null,
): Promise<boolean> {
  if (stored === null) return false;
  try {
    const bytes = await fetchRepositoryFile(repository, commitSha, filePath);
    return sha256([bytes]) !== stored.contentHash;
  } catch (error) {
    if (error instanceof RepositoryFetchError && error.status === 404) return true;
    throw error;
  }
}

async function rememberExplanation(
  supabase: CacheClient,
  organizationId: string,
  analysisId: string,
  fileId: string,
  body: string,
  contentHash: string,
): Promise<void> {
  const existing = await storedExplanation(supabase, analysisId, fileId);
  if (existing === null) {
    const { error } = await supabase.from("explanations").insert({
      organization_id: organizationId,
      analysis_id: analysisId,
      file_id: fileId,
      body,
      model: PINNED_MODEL,
      content_hash: contentHash,
    });
    if (error?.code === "23505") {
      await updateExplanation(supabase, analysisId, fileId, body, contentHash);
      return;
    }
    if (error) throw new Error(`Could not store the explanation: ${error.message}`);
    return;
  }
  if (existing.body === body && existing.contentHash === contentHash) return;
  await updateExplanation(supabase, analysisId, fileId, body, contentHash);
}

async function updateExplanation(
  supabase: CacheClient,
  analysisId: string,
  fileId: string,
  body: string,
  contentHash: string,
): Promise<void> {
  const { error } = await supabase
    .from("explanations")
    .update({ body, model: PINNED_MODEL, content_hash: contentHash })
    .eq("analysis_id", analysisId)
    .eq("file_id", fileId);
  if (error) throw new Error(`Could not update the explanation: ${error.message}`);
}

function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("This file is not valid UTF-8.");
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Could not explain this.";
}
