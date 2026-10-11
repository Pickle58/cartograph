export type HoverTarget =
  | { kind: "file"; path: string }
  | { kind: "directory"; directory: string };

export function sameHover(left: HoverTarget | null, right: HoverTarget | null): boolean {
  if (left === null || right === null) return left === right;
  switch (left.kind) {
    case "file":
      return right.kind === "file" && left.path === right.path;
    case "directory":
      return right.kind === "directory" && left.directory === right.directory;
    default: {
      const unhandled: never = left;
      throw new Error(`Unhandled hover: ${String(unhandled)}`);
    }
  }
}

export function filePathFrom(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const row = target.closest("[data-file-path]");
  if (!(row instanceof HTMLElement)) return null;
  const path = row.dataset.filePath;
  if (path === undefined || path.length === 0) return null;
  return path;
}

export function pathIsHighlighted(
  path: string,
  hover: HoverTarget | null,
  directoryOf: ReadonlyMap<string, string>,
): boolean {
  if (hover === null) return false;
  switch (hover.kind) {
    case "file":
      return hover.path === path;
    case "directory":
      return directoryOf.get(path) === hover.directory;
    default: {
      const unhandled: never = hover;
      throw new Error(`Unhandled hover: ${String(unhandled)}`);
    }
  }
}

// A file inside a closed folder has no row, so the folder lights up instead.
export function nodeIsHighlighted(
  directory: string,
  open: boolean,
  hover: HoverTarget | null,
  directoryOf: ReadonlyMap<string, string>,
): boolean {
  if (hover === null) return false;
  switch (hover.kind) {
    case "directory":
      return hover.directory === directory;
    case "file":
      if (open) return false;
      return directoryOf.get(hover.path) === directory;
    default: {
      const unhandled: never = hover;
      throw new Error(`Unhandled hover: ${String(unhandled)}`);
    }
  }
}

export function hoveredFilePath(hover: HoverTarget | null): string | null {
  if (hover === null) return null;
  switch (hover.kind) {
    case "file":
      return hover.path;
    case "directory":
      return null;
    default: {
      const unhandled: never = hover;
      throw new Error(`Unhandled hover: ${String(unhandled)}`);
    }
  }
}
