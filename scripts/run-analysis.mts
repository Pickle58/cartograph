import { createClient } from "@supabase/supabase-js";

import { startAnalysis, type AnalysisRun } from "../lib/pipeline.ts";
import type { Database } from "../types/database.ts";

const [repositoryUrl, organizationId] = process.argv.slice(2);

if (repositoryUrl === undefined || organizationId === undefined) {
  console.error(
    "Usage: node --env-file=.env.local scripts/run-analysis.mts <github-url> <organization-id>",
  );
  process.exit(1);
}

if (!organizationId.startsWith("org_")) {
  console.error("Organization id must be a Clerk org_ value");
  process.exit(1);
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
// The app writes with the signed-in Clerk token. This script has no session,
// so it needs the project's secret key or every insert is anonymous and empty.
const supabaseKey = required("SUPABASE_SECRET_KEY");

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

try {
  const run = await startAnalysis(organizationId, repositoryUrl, supabase);
  report(run);
  if (run.kind === "failed") process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function report(run: AnalysisRun): void {
  switch (run.kind) {
    case "existing":
      console.log(`existing: ${run.id}`);
      break;
    case "complete":
      console.log(`complete: ${run.id}`);
      break;
    case "failed":
      console.log(`failed: ${run.id}`);
      console.log(`stage: ${run.stage ?? "none"}`);
      console.log(`reason: ${run.reason}`);
      break;
    default: {
      const unexpected: never = run;
      throw new Error(`Unhandled run: ${String(unexpected)}`);
    }
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing ${name}. Set it in .env.local.`);
  }
  return value;
}
