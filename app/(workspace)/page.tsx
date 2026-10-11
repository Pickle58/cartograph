import { Suspense } from "react";
import {
  listAnalyses,
  type AnalysisStatus,
  type AnalysisSummary,
} from "@/lib/analyses";
import { getActiveOrganization } from "@/lib/organization";

export default function DashboardPage() {
  return (
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
    </div>
  );
}

function AnalysisRow({ analysis }: { analysis: AnalysisSummary }) {
  const status = statusPresentation(analysis.status);

  return (
    <tr className="border-b border-border">
      <td className="px-3 py-1.5 font-mono text-[12px] whitespace-nowrap">
        {analysis.repository}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <span className={`inline-flex items-center gap-2 ${status.tone}`}>
          <span aria-hidden className={`size-[7px] shrink-0 ${status.mark}`} />
          {status.label}
        </span>
      </td>
      <td className="px-3 py-1.5 font-mono text-[12px] whitespace-nowrap text-muted">
        {analysis.commitSha?.slice(0, 7) ?? "—"}
      </td>
      <td className="px-3 py-1.5 font-mono text-[12px] whitespace-nowrap text-muted tabular-nums">
        {formatTimestamp(analysis.createdAt)}
      </td>
      <td className="px-3 py-1.5 text-muted">{analysis.failureReason}</td>
    </tr>
  );
}

// Running is the only coloured status: it's the row still in progress. The
// others stay greyscale, since green and amber are reserved for edge direction.
function statusPresentation(status: AnalysisStatus): {
  label: string;
  mark: string;
  tone: string;
} {
  switch (status) {
    case "queued":
      return {
        label: "Queued",
        mark: "border border-muted",
        tone: "text-muted",
      };
    case "running":
      return { label: "Running", mark: "bg-accent", tone: "text-accent" };
    case "complete":
      return { label: "Complete", mark: "bg-fg", tone: "" };
    case "failed":
      return { label: "Failed", mark: "border border-fg", tone: "" };
    default: {
      const unhandled: never = status;
      throw new Error(`Unhandled analysis status: ${String(unhandled)}`);
    }
  }
}

// Rendered on the server, so it's in UTC rather than a timezone guessed from
// the server's locale.
function formatTimestamp(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
