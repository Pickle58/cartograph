import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// Next loads these itself. A plain `node` script does not, so evals and the
// analysis script would otherwise see an empty environment unless someone
// remembered a flag. Same order Next uses, and a variable already set in the
// shell is left alone — `loadEnvFile` does not override.
export function loadScriptEnv(): void {
  const mode = process.env.NODE_ENV ?? "development";
  const names = [
    `.env.${mode}.local`,
    ...(mode === "test" ? [] : [".env.local"]),
    `.env.${mode}`,
    ".env",
  ];
  const root = projectRoot(path.dirname(fileURLToPath(import.meta.url)));
  for (const name of names) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    loadEnvFile(file);
  }
}

function projectRoot(start: string): string {
  let directory = start;
  for (;;) {
    if (fs.existsSync(path.join(directory, "package.json"))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Could not find package.json to load the environment.");
    }
    directory = parent;
  }
}
