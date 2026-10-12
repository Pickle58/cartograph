import "server-only";
import { isTracingEnabled } from "langsmith";
import { traceable } from "langsmith/traceable";
import { wrapOpenAI } from "langsmith/wrappers/openai";
import OpenAI from "openai";

// Dated snapshot, not the `gpt-4.1` alias. The alias moves; the cache key
// would then return an explanation written by a different model.
export const PINNED_MODEL = "gpt-4.1-2025-04-14";

let client: OpenAI | undefined;

// Tracing is optional. A missing key must not look like a quiet success, and
// it must not fail the call either — the pane says when runs are not recorded.
export function tracingConfigured(): boolean {
  const key = process.env.LANGSMITH_API_KEY?.trim() ?? "";
  return key.length > 0 && isTracingEnabled();
}

export function modelConfigured(): boolean {
  return (process.env.OPENAI_API_KEY?.trim() ?? "").length > 0;
}

export function missingModelKey(): string {
  return "Missing environment variable OPENAI_API_KEY. Set it in .env.local and restart.";
}

// The only place the client is constructed. Everywhere else calls through here,
// so a model call cannot skip the wrapper that records the trace.
function aiClient(): OpenAI {
  if (client !== undefined) return client;
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (apiKey.length === 0) throw new Error(missingModelKey());
  const openai = new OpenAI({ apiKey });
  client = tracingConfigured() ? wrapOpenAI(openai) : openai;
  return client;
}

// The callback is the traced run. Callers read the cache inside `run`, so a
// hit is a recorded run with no model call in it.
export async function traced<T>(name: string, run: () => Promise<T>): Promise<T> {
  if (!tracingConfigured()) return run();
  return traceable(run, { name })();
}

export async function completeText(
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const response = await aiClient().chat.completions.create({
    model: PINNED_MODEL,
    temperature: 0,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const text = response.choices[0]?.message.content;
  if (text === null || text === undefined || text.trim() === "") {
    throw new Error("The model returned an empty explanation.");
  }
  return text;
}

export async function completeJson(
  system: string,
  user: string,
  schema: { [key: string]: unknown },
  maxTokens: number,
): Promise<string> {
  const response = await aiClient().chat.completions.create({
    model: PINNED_MODEL,
    temperature: 0,
    max_completion_tokens: maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "file_roles",
        strict: true,
        schema,
      },
    },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const text = response.choices[0]?.message.content;
  if (text === null || text === undefined || text.trim() === "") {
    throw new Error("The model returned no roles.");
  }
  return text;
}
