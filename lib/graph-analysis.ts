import { isFrameworkEntry } from "@/lib/categories";
import type { MapFile, MapLink } from "@/lib/map-scene";

export type WalkDirection = "dependencies" | "dependents";

export type Insight =
  | { kind: "unimported"; paths: readonly [string] }
  | { kind: "high-fan-in"; paths: readonly [string] }
  | { kind: "cycle"; paths: readonly string[] }
  | { kind: "oversized"; paths: readonly [string] };

export const INSIGHT_SENTENCES: Record<Insight["kind"], string> = {
  unimported: "Nothing imports this file.",
  "high-fan-in": "An unusual number of files import this file.",
  cycle: "These files form an import cycle.",
  oversized: "This file is over 500 lines long.",
};

const DEFAULT_DEPTH = 2;
const MAX_FILE_LINES = 500;

export function walkGraph(
  start: string,
  links: readonly MapLink[],
  direction: WalkDirection,
  depth = DEFAULT_DEPTH,
): string[] {
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error("Graph walk depth must be a non-negative integer");
  }

  const adjacent = new Map<string, Set<string>>();
  for (const link of links) {
    const from = direction === "dependencies" ? link.source : link.target;
    const to = direction === "dependencies" ? link.target : link.source;
    addAdjacent(adjacent, from, to);
  }

  const visited = new Set([start]);
  let frontier = [start];
  const result: string[] = [];
  for (let level = 0; level < depth && frontier.length > 0; level += 1) {
    const next: string[] = [];
    for (const path of frontier) {
      for (const neighbour of adjacent.get(path) ?? []) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        result.push(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return result.sort(compareText);
}

export function graphInsights(
  files: readonly MapFile[],
  links: readonly MapLink[],
): Insight[] {
  const fanIn = new Map(files.map((file) => [file.path, 0]));
  for (const link of distinctLinks(links)) {
    const count = fanIn.get(link.target);
    if (count !== undefined) fanIn.set(link.target, count + 1);
  }

  const unusualThreshold = upperOutlierThreshold([...fanIn.values()]);
  const unimported: Insight[] = [];
  const highlyImported: Insight[] = [];
  const oversized: Insight[] = [];
  for (const file of [...files].sort((left, right) => compareText(left.path, right.path))) {
    const imports = fanIn.get(file.path) ?? 0;
    if (imports === 0 && !isImplicitEntrypoint(file)) {
      unimported.push({ kind: "unimported", paths: [file.path] });
    }
    if (imports > 0 && imports > unusualThreshold) {
      highlyImported.push({ kind: "high-fan-in", paths: [file.path] });
    }
    if (file.lines > MAX_FILE_LINES) {
      oversized.push({ kind: "oversized", paths: [file.path] });
    }
  }

  const cycles: Insight[] = importCycles(files, links).map((paths) => ({
    kind: "cycle",
    paths,
  }));
  return [...unimported, ...highlyImported, ...cycles, ...oversized];
}

function importCycles(
  files: readonly MapFile[],
  links: readonly MapLink[],
): readonly string[][] {
  const paths = files.map((file) => file.path).sort(compareText);
  const known = new Set(paths);
  const adjacent = adjacency(paths, links, false);
  const reverse = adjacency(paths, links, true);
  const finishOrder: string[] = [];
  const visited = new Set<string>();

  for (const start of paths) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: { path: string; next: number }[] = [{ path: start, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbours = adjacent.get(frame.path) ?? [];
      if (frame.next < neighbours.length) {
        const neighbour = neighbours[frame.next];
        frame.next += 1;
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          stack.push({ path: neighbour, next: 0 });
        }
      } else {
        finishOrder.push(frame.path);
        stack.pop();
      }
    }
  }

  const assigned = new Set<string>();
  const components: string[][] = [];
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const start = finishOrder[index];
    if (assigned.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length > 0) {
      const path = stack.pop();
      if (path === undefined) continue;
      component.push(path);
      for (const neighbour of reverse.get(path) ?? []) {
        if (!assigned.has(neighbour)) {
          assigned.add(neighbour);
          stack.push(neighbour);
        }
      }
    }
    if (
      component.length > 1 ||
      (component.length === 1 &&
        distinctLinks(links).some(
          (link) =>
            known.has(link.source) &&
            link.source === component[0] &&
            link.target === component[0],
        ))
    ) {
      components.push(component.sort(compareText));
    }
  }
  return components.sort((left, right) => compareText(left[0], right[0]));
}

function adjacency(
  paths: readonly string[],
  links: readonly MapLink[],
  reversed: boolean,
): Map<string, string[]> {
  const known = new Set(paths);
  const collected = new Map(paths.map((path) => [path, new Set<string>()]));
  for (const link of distinctLinks(links)) {
    if (!known.has(link.source) || !known.has(link.target)) continue;
    const from = reversed ? link.target : link.source;
    const to = reversed ? link.source : link.target;
    collected.get(from)?.add(to);
  }
  return new Map(
    [...collected].map(([path, neighbours]) => [
      path,
      [...neighbours].sort(compareText),
    ]),
  );
}

function distinctLinks(links: readonly MapLink[]): MapLink[] {
  const seen = new Set<string>();
  const distinct: MapLink[] = [];
  for (const link of links) {
    const key = `${link.source}\0${link.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(link);
  }
  return distinct;
}

function upperOutlierThreshold(values: readonly number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const ordered = [...values].sort((left, right) => left - right);
  const lower = percentile(ordered, 0.25);
  const upper = percentile(ordered, 0.75);
  return upper + 1.5 * (upper - lower);
}

function percentile(ordered: readonly number[], position: number): number {
  if (ordered.length === 1) return ordered[0];
  const index = (ordered.length - 1) * position;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return ordered[lower] + (ordered[Math.ceil(index)] - ordered[lower]) * fraction;
}

function isImplicitEntrypoint(file: MapFile): boolean {
  if (isFrameworkEntry(file.role)) return true;
  const segments = file.path.split("/");
  const base = segments[segments.length - 1] ?? file.path;
  const stem = base.replace(/\.[^.]+$/, "");
  if (stem === "page" || stem === "route" || stem === "layout") return true;
  if (stem === "middleware") return true;
  if (/(?:^|\.)config$/.test(stem)) return true;
  return segments.includes("pages") || segments.includes("routes");
}

function addAdjacent(
  adjacent: Map<string, Set<string>>,
  from: string,
  to: string,
): void {
  const neighbours = adjacent.get(from);
  if (neighbours === undefined) adjacent.set(from, new Set([to]));
  else neighbours.add(to);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
