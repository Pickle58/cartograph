// Every directory starts as a node. From the deepest depth upward, a directory
// holding fewer than `threshold` files merges into its parent. Decisions at one
// depth are taken together, before any of them are applied, so two directories
// at the same depth cannot see each other's merge.
//
// A later threshold starts over from the original tree. The kept result is the
// lowest threshold whose node count is at most a couple of dozen.

const COUPLE = 2;
const READABLE_NODES = 24;

export type FoldedDirectory = {
  directory: string;
  files: readonly string[];
};

export type Fold = {
  threshold: number;
  directories: readonly FoldedDirectory[];
};

export function foldRepository(
  files: readonly { path: string; folder: string }[],
): Fold {
  let threshold = COUPLE;
  let directories = foldAt(files, threshold);
  while (directories.length > READABLE_NODES) {
    threshold += 1;
    directories = foldAt(files, threshold);
    if (threshold > files.length) break;
  }
  return { threshold, directories };
}

export function foldAt(
  files: readonly { path: string; folder: string }[],
  threshold: number,
): FoldedDirectory[] {
  const tree = collectDirectories(files);
  const held = new Map<string, string[]>();
  for (const directory of tree) held.set(directory, []);
  for (const file of files) {
    const folder = file.folder.length === 0 ? "." : file.folder;
    const list = held.get(folder);
    if (list === undefined) {
      throw new Error(`Folder ${folder} is missing from the directory tree`);
    }
    list.push(file.path);
  }

  const depthOf = new Map<string, number>();
  let maxDepth = 0;
  for (const directory of tree) {
    const depth = directory === "." ? 0 : directory.split("/").length;
    depthOf.set(directory, depth);
    if (depth > maxDepth) maxDepth = depth;
  }

  const merged = new Set<string>();
  for (let depth = maxDepth; depth >= 1; depth -= 1) {
    const merging = tree.filter((directory) => {
      if (merged.has(directory)) return false;
      if (depthOf.get(directory) !== depth) return false;
      return (held.get(directory)?.length ?? 0) < threshold;
    });
    for (const directory of merging) {
      const parent = parentDirectory(directory);
      const combined = [
        ...(held.get(parent) ?? []),
        ...(held.get(directory) ?? []),
      ];
      combined.sort();
      held.set(parent, combined);
      merged.add(directory);
    }
  }

  const directories: FoldedDirectory[] = [];
  for (const directory of tree) {
    if (merged.has(directory)) continue;
    const owned = [...(held.get(directory) ?? [])].sort();
    if (owned.length === 0) continue;
    directories.push({ directory, files: owned });
  }
  return directories;
}

function collectDirectories(
  files: readonly { folder: string }[],
): string[] {
  const directories = new Set<string>(["."]);
  for (const file of files) {
    let current = file.folder.length === 0 ? "." : file.folder;
    while (true) {
      directories.add(current);
      if (current === ".") break;
      current = parentDirectory(current);
    }
  }
  return [...directories].sort();
}

function parentDirectory(directory: string): string {
  const slash = directory.lastIndexOf("/");
  return slash === -1 ? "." : directory.slice(0, slash);
}
