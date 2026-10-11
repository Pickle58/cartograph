import { Suspense } from "react";
import { getActiveOrganization } from "@/lib/organization";

export default function WorkspacePage() {
  return (
<<<<<<< Updated upstream
    <div className="p-3">
      {/* Reading the session is request-time, so it streams in behind this
          boundary as part of the same HTML response. */}
      <Suspense fallback={null}>
        <ActiveOrganization />
      </Suspense>
=======
    // The list depends on the session token, so it's request-time and streams
    // in behind this boundary as part of the same HTML response.
    <Suspense fallback={null}>
      <Analyses />
    </Suspense>
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
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Analyses in {organization.name}</caption>
        <thead className="text-[11px] text-muted">
          <tr>
            {/* Width 1% plus nowrap makes these columns hug their content;
                the reason column takes whatever is left. */}
            <th className="sticky top-0 w-[1%] border-b border-border bg-surface px-3 py-1.5 font-normal whitespace-nowrap">
              Repository
            </th>
            <th className="sticky top-0 w-[1%] border-b border-border bg-surface px-3 py-1.5 font-normal whitespace-nowrap">
              Status
            </th>
            <th className="sticky top-0 w-[1%] border-b border-border bg-surface px-3 py-1.5 font-normal whitespace-nowrap">
              Commit
            </th>
            <th className="sticky top-0 w-[1%] border-b border-border bg-surface px-3 py-1.5 font-normal whitespace-nowrap">
              Started
            </th>
            <th className="sticky top-0 border-b border-border bg-surface px-3 py-1.5 font-normal">
              Reason
            </th>
          </tr>
        </thead>
        <tbody>
          {analyses.map((analysis) => (
            <AnalysisRow key={analysis.id} analysis={analysis} />
          ))}
        </tbody>
      </table>
>>>>>>> Stashed changes
    </div>
  );
}

async function ActiveOrganization() {
  const organization = await getActiveOrganization();

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="text-muted">Organization</dt>
      <dd>{organization.name}</dd>
      <dt className="text-muted">ID</dt>
      <dd className="font-mono text-[12px]">{organization.id}</dd>
    </dl>
  );
}
