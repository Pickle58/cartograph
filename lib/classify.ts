import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnalysis } from "@/lib/analyses";
import { completeJson, missingModelKey, modelConfigured, traced } from "@/lib/ai";
import { readCache, writeCache } from "@/lib/ai-cache";
import { needsModelRole } from "@/lib/categories";
import { sha256 } from "@/lib/content-hash";
import { fetchRepositoryAtCommit } from "@/lib/github";
import { getActiveOrganization } from "@/lib/organization";
import { createSupabaseClient } from "@/lib/supabase";
import { isInsideRoot } from "@/parser/paths.mts";
import { isModelRole, MODEL_ROLE_IDS } from "@/parser/roles.mts";
import type { Database } from "@/types/database";

const ROLE_EXCERPT = 2_000;
const BATCH = 8;

type CacheClient = SupabaseClient<Database>;

type LabelFile = {
  id: string;
  path: string;
  bytes: Buffer;
};

const ROLE_SCHEMA: { [key: string]: unknown } = {
  type: "object",
  additionalProperties: false,
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          role: { type: "string", enum: [...MODEL_ROLE_IDS] },
        },
        required: ["path", "role"],
      },
    },
  },
  required: ["assignments"],
};

// Files still unidentified after adapters and path convention. Runs before the
// map is shown, so a role does not appear on its own after the page has rendered.
export async function labelUnidentifiedAnalysis(analysisId: string): Promise<string | null> {
  try {
    const analysis = await getAnalysis(analysisId);
    if (analysis === null || analysis.commitSha === null) return null;
    const supabase = await createSupabaseClient();
    const organization = await getActiveOrganization();
    const files = await selectParsedFiles(supabase, analysisId);
    const assigned = await selectAssignedPaths(supabase, analysisId, files);
    const candidates = files.filter((file) => needsModelRole(file.path, assigned));
    if (candidates.length === 0) return null;
    if (!modelConfigured()) {
      return `Unidentified files were not labelled. ${missingModelKey()}`;
    }

    const fetched = await fetchRepositoryAtCommit(analysis.repository, analysis.commitSha);
    try {
      const labeled = await filesOnDisk(fetched.directory, candidates);
      const unlabeled = await assignRoles(
        supabase,
        organization.id,
        analysisId,
        labeled,
      );
      if (unlabeled === 0) return null;
      const noun = unlabeled === 1 ? "file was" : "files were";
      return `${unlabeled} unidentified ${noun} not labelled: the model did not return a permitted role.`;
    } finally {
      await fetched.cleanup();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not label unidentified files.";
    return `Unidentified files were not labelled. ${message}`;
  }
}

async function assignRoles(
  supabase: CacheClient,
  organizationId: string,
  analysisId: string,
  files: readonly LabelFile[],
): Promise<number> {
  let unlabeled = 0;
  for (let index = 0; index < files.length; index += BATCH) {
    const batch = files.slice(index, index + BATCH);
    unlabeled += await assignBatch(supabase, organizationId, analysisId, batch);
  }
  return unlabeled;
}

async function assignBatch(
  supabase: CacheClient,
  organizationId: string,
  analysisId: string,
  files: readonly LabelFile[],
): Promise<number> {
  return traced("classify-files", async () => {
    const pending: (LabelFile & { key: string })[] = [];
    for (const file of files) {
      const key = sha256([Buffer.from(`file-role-v1-${ROLE_EXCERPT}\n`), file.bytes]);
      const hit = await readCache(supabase, "file-role", key);
      if (hit !== null && isModelRole(hit)) {
        await rememberRole(supabase, organizationId, analysisId, file.id, hit);
        continue;
      }
      pending.push({ ...file, key });
    }
    if (pending.length === 0) return 0;

    const text = await completeJson(
      `You label source files. For each file, choose one role. The only roles are: ${MODEL_ROLE_IDS.join(", ")}. Never use page, route, controller, or any other role. Use only the path and the source you are shown. Do not invent files.`,
      rolePrompt(pending),
      ROLE_SCHEMA,
      1500,
    );
    const assignments = parseAssignments(text);
    const pendingPaths = new Set(pending.map((file) => file.path));
    let unlabeled = 0;
    for (const file of pending) {
      const role = assignments.get(file.path);
      if (role === undefined || !pendingPaths.has(file.path) || !isModelRole(role)) {
        unlabeled += 1;
        continue;
      }
      await writeCache(supabase, organizationId, "file-role", file.key, role);
      await rememberRole(supabase, organizationId, analysisId, file.id, role);
    }
    return unlabeled;
  });
}

function rolePrompt(files: readonly LabelFile[]): string {
  return files
    .map((file) => {
      const text = decodeUtf8(file.bytes);
      const source =
        text.length <= ROLE_EXCERPT
          ? text
          : `${text.slice(0, ROLE_EXCERPT)}\n[${text.length - ROLE_EXCERPT} characters omitted]`;
      return `File: ${file.path}\n${source}`;
    })
    .join("\n\n");
}

function parseAssignments(text: string): Map<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The model did not return JSON.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("assignments" in value) ||
    !Array.isArray(value.assignments)
  ) {
    throw new Error("The model did not return role assignments.");
  }
  const roles = new Map<string, string>();
  for (const entry of value.assignments) {
    if (typeof entry !== "object" || entry === null) continue;
    if (!("path" in entry) || !("role" in entry)) continue;
    if (typeof entry.path !== "string" || typeof entry.role !== "string") continue;
    roles.set(entry.path, entry.role);
  }
  return roles;
}

async function rememberRole(
  supabase: CacheClient,
  organizationId: string,
  analysisId: string,
  fileId: string,
  role: string,
): Promise<void> {
  const { error } = await supabase.from("file_roles").insert({
    organization_id: organizationId,
    analysis_id: analysisId,
    file_id: fileId,
    role,
    source: "ai",
  });
  if (error?.code === "23505") return;
  if (error) throw new Error(`Could not store a role: ${error.message}`);
}

async function selectParsedFiles(
  supabase: CacheClient,
  analysisId: string,
): Promise<{ id: string; path: string }[]> {
  const rows: { id: string; path: string }[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await supabase
      .from("files")
      .select("id, path, skip_reason")
      .eq("analysis_id", analysisId)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Could not load files: ${error.message}`);
    if (data.length === 0) break;
    for (const row of data) {
      if (row.skip_reason !== null) continue;
      rows.push({ id: row.id, path: row.path });
    }
    if (data.length < 1000) break;
    from += data.length;
  }
  return rows;
}

async function selectAssignedPaths(
  supabase: CacheClient,
  analysisId: string,
  files: readonly { id: string; path: string }[],
): Promise<Set<string>> {
  const pathById = new Map(files.map((file) => [file.id, file.path]));
  const assigned = new Set<string>();
  for (let from = 0; ; ) {
    const { data, error } = await supabase
      .from("file_roles")
      .select("file_id")
      .eq("analysis_id", analysisId)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Could not load roles: ${error.message}`);
    if (data.length === 0) break;
    for (const row of data) {
      const filePath = pathById.get(row.file_id);
      if (filePath !== undefined) assigned.add(filePath);
    }
    if (data.length < 1000) break;
    from += data.length;
  }
  return assigned;
}

async function filesOnDisk(
  root: string,
  files: readonly { id: string; path: string }[],
): Promise<LabelFile[]> {
  const labeled: LabelFile[] = [];
  for (const file of files) {
    labeled.push({
      id: file.id,
      path: file.path,
      bytes: await readRepoFile(root, file.path),
    });
  }
  return labeled;
}

async function readRepoFile(root: string, repoPath: string): Promise<Buffer> {
  if (
    repoPath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Not a repository file path: ${repoPath}`);
  }
  const absolute = path.join(root, ...repoPath.split("/"));
  if (!isInsideRoot(root, absolute)) {
    throw new Error(`Path is outside the repository: ${repoPath}`);
  }
  return fs.readFile(absolute);
}

function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("A file to label is not valid UTF-8.");
  }
}
