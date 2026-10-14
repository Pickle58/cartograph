// Events the browser is allowed to see. The agent stream also carries the
// analysis id and the credential; those never become one of these.

export const ASK_UNREACHABLE = "The agent is unreachable. The map still works.";
export const ASK_STOPPED = "The agent stopped before it finished.";
export const ASK_REFUSED = "The agent refused the request.";
export const ASK_UNAVAILABLE = "This analysis is not available.";
export const ASK_REJECTED = "That question could not be sent.";

const KNOWN_ERRORS = new Set<string>([
  ASK_UNREACHABLE,
  ASK_STOPPED,
  ASK_REFUSED,
  ASK_UNAVAILABLE,
  ASK_REJECTED,
]);

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PanelEvent =
  | { type: "thread"; threadId: string }
  | { type: "tool"; id: string; label: string; status: "running" | "done" }
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type SseMessage = { event: string; data: string };

export function takeSseMessages(buffer: string): { messages: SseMessage[]; rest: string } {
  const normalized = buffer.replaceAll("\r\n", "\n");
  const chunks = normalized.split("\n\n");
  const rest = chunks.pop() ?? "";
  const messages: SseMessage[] = [];
  for (const chunk of chunks) {
    const message = sseMessage(chunk);
    if (message !== null) messages.push(message);
  }
  return { messages, rest };
}

export function encodePanelEvent(event: PanelEvent): string {
  switch (event.type) {
    case "thread":
      return frame("thread", { threadId: event.threadId });
    case "tool":
      return frame("tool", { id: event.id, label: event.label, status: event.status });
    case "text":
      return frame("text", { delta: event.delta });
    case "error":
      return frame("error", { message: event.message });
    case "done":
      return frame("done", {});
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

export function panelEventFromSse(message: SseMessage): PanelEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.data);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  switch (message.event) {
    case "thread":
      return typeof parsed.threadId === "string" && THREAD_ID.test(parsed.threadId)
        ? { type: "thread", threadId: parsed.threadId }
        : null;
    case "tool":
      if (typeof parsed.id !== "string" || typeof parsed.label !== "string") return null;
      if (parsed.id.length === 0 || parsed.id.length > 80 || parsed.label.length > 400) return null;
      if (parsed.status !== "running" && parsed.status !== "done") return null;
      return { type: "tool", id: parsed.id, label: parsed.label, status: parsed.status };
    case "text":
      if (typeof parsed.delta !== "string" || parsed.delta.length === 0) return null;
      return { type: "text", delta: parsed.delta.slice(0, 20_000) };
    case "error":
      return {
        type: "error",
        message: typeof parsed.message === "string" && KNOWN_ERRORS.has(parsed.message)
          ? parsed.message
          : ASK_STOPPED,
      };
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}

function frame(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseMessage(chunk: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.length === 0 || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) data.push(line.slice("data:".length).replace(/^ /, ""));
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
