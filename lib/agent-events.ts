import { ASK_STOPPED, type SseMessage } from "@/lib/ask-events";

// Chain events include the run context, and the context holds the credential.
// Only a tool the graph owns, and text from the model node, leave this file.

const TOOLS = [
  "analysis_summary",
  "search_files",
  "files_by_role",
  "file_neighbours",
  "walk_graph",
  "route_table",
] as const;

type ToolName = (typeof TOOLS)[number];

const MODEL_NODE = "model_request";

export type AgentRelay =
  | { type: "tool"; id: string; label: string; status: "running" | "done" }
  | { type: "text"; delta: string }
  | { type: "error"; message: string };

export function relayFromAgent(message: SseMessage): AgentRelay[] {
  if (message.event === "error") return [{ type: "error", message: ASK_STOPPED }];
  if (message.event !== "events" && !message.event.startsWith("events|")) return [];

  let payload: unknown;
  try {
    payload = JSON.parse(message.data);
  } catch {
    return [];
  }
  if (!isRecord(payload) || typeof payload.event !== "string") return [];

  switch (payload.event) {
    case "on_tool_start":
      return toolRelay(payload, "running");
    case "on_tool_end":
      return toolRelay(payload, "done");
    case "on_chat_model_stream":
      return textRelay(payload);
    default:
      return [];
  }
}

function toolRelay(payload: Record<string, unknown>, status: "running" | "done"): AgentRelay[] {
  if (typeof payload.name !== "string" || !isToolName(payload.name)) return [];
  if (typeof payload.run_id !== "string" || !isRunId(payload.run_id)) return [];
  const label = toolLabel(payload.name, toolInput(payload.data));
  return [{ type: "tool", id: payload.run_id, label, status }];
}

function textRelay(payload: Record<string, unknown>): AgentRelay[] {
  if (!isRecord(payload.metadata) || payload.metadata.langgraph_node !== MODEL_NODE) return [];
  if (!isRecord(payload.data)) return [];
  const delta = textFromContent(payload.data.chunk);
  if (delta.length === 0) return [];
  return [{ type: "text", delta }];
}

function toolLabel(name: ToolName, input: unknown): string {
  switch (name) {
    case "analysis_summary":
      return "Summary";
    case "search_files":
      return withDetail("Search files for", field(input, "query"));
    case "files_by_role":
      return withDetail("Files with role", field(input, "role"));
    case "file_neighbours":
      return withDetail("Neighbours of", field(input, "path"));
    case "walk_graph":
      return walkLabel(field(input, "path"), field(input, "direction"));
    case "route_table":
      return "Route table";
    default: {
      const unhandled: never = name;
      return unhandled;
    }
  }
}

function walkLabel(path: string | null, direction: string | null): string {
  if (path === null) return "Walk";
  switch (direction) {
    case "dependencies":
      return `Dependency chain from ${path}`;
    case "dependents":
      return `Blast radius from ${path}`;
    default:
      return `Walk from ${path}`;
  }
}

function withDetail(label: string, detail: string | null): string {
  return detail === null ? label : `${label} ${detail}`;
}

function field(input: unknown, key: string): string | null {
  if (!isRecord(input)) return null;
  const value = input[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 300 || /[\r\n\0]/.test(trimmed)) return null;
  return trimmed;
}

function toolInput(data: unknown): unknown {
  if (!isRecord(data)) return null;
  const input = data.input;
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function textFromContent(chunk: unknown): string {
  if (!isRecord(chunk)) return "";
  return textFromBlocks(chunk.content);
}

function textFromBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content) {
    if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
    text += block.text;
  }
  return text;
}

function isToolName(name: string): name is ToolName {
  return (TOOLS as readonly string[]).includes(name);
}

function isRunId(value: string): boolean {
  return /^[A-Za-z0-9-]{1,80}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
