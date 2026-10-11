import fs from "node:fs";
import path from "node:path";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"] as const;

// A declared dependency, read from the root manifest. An unreadable manifest
// matches nothing: a parse error is not evidence of a framework.
export function manifestDependsOn(root: string, name: string): boolean {
  const file = path.join(root, "package.json");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return false;
  }
  const record = asRecord(parsed);
  if (record === undefined) return false;
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = asRecord(record[field]);
    if (dependencies === undefined) continue;
    if (typeof dependencies[name] === "string") return true;
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
