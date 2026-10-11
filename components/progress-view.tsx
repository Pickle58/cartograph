"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AnalysisSummary } from "@/lib/progress";
import {
  analysisChannel,
  PROGRESS_EVENT,
  readProgressEvent,
  STAGE_MESSAGE,
  STAGE_ORDER,
  type AnalysisStage,
  type ProgressEvent,
} from "@/lib/progress";
import { useSupabase } from "@/lib/supabase-browser";

export function ProgressView({ analysis }: { analysis: AnalysisSummary }) {
  const router = useRouter();
  const supabase = useSupabase();
  const [progress, setProgress] = useState<ProgressEvent>({
    stage: analysis.stage,
    message: analysis.stageMessage ?? analysis.failureReason,
    status: analysis.status,
  });

  useEffect(() => {
    if (analysis.status === "complete" || analysis.status === "failed") return;

    const apply = (next: ProgressEvent) => {
      setProgress(next);
      if (next.status === "complete") router.refresh();
    };

    const channel = supabase.channel(analysisChannel(analysis.id), {
      config: { private: true },
    });
    channel.on("broadcast", { event: PROGRESS_EVENT }, (message) => {
      const next = readProgressEvent(message.payload);
      if (next === null) return;
      apply(next);
    });

    void supabase.realtime.setAuth().then(() => {
      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // Catch-up, not a poll: a fast run can finish between render and this
        // subscribe, and that complete event would already have been sent.
        void supabase
          .from("analyses")
          .select("status, stage, stage_message")
          .eq("id", analysis.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data === null) return;
            apply({
              stage: data.stage,
              message: data.stage_message,
              status: data.status,
            });
          });
      });
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [analysis.id, analysis.status, router, supabase]);

  const current = progress.stage;
  const failed = progress.status === "failed";

  return (
    <div className="px-3 py-3">
      <p className="font-mono text-[12px]">{analysis.repository}</p>
      <ol className="mt-3 list-none p-0">
        {STAGE_ORDER.map((stage) => (
          <li
            key={stage}
            className={`py-0.5 text-[12px] ${tone(stage, current, failed)}`}
          >
            {STAGE_MESSAGE[stage]}
          </li>
        ))}
      </ol>
      {failed && progress.message !== null && progress.message.length > 0 ? (
        <p className="mt-3 text-[12px]">{progress.message}</p>
      ) : null}
    </div>
  );
}

function tone(
  stage: AnalysisStage,
  current: AnalysisStage | null,
  failed: boolean,
): string {
  if (current === null) return "text-muted";
  if (stage === current) return failed ? "text-fg" : "text-accent";
  if (STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf(current)) return "text-fg";
  return "text-muted";
}
