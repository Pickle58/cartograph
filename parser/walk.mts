import fs from "node:fs";
import path from "node:path";
import type { DirectoryExclusion } from "./adapter.mts";
import type { ExcludedPath, SkippedFile } from "./types.mts";

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

// These are not modules of the repository. The adapter does not know about
// them; every walk skips them and says so.
const STRUCTURAL_EXCLUSIONS: readonly DirectoryExclusion[] = [
  { name: "node_modules", reason: "dependency directory" },
  { name: ".git", reason: "version control directory" },
];

export type WalkedRepository = {
  parsed: string[];
  skipped: SkippedFile[];
  excluded: ExcludedPath[];
};

export function walkRepository(
  root: string,
  exclusions: readonly DirectoryExclusion[],
): WalkedRepository {
  const parsed: string[] = [];
  const skipped: SkippedFile[] = [];
  const excluded: ExcludedPath[] = [];
  const rules = [...STRUCTURAL_EXCLUSIONS, ...exclusions];

  visit(root, root, rules, parsed, skipped, excluded);

  parsed.sort();
  skipped.sort((left, right) => comparePath(left.path, right.path));
  excluded.sort((left, right) => comparePath(left.path, right.path));
  return { parsed, skipped, excluded };
}

function visit(
  root: string,
  directory: string,
  rules: readonly DirectoryExclusion[],
  parsed: string[],
  skipped: SkippedFile[],
  excluded: ExcludedPath[],
): void {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  entries.sort((left, right) => comparePath(left.name, right.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(directory, entry.name);
    const relative = repoPath(root, absolute);

    if (entry.isDirectory()) {
      const rule = rules.find((item) => item.name === entry.name);
      if (rule) {
        excluded.push({ path: relative, reason: rule.reason });
        continue;
      }
      visit(root, absolute, rules, parsed, skipped, excluded);
      continue;
    }

    if (!entry.isFile()) continue;
    if (isSourceFile(entry.name)) {
      parsed.push(relative);
      continue;
    }
    skipped.push({
      path: relative,
      folder: folderOf(relative),
      reason: skipReason(entry.name),
    });
  }
}

function isSourceFile(name: string): boolean {
  const extension = path.extname(name);
  return SOURCE_EXTENSIONS.has(extension);
}

function skipReason(name: string): string {
  const extension = path.extname(name);
  if (extension.length === 0) return "not TypeScript or JavaScript (no extension)";
  return `not TypeScript or JavaScript (${extension})`;
}

export function folderOf(filePath: string): string {
  const folder = path.posix.dirname(filePath);
  return folder === "" ? "." : folder;
}

function repoPath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function comparePath(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
