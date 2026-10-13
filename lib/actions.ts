"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { getAnalysis } from "@/lib/analyses";
import { labelUnidentifiedFiles } from "@/lib/classify";
import { RepositoryFetchError } from "@/lib/github";
import { getActiveOrganization } from "@/lib/organization";
import { createAnalysis, replaceAnalysis, runAnalysis } from "@/lib/pipeline";
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
      await runAnalysis(
        supabase,
        {
          id: created.id,
          organizationId: organization.id,
          repositoryUrl: url,
        },
        async (directory) => {
          await labelUnidentifiedFiles(supabase, organization.id, created.id, directory);
        },
      );
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

  switch (analysis.status) {
    case "queued":
    case "running":
      return { error: "This analysis is still running." };
    case "complete":
    case "failed":
      break;
    default: {
      const unhandled: never = analysis.status;
      throw new Error(`Unhandled analysis status: ${String(unhandled)}`);
    }
  }

  let createdId: string;
  try {
    createdId = await replaceAnalysis(supabase, analysisId);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not replace the analysis.";
    return { error: message };
  }

  after(async () => {
    await runAnalysis(
      supabase,
      {
        id: createdId,
        organizationId: organization.id,
        repositoryUrl: analysis.repository,
      },
      async (directory) => {
        await labelUnidentifiedFiles(supabase, organization.id, createdId, directory);
      },
    );
  });

  redirect(`/analyses/${createdId}`);
}
