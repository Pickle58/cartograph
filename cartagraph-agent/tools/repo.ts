import { existsSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installAlias } from "./alias-hook.mjs";

let registered = false;

function ensureAlias(): void {
  if (registered) return;
  installAlias();
  register("./alias-hook.mjs", import.meta.url);
  registered = true;
}

export function repoRoot(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (
      existsSync(path.join(directory, "lib", "detail.ts")) &&
      existsSync(path.join(directory, "parser", "roles.mts"))
    ) {
      return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Could not find the cartograph graph modules next to this agent.");
    }
    directory = parent;
  }
}

// Dynamic import so the alias hook is registered before `lib/` loads.
export async function importRepo<T extends object>(relativePath: string): Promise<T> {
  ensureAlias();
  const href = pathToFileURL(path.join(repoRoot(), relativePath)).href;
  return (await import(href)) as T;
}
