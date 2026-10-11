import type { Database } from "@/types/database";

export type AnalysisStage = Database["public"]["Enums"]["analysis_stage"];
export type AnalysisStatus = Database["public"]["Enums"]["analysis_status"];

export type ProgressEvent = {
  stage: AnalysisStage | null;
  message: string | null;
  status: AnalysisStatus;
};

export type AnalysisSummary = {
  id: string;
  repository: string;
  status: AnalysisStatus;
  stage: AnalysisStage | null;
  stageMessage: string | null;
  commitSha: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export const STAGE_ORDER: readonly AnalysisStage[] = [
  "fetch",
  "select",
  "parse",
  "store",
];

export const STAGE_MESSAGE: Record<AnalysisStage, string> = {
  fetch: "Fetching the repository",
  select: "Selecting files",
  parse: "Parsing",
  store: "Saving",
};

const STATUSES: readonly AnalysisStatus[] = [
  "queued",
  "running",
  "complete",
  "failed",
];

export const ANALYSIS_CHANNEL_PREFIX = "analysis:";
export const PROGRESS_EVENT = "progress";

export function analysisChannel(id: string): string {
  return `${ANALYSIS_CHANNEL_PREFIX}${id}`;
}

export function readProgressEvent(value: unknown): ProgressEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const status = STATUSES.find((entry) => entry === record.status);
  if (status === undefined) return null;
  const stageValue = record.stage;
  const stage =
    stageValue === null
      ? null
      : STAGE_ORDER.find((entry) => entry === stageValue);
  if (stage === undefined) return null;
  const message = record.message;
  if (message !== null && typeof message !== "string") return null;
  return { stage, message, status };
}

export const STALE_AFTER_MS = 3 * 60 * 1000;

export function isStale(
  status: AnalysisStatus,
  updatedAt: string,
  now = Date.now(),
): boolean {
  if (status === "complete" || status === "failed") return false;
  const updated = Date.parse(updatedAt);
  if (!Number.isFinite(updated)) return false;
  return now - updated > STALE_AFTER_MS;
}
