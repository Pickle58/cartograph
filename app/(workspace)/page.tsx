import { Suspense } from "react";
import { AnalysesTable } from "@/components/analyses-table";
import { AnalyseForm } from "@/components/analyse-form";
import { listAnalyses } from "@/lib/analyses";
import { getActiveOrganization } from "@/lib/organization";

export const maxDuration = 300;

export default function DashboardPage() {
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
