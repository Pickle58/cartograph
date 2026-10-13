import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnalysis } from "@/lib/analyses";
import { completeJson, missingModelKey, modelConfigured, traced } from "@/lib/ai";
import { readCache, writeCache } from "@/lib/ai-cache";
import { needsModelRole } from "@/lib/categories";
import { sha256 } from "@/lib/content-hash";
import {
  parseAssignments,
  ROLE_BATCH,
  ROLE_EXCERPT,
  ROLE_SCHEMA,
  roleSystemPrompt,
  roleUserPrompt,
  sourceExcerpt,
} from "@/lib/role-prompt";
import { fetchRepositoryAtCommit } from "@/lib/github";
import { getActiveOrganization } from "@/lib/organization";
import { createSupabaseClient } from "@/lib/supabase";
import { isInsideRoot } from "@/parser/paths.mts";
import { isModelRole } from "@/parser/roles.mts";
import type { Database } from "@/types/database";

type CacheClient = SupabaseClient<Database>;

type LabelFile = {
  id: string;
  path: string;
  bytes: Buffer;
};

// Files still unidentified after adapters and path convention. The parse calls
// this once, before the analysis is marked complete, so the map opens with the
// roles already stored. A result that was stored without that step (the
// command-line run, or a row from before this existed) is labelled on the first
// view, and the attempt is recorded either way so a later view does not
// download the repository again.
export async function labelUnidentifiedAnalysis(analysisId: string): Promise<string | null> {
  try {
    const analysis = await getAnalysis(analysisId);
    if (analysis === null || analysis.labelingAttempted) return analysis?.labelingNote ?? null;
    const supabase = await createSupabaseClient();
    if (analysis.commitSha === null) {
      await recordLabelingAttempt(supabase, analysisId, null);
      return null;
    }
    const files = await selectParsedFiles(supabase, analysisId);
    const assigned = await selectAssignedPaths(supabase, analysisId, files);
    const candidates = files.filter((file) => needsModelRole(file.path, assigned));
    if (candidates.length === 0) {
      await recordLabelingAttempt(supabase, analysisId, null);
      return null;
    }
    if (!modelConfigured()) {
      const note = labelingNote(new Error(missingModelKey()));
      await recordLabelingAttempt(supabase, analysisId, note);
      return note;
    }
    const organization = await getActiveOrganization();
    const fetched = await fetchRepositoryAtCommit(analysis.repository, analysis.commitSha);
    try {
      return await labelUnidentifiedFiles(
        supabase,
        organization.id,
        analysisId,
        fetched.directory,
      );
    } finally {
      await fetched.cleanup();
    }
  } catch (error) {
    const note = labelingNote(error);
    try {
      const supabase = await createSupabaseClient();
      await recordLabelingAttempt(supabase, analysisId, note);
    } catch {
      // The marker did not stick, so the next view can try again.
    }
    return note;
  }
}

export async function labelUnidentifiedFiles(
  supabase: CacheClient,
  organizationId: string,
  analysisId: string,
  directory: string,
): Promise<string | null> {
  try {
    const note = await labelFromDirectory(supabase, organizationId, analysisId, directory);
    await recordLabelingAttempt(supabase, analysisId, note);
    return note;
  } catch (error) {
    const note = labelingNote(error);
    await recordLabelingAttempt(supabase, analysisId, note);
    return note;
  }
}

async function labelFromDirectory(
  supabase: CacheClient,
  organizationId: string,
  analysisId: string,
  directory: string,
): Promise<string | null> {
  const files = await selectParsedFiles(supabase, analysisId);
  const assigned = await selectAssignedPaths(supabase, analysisId, files);
  const candidates = files.filter((file) => needsModelRole(file.path, assigned));
  if (candidates.length === 0) return null;
  if (!modelConfigured()) {
    return labelingNote(new Error(missingModelKey()));
  }

  const labeled = await filesOnDisk(directory, candidates);
  const unlabeled = await assignRoles(supabase, organizationId, analysisId, labeled);
  return unlabeledNote(unlabeled);
}

function labelingNote(error: unknown): string {
  const message = error instanceof Error ? error.message : "Could not label unidentified files.";
  if (message.startsWith("Unidentified files were not labelled.")) return message;
  return `Unidentified files were not labelled. ${message}`;
}

async function recordLabelingAttempt(
  supabase: CacheClient,
  analysisId: string,
  note: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("analyses")
    .update({ labeling_attempted: true, labeling_note: note })
    .eq("id", analysisId);
  if (error) throw new Error(`Could not record labelling: ${error.message}`);
}

type Unlabeled = { refused: number; unreadable: number };

function unlabeledNote(counts: Unlabeled): string | null {
  const total = counts.refused + counts.unreadable;
  if (total === 0) return null;
  const noun = total === 1 ? "file was" : "files were";
  if (counts.unreadable === 0) {
    return `${total} unidentified ${noun} not labelled: the model did not return a permitted role.`;
  }
  if (counts.refused === 0) {
    const reason = total === 1 ? "it is not valid UTF-8" : "they are not valid UTF-8";
    return `${total} unidentified ${noun} not labelled: ${reason}.`;
  }
  return `${total} unidentified ${noun} not labelled.`;
}

async function assignRoles(
  supabase: CacheClient,
  organizationId: string,
  analysisId: string,
  files: readonly LabelFile[],
): Promise<Unlabeled> {
  const unlabeled: Unlabeled = { refused: 0, unreadable: 0 };
  for (let index = 0; index < files.length; index += ROLE_BATCH) {
    const batch = files.slice(index, index + ROLE_BATCH);
    const counts = await assignBatch(supabase, organizationId, analysisId, batch);
    unlabeled.refused += counts.refused;
    unlabeled.unreadable += counts.unreadable;
  }
  return unlabeled;
}

async function assignBatch(
  supabase: CacheClient,
  organizationId: string,
  analysisId: string,
  files: readonly LabelFile[],
): Promise<Unlabeled> {
  return traced("classify-files", async () => {
    const pending: (LabelFile & { key: string; source: string })[] = [];
    const unlabeled: Unlabeled = { refused: 0, unreadable: 0 };
    for (const file of files) {
      const source = sourceExcerpt(file.bytes);
      if (source === null) {
        unlabeled.unreadable += 1;
        continue;
      }
      // The role is chosen from the path and the source. v1 hashed the bytes
      // only, so those entries stay unread.
      const key = sha256([
        Buffer.from(`file-role-v2-${ROLE_EXCERPT}\0${file.path}\0`),
        file.bytes,
      ]);
      const hit = await readCache(supabase, "file-role", key);
      if (hit !== null && isModelRole(hit)) {
        await rememberRole(supabase, organizationId, analysisId, file.id, hit);
        continue;
      }
      pending.push({ ...file, key, source });
    }
    if (pending.length === 0) return unlabeled;

    const text = await completeJson(
      roleSystemPrompt(),
      roleUserPrompt(pending),
      ROLE_SCHEMA,
      1500,
    );
    const assignments = parseAssignments(text);
    const pendingPaths = new Set(pending.map((file) => file.path));
    for (const file of pending) {
      const role = assignments.get(file.path);
      if (role === undefined || !pendingPaths.has(file.path) || !isModelRole(role)) {
        unlabeled.refused += 1;
        continue;
      }
      await writeCache(supabase, organizationId, "file-role", file.key, role);
      await rememberRole(supabase, organizationId, analysisId, file.id, role);
    }
    return unlabeled;
  });
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

