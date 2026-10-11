import fs from "node:fs";
import path from "node:path";

import type { FrameworkAdapter } from "./adapter.mts";
import { folderOf, toRepoPath } from "./paths.mts";
import type { ExcludedPath, SkippedFile } from "./types.mts";

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);

// These are not a framework's layout. Installed packages and the version
// control directory are never the repository's own modules.
const STRUCTURAL_EXCLUSIONS: readonly { name: string; reason: string }[] = [
  { name: "node_modules", reason: "installed dependencies" },
  { name: ".git", reason: "version control data" },
];

export const NOT_SOURCE = "not a TypeScript or JavaScript source file";

export type WalkedSource = {
  absolutePath: string;
  path: string;
  folder: string;
};

export type Walk = {
  source: WalkedSource[];
  skipped: SkippedFile[];
  excluded: ExcludedPath[];
};

export function walkRepository(root: string, adapter: FrameworkAdapter): Walk {
  const exclusions = new Map<string, string>();
  for (const entry of STRUCTURAL_EXCLUSIONS) {
    exclusions.set(entry.name, entry.reason);
  }
  for (const entry of adapter.exclusions()) {
    if (!exclusions.has(entry.name)) exclusions.set(entry.name, entry.reason);
  }

  const walk: Walk = { source: [], skipped: [], excluded: [] };
  visit(root, root, exclusions, walk);
  return walk;
}

function visit(
  directory: string,
  root: string,
  exclusions: ReadonlyMap<string, string>,
  walk: Walk,
): void {
  // A directory we can't read fails the whole parse. Skipping it would make
  // the file list look complete when it isn't.
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      // Following a link could leave the repository or count the same file
      // twice. Record it and stop.
      walk.excluded.push({
        path: toRepoPath(root, absolutePath),
        reason: "symbolic link",
      });
      continue;
    }
    if (entry.isDirectory()) {
      const reason = directoryReason(entry.name, exclusions);
      if (reason !== undefined) {
        walk.excluded.push({
          path: toRepoPath(root, absolutePath),
          reason,
        });
        continue;
      }
      visit(absolutePath, root, exclusions, walk);
      continue;
    }
    if (!entry.isFile()) {
      walk.skipped.push({
        path: toRepoPath(root, absolutePath),
        folder: folderOf(toRepoPath(root, absolutePath)),
        reason: "not a file",
      });
      continue;
    }
    const repoPath = toRepoPath(root, absolutePath);
    if (!isSource(entry.name)) {
      walk.skipped.push({
        path: repoPath,
        folder: folderOf(repoPath),
        reason: NOT_SOURCE,
      });
      continue;
    }
    walk.source.push({
      absolutePath,
      path: repoPath,
      folder: folderOf(repoPath),
    });
  }
}

function directoryReason(
  name: string,
  exclusions: ReadonlyMap<string, string>,
): string | undefined {
  const named = exclusions.get(name);
  if (named !== undefined) return named;
  // A leading dot is tool metadata or build output (.git is already named
  // above). Entering it would turn generated files into nodes.
  if (name.startsWith(".")) return "hidden directory";
  return undefined;
}

export function isSourceExtension(extension: string): boolean {
  return SOURCE_EXTENSIONS.has(extension.toLowerCase());
}

function isSource(name: string): boolean {
  return isSourceExtension(path.extname(name));
}
