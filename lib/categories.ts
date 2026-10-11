// Kind comes from the path. These patterns are the convention; a file they
// don't match stays unidentified. Nothing here reads the file or guesses a role
// the name doesn't state.
export const FILE_CATEGORIES = [
  "jsx",
  "hook",
  "types",
  "test",
  "unidentified",
] as const;

export type FileCategory = (typeof FILE_CATEGORIES)[number];

export type CategoryCount = {
  id: FileCategory;
  label: string;
  count: number;
};

const LABELS: Record<FileCategory, string> = {
  jsx: "JSX",
  hook: "Hook",
  types: "Types",
  test: "Test",
  unidentified: "Unidentified",
};

export function categoryLabel(category: FileCategory): string {
  return LABELS[category];
}

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const HOOK_FILE = /^use[A-Z].*\.[cm]?[jt]sx?$/;
const JSX_FILE = /\.(?:tsx|jsx)$/;

export function categoryOf(filePath: string): FileCategory {
  const segments = filePath.split("/");
  const base = segments[segments.length - 1] ?? filePath;
  if (segments.includes("__tests__") || TEST_FILE.test(base)) return "test";
  if (DECLARATION_FILE.test(base)) return "types";
  if (HOOK_FILE.test(base)) return "hook";
  if (JSX_FILE.test(base)) return "jsx";
  return "unidentified";
}

// Legend order, not rank. Unidentified is last because it is the remainder.
export function categoryCounts(
  files: readonly { path: string }[],
): CategoryCount[] {
  const counts = new Map<FileCategory, number>();
  for (const id of FILE_CATEGORIES) counts.set(id, 0);
  for (const file of files) {
    const id = categoryOf(file.path);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const listed: CategoryCount[] = [];
  for (const id of FILE_CATEGORIES) {
    const count = counts.get(id) ?? 0;
    if (count === 0) continue;
    listed.push({ id, label: LABELS[id], count });
  }
  return listed;
}
