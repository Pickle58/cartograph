import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CoverageBanner } from "@/components/coverage-banner";
import { MapShell } from "@/components/map-shell";
import { ProgressView } from "@/components/progress-view";
import { tracingConfigured } from "@/lib/ai";
import { getAnalysis, getAnalysisGraph } from "@/lib/analyses";
import { categoryCounts, frameworkLabel } from "@/lib/categories";
import { labelUnidentifiedAnalysis } from "@/lib/classify";
import { coverageIsPartial } from "@/lib/coverage";

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

  const labelingError = await labelUnidentifiedAnalysis(id);
  const graph = await getAnalysisGraph(id);
  const categories = categoryCounts(graph.files, graph.framework);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {coverageIsPartial(graph.coverage) ? (
        <CoverageBanner coverage={graph.coverage} />
      ) : null}
      {labelingError !== null ? (
        <p className="border-b border-border px-3 py-1.5 text-[12px] text-muted">
          {labelingError}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <MapShell
          name={graph.repository}
          framework={frameworkLabel(graph.framework)}
          frameworkId={graph.framework}
          importCount={graph.links.length}
          routeCount={graph.routes.length}
          routes={graph.routes}
          categories={categories}
          files={graph.files}
          links={graph.links}
          analysisId={id}
          tracing={tracingConfigured()}
        />
      </div>
    </div>
  );
}
