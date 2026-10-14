import type { ManagedToolRuntime } from "managed-deepagents";

import type { AskContext } from "./context.ts";
import { loadCanvas } from "./canvas.ts";
import { parseSnapshot, type AnalysisSnapshot } from "./snapshot.ts";

const SNAPSHOT_PATH = "/api/agent/snapshot";

const pending = new Map<string, Promise<AnalysisSnapshot>>();

export async function answerWithAnalysis(
  runtime: ManagedToolRuntime<unknown, AskContext>,
  answer: (snapshot: AnalysisSnapshot) => Promise<string>,
): Promise<string> {
  const credential = runtime.context?.credential;
  if (credential === undefined || credential.length === 0) {
    return "There is no analysis to read on this run.";
  }
  try {
    const snapshot = await loadSnapshot(credential);
    return await answer(snapshot);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error(`Could not read the analysis: ${detail}`);
    return "The analysis could not be read.";
  }
}

async function loadSnapshot(credential: string): Promise<AnalysisSnapshot> {
  const existing = pending.get(credential);
  if (existing !== undefined) return existing;
  const request = fetchSnapshot(credential).catch((error: unknown) => {
    pending.delete(credential);
    throw error;
  });
  pending.set(credential, request);
  return request;
}

async function fetchSnapshot(credential: string): Promise<AnalysisSnapshot> {
  const base = process.env.CARTOGRAPH_URL;
  if (base === undefined || base.length === 0) {
    throw new Error("CARTOGRAPH_URL is not set.");
  }
  const response = await fetch(new URL(SNAPSHOT_PATH, base), {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${credential}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Analysis read failed with status ${response.status}.`);
  }
  const canvas = await loadCanvas();
  return parseSnapshot(await response.json(), (role) => canvas.isRoleId(role));
}
