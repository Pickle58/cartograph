import { MODEL_ROLE_IDS } from "../parser/roles.mts";

export const ROLE_EXCERPT = 2_000;

// Same batch the classifier sends. The eval asks the question production asks.
export const ROLE_BATCH = 8;

export const ROLE_SCHEMA: { [key: string]: unknown } = {
  type: "object",
  additionalProperties: false,
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          role: { type: "string", enum: [...MODEL_ROLE_IDS] },
        },
        required: ["path", "role"],
      },
    },
  },
  required: ["assignments"],
};

export function roleSystemPrompt(): string {
  return `You label source files. For each file, choose one role. The only roles are: ${MODEL_ROLE_IDS.join(", ")}. Never use page, route, controller, or any other role. Use only the path and the source you are shown. Do not invent files.`;
}

export function roleUserPrompt(files: readonly { path: string; source: string }[]): string {
  return files.map((file) => `File: ${file.path}\n${file.source}`).join("\n\n");
}

export function sourceExcerpt(bytes: Buffer): string | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  if (text.length <= ROLE_EXCERPT) return text;
  return `${text.slice(0, ROLE_EXCERPT)}\n[${text.length - ROLE_EXCERPT} characters omitted]`;
}

export function parseAssignments(text: string): Map<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The model did not return JSON.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("assignments" in value) ||
    !Array.isArray(value.assignments)
  ) {
    throw new Error("The model did not return role assignments.");
  }
  const roles = new Map<string, string>();
  for (const entry of value.assignments) {
    if (typeof entry !== "object" || entry === null) continue;
    if (!("path" in entry) || !("role" in entry)) continue;
    if (typeof entry.path !== "string" || typeof entry.role !== "string") continue;
    roles.set(entry.path, entry.role);
  }
  return roles;
}
