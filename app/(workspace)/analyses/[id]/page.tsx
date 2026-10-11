import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CoverageBanner } from "@/components/coverage-banner";
import { MapShell } from "@/components/map-shell";
import { ProgressView } from "@/components/progress-view";
import { getAnalysis, getAnalysisGraph } from "@/lib/analyses";
import { categoryCounts } from "@/lib/categories";
import { coverageIsPartial } from "@/lib/coverage";
import { noFramework } from "@/parser/adapter.mts";

export const maxDuration = 300;

export default function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Analysis params={params} />
    </Suspense>
  );
}

async function Analysis({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const analysis = await getAnalysis(id);
  if (analysis === null) notFound();

  if (analysis.status !== "complete") {
    return <ProgressView analysis={analysis} />;
  }

  const graph = await getAnalysisGraph(id);
  const categories = categoryCounts(graph.files);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {coverageIsPartial(graph.coverage) ? (
        <CoverageBanner coverage={graph.coverage} />
      ) : null}
      <div className="min-h-0 flex-1">
        <MapShell
          name={graph.repository}
          framework={noFramework.id}
          importCount={graph.links.length}
          routeCount={0}
          categories={categories}
          files={graph.files}
          links={graph.links}
        />
      </div>
    </div>
  );
}
