import path from "node:path";

export function isInsideRoot(root: string, absolutePath: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(absolutePath));
  if (relative.length === 0 || path.isAbsolute(relative)) return false;
  // A directory named "..foo" is inside the root. Only a ".." segment leaves it.
  return relative.split(path.sep).every((segment) => segment !== "..");
}

export function toRepoPath(root: string, absolutePath: string): string {
  if (!isInsideRoot(root, absolutePath)) {
    throw new Error(`Path is outside the repository: ${absolutePath}`);
  }
  const relative = path.relative(path.resolve(root), path.resolve(absolutePath));
  const repoPath = relative.split(path.sep).join("/");
  if (repoPath.length === 0 || repoPath.includes("\\")) {
    throw new Error(`Could not make a repository path for: ${absolutePath}`);
  }
  return repoPath;
}

// The folder is the file's own parent, not the top-level directory. Later
// phases group by this value, and collapsing it here would glue unrelated
// files together.
export function folderOf(repoPath: string): string {
  const parent = path.posix.dirname(repoPath);
  return parent === "." ? "." : parent;
}

// Lookup key only. Windows paths for the same file differ by case, and the
// key never appears in the output.
export function pathKey(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
