"use client";

import { useEffect, useRef, useState } from "react";
import { RepositoryText } from "@/components/explanation-panel";
import {
  ASK_REFUSED,
  ASK_REJECTED,
  ASK_STOPPED,
  ASK_UNAVAILABLE,
  ASK_UNREACHABLE,
  panelEventFromSse,
  takeSseMessages,
  type PanelEvent,
} from "@/lib/ask-events";
import type { MapSelection } from "@/lib/map-scene";

type ToolStep = {
  id: string;
  label: string;
  status: "running" | "done";
};

type Turn = {
  id: string;
  question: string;
  selected: string | null;
  tools: readonly ToolStep[];
  answer: string;
  error: string | null;
  pending: boolean;
};

export function AskPanel({
  analysisId,
  selection,
  paths,
  directories,
}: {
  analysisId: string;
  selection: MapSelection | null;
  paths: readonly string[];
  directories: readonly string[];
}) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [pending, setPending] = useState(false);
  const threadId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const transcript = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const selected = selectionPath(selection);

  useEffect(() => {
    return () => abort.current?.abort();
  }, []);

  useEffect(() => {
    if (!stick.current) return;
    const element = transcript.current;
    if (element === null) return;
    element.scrollTop = element.scrollHeight;
  }, [turns]);

  const question = draft.trim();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={transcript}
        onScroll={rememberStick}
        className="min-h-0 flex-1 overflow-auto"
      >
        {turns.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-muted">
            Ask about files, connections, and routes.
          </p>
        ) : (
          turns.map((turn) => (
            <article key={turn.id} className="border-b border-border">
              <p className="px-3 py-2 text-[12px] break-words">{turn.question}</p>
              {turn.selected !== null ? (
                <p className="px-3 pb-1 font-mono text-[11px] text-muted break-all">{turn.selected}</p>
              ) : null}
              {turn.tools.length > 0 ? (
                <ul className="m-0 list-none p-0">
                  {turn.tools.map((tool) => (
                    <li key={tool.id} className="px-3 py-0.5 font-mono text-[11px] text-muted break-all">
                      {tool.status === "running" ? `${tool.label}…` : tool.label}
                    </li>
                  ))}
                </ul>
              ) : null}
              {turn.pending && turn.tools.length === 0 && turn.answer.length === 0 && turn.error === null ? (
                <p className="px-3 py-1 text-[12px] text-muted">Looking…</p>
              ) : null}
              {turn.answer.length > 0 ? (
                <RepositoryText body={turn.answer} paths={paths} directories={directories} />
              ) : null}
              {turn.error !== null ? (
                <p className="px-3 py-2 text-[12px] text-muted">{turn.error}</p>
              ) : null}
            </article>
          ))
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (question.length === 0 || pending) return;
          setDraft("");
          void send(question, selected);
        }}
        className="flex shrink-0 items-center gap-2 border-t border-border p-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={4000}
          disabled={pending}
          autoComplete="off"
          spellCheck={false}
          placeholder="Ask about this repository"
          aria-label="Question"
          className="min-w-0 flex-1 border border-border bg-surface px-2 py-1 text-[12px] disabled:text-muted"
        />
        <button
          type="submit"
          disabled={pending || question.length === 0}
          className="border border-accent px-2 py-1 text-[11px] text-accent disabled:border-border disabled:text-muted"
        >
          Ask
        </button>
      </form>
    </div>
  );

  function rememberStick(): void {
    const element = transcript.current;
    if (element === null) return;
    stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }

  async function send(message: string, selectedPath: string | null): Promise<void> {
    if (sending.current) return;
    sending.current = true;
    const id = crypto.randomUUID();
    const controller = new AbortController();
    abort.current = controller;
    stick.current = true;
    setPending(true);
    setTurns((current) => [
      ...current,
      { id, question: message, selected: selectedPath, tools: [], answer: "", error: null, pending: true },
    ]);

    try {
      const response = await fetch("/api/agent/ask", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          analysisId,
          threadId: threadId.current,
          message,
          selection,
        }),
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("text/event-stream") || response.body === null) {
        const error = await errorMessage(response);
        updateTurn(id, (turn) => ({ ...settle(turn), error }));
        return;
      }
      await readEvents(response.body, id, controller.signal);
      updateTurn(id, settle);
    } catch (error) {
      if (aborted(error)) return;
      updateTurn(id, (turn) => ({ ...settle(turn), error: ASK_UNREACHABLE }));
    } finally {
      sending.current = false;
      if (abort.current === controller) setPending(false);
    }
  }

  async function readEvents(
    body: ReadableStream<Uint8Array>,
    id: string,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const apply = (event: PanelEvent): void => {
      if (event.type === "thread") {
        threadId.current = event.threadId;
        return;
      }
      updateTurn(id, (turn) => applyEvent(turn, event));
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done || signal.aborted) break;
      buffer += decoder.decode(value, { stream: true });
      const taken = takeSseMessages(buffer);
      buffer = taken.rest;
      for (const message of taken.messages) {
        const event = panelEventFromSse(message);
        if (event !== null) apply(event);
      }
    }
    buffer += decoder.decode();
    const tail = takeSseMessages(`${buffer}\n\n`);
    for (const message of tail.messages) {
      const event = panelEventFromSse(message);
      if (event !== null) apply(event);
    }
  }

  function updateTurn(id: string, apply: (turn: Turn) => Turn): void {
    setTurns((current) => current.map((turn) => (turn.id === id ? apply(turn) : turn)));
  }
}

function applyEvent(turn: Turn, event: PanelEvent): Turn {
  switch (event.type) {
    case "thread":
      return turn;
    case "tool": {
      const existing = turn.tools.some((tool) => tool.id === event.id);
      const tools = existing
        ? turn.tools.map((tool) =>
            tool.id === event.id ? { id: event.id, label: event.label, status: event.status } : tool,
          )
        : [...turn.tools, { id: event.id, label: event.label, status: event.status }];
      return { ...turn, tools };
    }
    case "text":
      return { ...turn, answer: turn.answer + event.delta };
    case "error":
      return { ...turn, error: event.message, pending: false };
    case "done":
      return settle(turn);
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

function settle(turn: Turn): Turn {
  return {
    ...turn,
    pending: false,
    tools: turn.tools.map((tool) =>
      tool.status === "running" ? { ...tool, status: "done" } : tool,
    ),
  };
}

function selectionPath(selection: MapSelection | null): string | null {
  if (selection === null) return null;
  switch (selection.kind) {
    case "file":
      return selection.path;
    case "node":
      return selection.directory;
    default: {
      const unhandled: never = selection;
      throw new Error(`Unhandled selection: ${String(unhandled)}`);
    }
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const parsed: unknown = await response.json();
    if (isRecord(parsed) && typeof parsed.error === "string" && knownError(parsed.error)) {
      return parsed.error;
    }
  } catch {
    // A non-JSON failure is the same as the agent being down.
  }
  if (response.status === 404) return ASK_UNAVAILABLE;
  if (response.status === 400) return ASK_REJECTED;
  return ASK_UNREACHABLE;
}

function knownError(message: string): boolean {
  switch (message) {
    case ASK_UNREACHABLE:
    case ASK_STOPPED:
    case ASK_REFUSED:
    case ASK_UNAVAILABLE:
    case ASK_REJECTED:
      return true;
    default:
      return false;
  }
}

function aborted(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
