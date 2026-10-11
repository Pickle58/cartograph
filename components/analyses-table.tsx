"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AnalysisSummary } from "@/lib/progress";
import {
  analysisChannel,
  isStale,
  PROGRESS_EVENT,
  readProgressEvent,
} from "@/lib/progress";
import { useSupabase } from "@/lib/supabase-browser";

export function AnalysesTable({
  organizationName,
  analyses: initial,
}: {
  organizationName: string;
  analyses: AnalysisSummary[];
}) {
  const router = useRouter();
  const supabase = useSupabase();
  const [patches, setPatches] = useState<Record<string, Partial<AnalysisSummary>>>(
    {},
  );
  const [, setTick] = useState(0);
  const analyses = initial.map((row) => {
    const patch = patches[row.id];
    return patch === undefined ? row : { ...row, ...patch };
  });
  const unfinished = analyses.some(
    (row) => row.status === "queued" || row.status === "running",
  );

  useEffect(() => {
    if (!unfinished) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [unfinished]);

  useEffect(() => {
    const live = initial.filter(
      (row) => row.status === "queued" || row.status === "running",
    );
    if (live.length === 0) return;

    const apply = (
      id: string,
      next: {
        status: AnalysisSummary["status"];
        stage: AnalysisSummary["stage"];
        stageMessage: string | null;
        updatedAt: string;
        failureReason?: string | null;
      },
    ) => {
      setPatches((current) => ({
        ...current,
        [id]: {
          status: next.status,
          stage: next.stage,
          stageMessage: next.stageMessage,
          updatedAt: next.updatedAt,
          ...(next.status === "failed"
            ? { failureReason: next.failureReason ?? next.stageMessage }
            : {}),
        },
      }));
      if (next.status === "complete" || next.status === "failed") {
        router.refresh();
      }
    };

    const channels = live.map((row) => {
      const channel = supabase.channel(analysisChannel(row.id), {
        config: { private: true },
      });
      channel.on("broadcast", { event: PROGRESS_EVENT }, (message) => {
        const next = readProgressEvent(message.payload);
        if (next === null) return;
        apply(row.id, {
          status: next.status,
          stage: next.stage,
          stageMessage: next.message,
          updatedAt: new Date().toISOString(),
          failureReason: next.message,
        });
      });
      return { id: row.id, channel };
    });

    void supabase.realtime.setAuth().then(() => {
      for (const { id, channel } of channels) {
        channel.subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          void supabase
            .from("analyses")
            .select("status, stage, stage_message, failure_reason, updated_at")
            .eq("id", id)
            .maybeSingle()
            .then(({ data }) => {
              if (data === null) return;
              apply(id, {
                status: data.status,
                stage: data.stage,
                stageMessage: data.stage_message,
                updatedAt: data.updated_at,
                failureReason: data.failure_reason,
              });
            });
        });
      }
    });

    return () => {
      for (const { channel } of channels) void supabase.removeChannel(channel);
    };
  }, [initial, router, supabase]);

  return (
    <div className="h-full min-h-0 overflow-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Analyses in {organizationName}</caption>
        <thead className="text-[11px] text-muted">
          <tr>
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
  const status = statusPresentation(analysis);

  return (
    <tr className="border-b border-border">
      <td className="px-3 py-1.5 font-mono text-[12px] whitespace-nowrap">
        <Link href={`/analyses/${analysis.id}`} className="hover:text-accent">
          {analysis.repository}
        </Link>
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

function statusPresentation(analysis: AnalysisSummary): {
  label: string;
  mark: string;
  tone: string;
} {
  if (isStale(analysis.status, analysis.updatedAt)) {
    return { label: "Stale", mark: "border border-muted", tone: "text-muted" };
  }
  switch (analysis.status) {
    case "queued":
      return {
        label: "Queued",
        mark: "border border-muted",
        tone: "text-muted",
      };
    case "running":
      return {
        label: analysis.stageMessage ?? "Running",
        mark: "bg-accent",
        tone: "text-accent",
      };
    case "complete":
      return { label: "Complete", mark: "bg-fg", tone: "" };
    case "failed":
      return { label: "Failed", mark: "border border-fg", tone: "" };
    default: {
      const unhandled: never = analysis.status;
      throw new Error(`Unhandled analysis status: ${String(unhandled)}`);
    }
  }
}

function formatTimestamp(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
