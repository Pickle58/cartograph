import "server-only";
import { auth } from "@clerk/nextjs/server";
import {
  signAnalysisCredential,
  signingKeyFromJwk,
  verifyAnalysisCredential,
  type AnalysisCredential,
  type SigningKey,
} from "@/lib/analysis-jwt";
import { env } from "@/lib/env";
import { createSupabaseClient } from "@/lib/supabase";

let signingKey: SigningKey | undefined;

function key(): SigningKey {
  signingKey ??= signingKeyFromJwk(env.analysisSigningJwk);
  return signingKey;
}

// Signs only after the signed-in member can already read this analysis. The
// token names that analysis and its organization, and nothing else.
export async function mintAnalysisCredential(analysisId: string): Promise<string> {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    throw new Error("Sign in before opening an analysis.");
  }

  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("analyses")
    .select("id, organization_id, status")
    .eq("id", analysisId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load analysis: ${error.message}`);
  }
  if (data === null || data.organization_id !== orgId || data.status !== "complete") {
    throw new Error("Analysis was not found.");
  }

  return signAnalysisCredential(
    key(),
    { analysisId: data.id, organizationId: data.organization_id },
    Date.now() / 1000,
  );
}

export function openAnalysisCredential(token: string): AnalysisCredential | null {
  return verifyAnalysisCredential(key(), token, Date.now() / 1000);
}
