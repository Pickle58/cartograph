import "server-only";

import { auth } from "@clerk/nextjs/server";
import { relayFromAgent, type AgentRelay } from "@/lib/agent-events";
import { mintAnalysisCredential } from "@/lib/analysis-credential";
import {
  ASK_REFUSED,
  ASK_REJECTED,
  ASK_STOPPED,
  ASK_UNAVAILABLE,
  ASK_UNREACHABLE,
  encodePanelEvent,
  takeSseMessages,
  type PanelEvent,
  type SseMessage,
} from "@/lib/ask-events";

// `mda dev` listens here. AGENT_URL is the deployed agent, when there is one.
const DEFAULT_AGENT_URL = "http://localhost:2024";
const ASSISTANT_ID = "cartograph";
const ANALYSIS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THREAD_ID = ANALYSIS_ID;
const MESSAGE_LIMIT = 4_000;

type AskSelection =
  | { kind: "file"; path: string }
  | { kind: "node"; directory: string };

type AskRequest = {
  analysisId: string;
  threadId: string | null;
  message: string;
  selection: AskSelection | null;
};

// The browser asks this server. This server mints a credential for the one
// analysis the signed-in member can already read, and the agent receives that
// credential on the run. The analysis id is not part of the question.
export async function askRepository(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) return jsonError(ASK_UNAVAILABLE, 401);

  let body: AskRequest;
  try {
    body = await parseAsk(request);
  } catch {
    return jsonError(ASK_REJECTED, 400);
  }

  let credential: string;
  try {
    credential = await mintAnalysisCredential(body.analysisId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Analysis was not found." || message === "Sign in before opening an analysis.") {
      return jsonError(ASK_UNAVAILABLE, 404);
    }
    console.error("Could not mint an analysis credential.");
    return jsonError(ASK_UNAVAILABLE, 500);
  }

  const agent = agentUrl();
  if (agent === null) return jsonError(ASK_UNREACHABLE, 503);

  let threadId: string;
  try {
    threadId = await openThread(agent, userId, body.analysisId, body.threadId, request.signal);
  } catch (error) {
    if (aborted(error)) return new Response(null, { status: 499 });
    return jsonError(agentFailure(error), 502);
  }

  let upstream: Response;
  try {
    upstream = await fetch(new URL(`/threads/${threadId}/runs/stream`, agent), {
      method: "POST",
      headers: agentHeaders(true),
      body: JSON.stringify({
        assistant_id: ASSISTANT_ID,
        input: {
          messages: [{ role: "user", content: modelMessage(body.message, body.selection) }],
        },
        context: { credential },
        stream_mode: ["events"],
        stream_subgraphs: false,
        on_disconnect: "cancel",
      }),
      redirect: "error",
      signal: request.signal,
    });
  } catch (error) {
    if (aborted(error)) return new Response(null, { status: 499 });
    return jsonError(ASK_UNREACHABLE, 502);
  }

  if (!upstream.ok || upstream.body === null) {
    await upstream.body?.cancel();
    return jsonError(upstream.status === 401 || upstream.status === 403 ? ASK_REFUSED : ASK_UNREACHABLE, 502);
  }

  return streamRelay(upstream.body, threadId, credential, body.analysisId, request.signal);
}

function streamRelay(
  body: ReadableStream<Uint8Array>,
  threadId: string,
  credential: string,
  analysisId: string,
  signal: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = new Set<string>();
      const finished = new Set<string>();
      let closed = false;
      const send = (event: PanelEvent): void => {
        if (closed) return;
        const encoded = encodePanelEvent(event);
        if (encoded.includes(credential)) return;
        try {
          controller.enqueue(encoder.encode(encoded));
        } catch {
          closed = true;
        }
      };

      send({ type: "thread", threadId });
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let failed = false;

      const handle = (message: SseMessage): void => {
        for (const relay of relayFromAgent(message)) {
          const event = panelFromRelay(relay, analysisId, started, finished);
          if (event === null) continue;
          if (event.type === "error") failed = true;
          send(event);
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const taken = takeSseMessages(buffer);
          buffer = taken.rest;
          for (const message of taken.messages) handle(message);
        }
        buffer += decoder.decode();
        const tail = takeSseMessages(`${buffer}\n\n`);
        for (const message of tail.messages) handle(message);
        if (!failed) send({ type: "done" });
      } catch (error) {
        if (!aborted(error) && !signal.aborted) send({ type: "error", message: ASK_STOPPED });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      void body.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function panelFromRelay(
  relay: AgentRelay,
  analysisId: string,
  started: Set<string>,
  finished: Set<string>,
): PanelEvent | null {
  switch (relay.type) {
    case "tool":
      if (relay.status === "running") {
        if (started.has(relay.id)) return null;
        started.add(relay.id);
      } else {
        if (finished.has(relay.id)) return null;
        finished.add(relay.id);
      }
      return relay;
    case "text": {
      const delta = relay.delta.replaceAll(analysisId, "");
      if (delta.length === 0) return null;
      return { type: "text", delta };
    }
    case "error":
      return relay;
    default: {
      const unhandled: never = relay;
      return unhandled;
    }
  }
}

async function openThread(
  agent: URL,
  userId: string,
  analysisId: string,
  requested: string | null,
  signal: AbortSignal,
): Promise<string> {
  if (requested !== null && (await threadOwned(agent, requested, userId, analysisId, signal))) {
    return requested;
  }
  const response = await fetch(new URL("/threads", agent), {
    method: "POST",
    headers: agentHeaders(false),
    body: JSON.stringify({
      metadata: { cartograph_user: userId, cartograph_analysis: analysisId },
    }),
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? ASK_REFUSED : ASK_UNREACHABLE);
  const created: unknown = await response.json();
  if (!isRecord(created) || typeof created.thread_id !== "string" || !THREAD_ID.test(created.thread_id)) {
    throw new Error(ASK_UNREACHABLE);
  }
  return created.thread_id;
}

async function threadOwned(
  agent: URL,
  threadId: string,
  userId: string,
  analysisId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const response = await fetch(new URL(`/threads/${threadId}`, agent), {
    headers: agentHeaders(false),
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  if (!response.ok) return false;
  const thread: unknown = await response.json();
  if (!isRecord(thread) || !isRecord(thread.metadata)) return false;
  return thread.metadata.cartograph_user === userId && thread.metadata.cartograph_analysis === analysisId;
}

function modelMessage(message: string, selection: AskSelection | null): string {
  if (selection === null) return message;
  const path = selection.kind === "file" ? selection.path : selection.directory;
  return `${message}\n\nSelected on the map: ${path}`;
}

function agentUrl(): URL | null {
  const raw = process.env.AGENT_URL?.trim();
  const value = raw === undefined || raw.length === 0 ? DEFAULT_AGENT_URL : raw;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function agentHeaders(stream: boolean): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  if (stream) headers.set("accept", "text/event-stream");
  const key = process.env.LANGSMITH_API_KEY?.trim();
  if (key !== undefined && key.length > 0) headers.set("x-api-key", key);
  return headers;
}

function agentFailure(error: unknown): string {
  return error instanceof Error && (error.message === ASK_REFUSED || error.message === ASK_UNREACHABLE)
    ? error.message
    : ASK_UNREACHABLE;
}

async function parseAsk(request: Request): Promise<AskRequest> {
  const parsed: unknown = await request.json();
  if (!isRecord(parsed)) throw new Error(ASK_REJECTED);
  if (typeof parsed.analysisId !== "string" || !ANALYSIS_ID.test(parsed.analysisId)) {
    throw new Error(ASK_REJECTED);
  }
  if (typeof parsed.message !== "string") throw new Error(ASK_REJECTED);
  const message = parsed.message.trim();
  if (message.length === 0 || message.length > MESSAGE_LIMIT) throw new Error(ASK_REJECTED);
  return {
    analysisId: parsed.analysisId,
    threadId: optionalThread(parsed.threadId),
    message,
    selection: selectionFrom(parsed.selection),
  };
}

function optionalThread(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !THREAD_ID.test(value)) throw new Error(ASK_REJECTED);
  return value;
}

function selectionFrom(value: unknown): AskSelection | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error(ASK_REJECTED);
  switch (value.kind) {
    case "file":
      return { kind: "file", path: singleLine(value.path) };
    case "node":
      return { kind: "node", directory: singleLine(value.directory) };
    default:
      throw new Error(ASK_REJECTED);
  }
}

function singleLine(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || /[\r\n\0]/.test(value)) {
    throw new Error(ASK_REJECTED);
  }
  return value;
}

function jsonError(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function aborted(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
