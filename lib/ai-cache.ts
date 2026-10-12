import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PINNED_MODEL } from "@/lib/ai";
import type { Database } from "@/types/database";

type CacheClient = SupabaseClient<Database>;
type CacheKind = Database["public"]["Enums"]["ai_cache_kind"];

// No organization filter. The policy on ai_cache is what limits the rows.
export async function readCache(
  supabase: CacheClient,
  kind: CacheKind,
  contentHash: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_cache")
    .select("body")
    .eq("kind", kind)
    .eq("model", PINNED_MODEL)
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not read the explanation cache: ${error.message}`);
  }
  return data?.body ?? null;
}

export async function writeCache(
  supabase: CacheClient,
  organizationId: string,
  kind: CacheKind,
  contentHash: string,
  body: string,
): Promise<void> {
  const { error } = await supabase.from("ai_cache").insert({
    organization_id: organizationId,
    kind,
    model: PINNED_MODEL,
    content_hash: contentHash,
    body,
  });
  if (error?.code === "23505") return;
  if (error) {
    throw new Error(`Could not store the explanation cache: ${error.message}`);
  }
}
