import "server-only";
import { createSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type AnalysisStatus = Database["public"]["Enums"]["analysis_status"];

export type AnalysisSummary = {
  id: string;
  repository: string;
  status: AnalysisStatus;
  commitSha: string | null;
  failureReason: string | null;
  createdAt: string;
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
      "id, status, commit_sha, failure_reason, created_at, project:projects!inner(repository)",
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
    commitSha: row.commit_sha,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  }));
}
