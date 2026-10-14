import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { AnalysesTable } from "@/components/analyses-table";
import { AnalyseForm } from "@/components/analyse-form";
import { LandingPage } from "@/components/landing-page";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { listAnalyses } from "@/lib/analyses";
import { getActiveOrganization } from "@/lib/organization";

export const maxDuration = 300;

// The whole page is either the landing page or the dashboard. That choice
// needs the session, so there is no static shell to show first.
export const instant = false;

export default async function HomePage() {
  const { userId } = await auth();
  if (!userId) return <LandingPage />;
  return (
    <WorkspaceFrame>
      <Dashboard />
    </WorkspaceFrame>
  );
}

function Dashboard() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AnalyseForm />
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
          <Analyses />
        </Suspense>
      </div>
    </div>
  );
}

async function Analyses() {
  const [organization, analyses] = await Promise.all([
    getActiveOrganization(),
    listAnalyses(),
  ]);

  if (analyses.length === 0) {
    return (
      <p className="px-3 py-3 text-muted">
        No analyses in {organization.name} yet.
      </p>
    );
  }

  return (
    <AnalysesTable organizationName={organization.name} analyses={analyses} />
  );
}
