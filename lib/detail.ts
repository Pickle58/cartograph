import { categoryCounts, type CategoryCount, type FileCategory } from "@/lib/categories";
import { foldRepository } from "@/lib/fold";
import type { MapFile, MapLink } from "@/lib/map-scene";

// Neighbours are distinct files at either end of an edge. A list's heading
// count is that list's length, so the two cannot disagree. This is the same
// rule the parser uses for fan-in and fan-out.
export type FileDetail = {
  path: string;
  lines: number;
  category: FileCategory;
  dependsOn: readonly string[];
  dependedOn: readonly string[];
};

export type RankedFile = {
  path: string;
  count: number;
};

export type DirectoryDetail = {
  directory: string;
  kinds: readonly CategoryCount[];
};

export type RepositoryDetail = {
  files: ReadonlyMap<string, FileDetail>;
  directories: readonly DirectoryDetail[];
  directoryOf: ReadonlyMap<string, string>;
  fileCount: number;
  unidentified: number;
  leanedOn: readonly RankedFile[];
  unimported: readonly string[];
};

export function repositoryDetail(
  files: readonly MapFile[],
  links: readonly MapLink[],
  framework: string,
): RepositoryDetail {
  const depends = new Map<string, Set<string>>();
  const depended = new Map<string, Set<string>>();
  for (const file of files) {
    depends.set(file.path, new Set());
    depended.set(file.path, new Set());
  }
  for (const link of links) {
    if (!depends.has(link.source) || !depended.has(link.target)) {
      throw new Error(
        `Edge ${link.source} -> ${link.target} does not connect two files`,
      );
    }
    depends.get(link.source)?.add(link.target);
    depended.get(link.target)?.add(link.source);
  }

  const byPath = new Map<string, FileDetail>();
  const leanedOn: RankedFile[] = [];
  const unimported: string[] = [];
  let unidentified = 0;
  for (const file of files) {
    const category = file.role;
    if (category === "unidentified") unidentified += 1;
    const dependsOn = [...(depends.get(file.path) ?? [])].sort(compareText);
    const dependedOn = [...(depended.get(file.path) ?? [])].sort(compareText);
    byPath.set(file.path, {
      path: file.path,
      lines: file.lines,
      category,
      dependsOn,
      dependedOn,
    });
    if (dependedOn.length === 0) unimported.push(file.path);
    else leanedOn.push({ path: file.path, count: dependedOn.length });
  }
  leanedOn.sort(
    (left, right) => right.count - left.count || compareText(left.path, right.path),
  );
  unimported.sort(compareText);

  const fold = foldRepository(files);
  const directoryOf = new Map<string, string>();
  const directories: DirectoryDetail[] = fold.directories.map((directory) => {
    for (const path of directory.files) directoryOf.set(path, directory.directory);
    return {
      directory: directory.directory,
      kinds: categoryCounts(
        directory.files.map((filePath) => {
          const file = byPath.get(filePath);
          if (file === undefined) {
            throw new Error(`File ${filePath} is not in the detail`);
          }
          return { role: file.category };
        }),
        framework,
      ),
    };
  });
  for (const file of files) {
    if (!directoryOf.has(file.path)) {
      throw new Error(`File ${file.path} is not in a folded node`);
    }
  }

  return {
    files: byPath,
    directories,
    directoryOf,
    fileCount: files.length,
    unidentified,
    leanedOn,
    unimported,
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
