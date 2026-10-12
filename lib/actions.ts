"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { getAnalysis } from "@/lib/analyses";
import { RepositoryFetchError } from "@/lib/github";
import { getActiveOrganization } from "@/lib/organization";
import { createAnalysis, runAnalysis } from "@/lib/pipeline";
import { createSupabaseClient } from "@/lib/supabase";

export async function analyseRepository(
  _previous: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const url = String(formData.get("url") ?? "");
  const organization = await getActiveOrganization();
  const supabase = await createSupabaseClient();

  let created: Awaited<ReturnType<typeof createAnalysis>>;
  try {
    created = await createAnalysis(organization.id, url, supabase);
  } catch (error) {
    if (error instanceof RepositoryFetchError) {
      return { error: error.message };
    }
    throw error;
  }

  if (created.kind === "created") {
    after(async () => {
      await runAnalysis(supabase, {
        id: created.id,
        organizationId: organization.id,
        repositoryUrl: url,
      });
    });
  }

  redirect(`/analyses/${created.id}`);
}

// One analysis per repository, so a fresh parse replaces the stored one.
export async function reanalyse(
  analysisId: string,
): Promise<{ error: string } | null> {
  const organization = await getActiveOrganization();
  const supabase = await createSupabaseClient();
  const analysis = await getAnalysis(analysisId);
  if (analysis === null) return { error: "Analysis not found." };

  const { error } = await supabase.from("analyses").delete().eq("id", analysisId);
  if (error) return { error: `Could not replace the analysis: ${error.message}` };

  let created: Awaited<ReturnType<typeof createAnalysis>>;
  try {
    created = await createAnalysis(organization.id, analysis.repository, supabase);
  } catch (caught) {
    if (caught instanceof RepositoryFetchError) return { error: caught.message };
    throw caught;
  }

  if (created.kind === "created") {
    after(async () => {
      await runAnalysis(supabase, {
        id: created.id,
        organizationId: organization.id,
        repositoryUrl: analysis.repository,
      });
    });
  }

  redirect(`/analyses/${created.id}`);
}
