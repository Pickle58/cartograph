"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
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
