import { categoryOf, type FileCategory } from "@/lib/categories";
import { foldRepository, type FoldedDirectory } from "@/lib/fold";
import { shortestUniqueLabels } from "@/lib/labels";
import { layoutGraph } from "@/lib/layout";

// An open folder shows this many rows. The rest scroll inside the panel,
// so the box does not grow with the folder.
export const VISIBLE_ROWS = 8;

// Height is proportional to fan-in across the nodes on screen. Width is the
// label, so a long name cannot read as a more depended-on folder.
const MIN_NODE_HEIGHT = 28;
const MAX_NODE_HEIGHT = 128;
export const HEADER_HEIGHT = 48;
export const ROW_HEIGHT = 22;
const CHAR_PX = 7.2;
const SCROLL_GUTTER = 12;

export type MapFile = {
  path: string;
  folder: string;
  lines: number;
};

export type MapLink = {
  source: string;
  target: string;
};

export type MapSelection =
  | { kind: "node"; directory: string }
  | { kind: "file"; path: string };

export type EdgeTone = "incoming" | "outgoing" | "plain" | "dimmed";

export type SceneRow = {
  path: string;
  label: string;
  category: FileCategory;
  selected: boolean;
  dimmed: boolean;
};

export type SceneNode = {
  directory: string;
  label: string;
  fileCount: number;
  matchedCount: number | null;
  fanIn: number;
  fanOut: number;
  open: boolean;
  selected: boolean;
  dimmed: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  rows: readonly SceneRow[];
};

export type SceneEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  tone: EdgeTone;
};

export type Scene = {
  nodes: readonly SceneNode[];
  edges: readonly SceneEdge[];
};

type Pair = { source: string; target: string };

type VisualEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  pairs: Pair[];
};

export function buildScene(
  files: readonly MapFile[],
  links: readonly MapLink[],
  openDirectories: readonly string[],
  selection: MapSelection | null,
  activeCategory: FileCategory | null = null,
): Scene {
  const fold = foldRepository(files);
  const home = new Map<string, string>();
  for (const directory of fold.directories) {
    for (const path of directory.files) {
      if (home.has(path)) {
        throw new Error(`File ${path} is in more than one folded node`);
      }
      home.set(path, directory.directory);
    }
  }
  for (const file of files) {
    if (!home.has(file.path)) {
      throw new Error(`File ${file.path} is not in a folded node`);
    }
  }

  const open = new Set(openDirectories);
  const pairs = distinctPairs(links);
  for (const pair of pairs) {
    if (!home.has(pair.source) || !home.has(pair.target)) {
      throw new Error(
        `Edge ${pair.source} -> ${pair.target} does not terminate on a folded node`,
      );
    }
  }

  const labels = labelsOnScreen(fold.directories, open);
  const fans = boundaryFans(fold.directories, pairs, home);
  const maxFanIn = Math.max(0, ...[...fans.values()].map((fan) => fan.fanIn));

  const drafted = fold.directories.map((directory) => {
    const fan = fans.get(directory.directory) ?? { fanIn: 0, fanOut: 0 };
    const isOpen = open.has(directory.directory);
    const shown = isOpen ? directory.files : [];
    const label = labels.get(directory.directory) ?? directory.directory;
    const width = isOpen
      ? openWidth(label, directory.files.length, fan, shown, labels)
      : foldedWidth(label);
    const height = isOpen
      ? HEADER_HEIGHT + Math.min(shown.length, VISIBLE_ROWS) * ROW_HEIGHT
      : foldedHeight(fan.fanIn, maxFanIn);
    return {
      directory: directory.directory,
      label,
      fileCount: directory.files.length,
      fanIn: fan.fanIn,
      fanOut: fan.fanOut,
      open: isOpen,
      width,
      height,
      files: directory.files,
      shown,
    };
  });

  const visualEdges = aggregateEdges(pairs, home, open, new Set(
    drafted.flatMap((node) => node.shown),
  ));
  const focus = focusOf(selection, visualEdges, drafted, home);

  const positions = layoutGraph(
    drafted.map((node) => ({
      id: node.directory,
      width: node.width,
      height: node.height,
    })),
    visualEdges.map((edge) => ({ source: edge.source, target: edge.target })),
  );

  const nodes: SceneNode[] = drafted.map((node) => {
    const placed = positions.get(node.directory);
    if (placed === undefined) {
      throw new Error(`Layout produced no position for ${node.directory}`);
    }
    const nodeSelected =
      selection?.kind === "node" && selection.directory === node.directory;
    const matchedCount =
      activeCategory === null
        ? null
        : node.files.filter((path) => categoryOf(path) === activeCategory).length;
    const nodeDimmed =
      (selection !== null && !focus.directories.has(node.directory)) ||
      matchedCount === 0;
    return {
      directory: node.directory,
      label: node.label,
      fileCount: node.fileCount,
      matchedCount,
      fanIn: node.fanIn,
      fanOut: node.fanOut,
      open: node.open,
      selected: nodeSelected,
      dimmed: nodeDimmed,
      width: node.width,
      height: node.height,
      x: placed.x,
      y: placed.y,
      rows: node.shown.map((path) => ({
        path,
        label: labels.get(path) ?? path,
        category: categoryOf(path),
        selected: selection?.kind === "file" && selection.path === path,
        dimmed:
          nodeDimmed ||
          (activeCategory !== null && categoryOf(path) !== activeCategory) ||
          (selection !== null && !nodeSelected && !focus.files.has(path)),
      })),
    };
  });

  const edges: SceneEdge[] = visualEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    tone:
      activeCategory !== null && !edgeTouchesCategory(edge, activeCategory)
        ? "dimmed"
        : toneOf(edge, selection),
  }));

  return { nodes, edges };
}

function distinctPairs(links: readonly MapLink[]): Pair[] {
  const seen = new Set<string>();
  const pairs: Pair[] = [];
  const ordered = [...links].sort((left, right) => {
    if (left.source < right.source) return -1;
    if (left.source > right.source) return 1;
    if (left.target < right.target) return -1;
    if (left.target > right.target) return 1;
    return 0;
  });
  for (const link of ordered) {
    if (link.source === link.target) continue;
    const key = `${link.source}\0${link.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ source: link.source, target: link.target });
  }
  return pairs;
}

function labelsOnScreen(
  directories: readonly FoldedDirectory[],
  open: ReadonlySet<string>,
): Map<string, string> {
  const paths: string[] = [];
  for (const directory of directories) {
    paths.push(directory.directory);
    if (!open.has(directory.directory)) continue;
    // Every file in an open folder, so a label does not change as you scroll.
    for (const path of directory.files) paths.push(path);
  }
  return shortestUniqueLabels(paths);
}

function boundaryFans(
  directories: readonly FoldedDirectory[],
  pairs: readonly Pair[],
  home: ReadonlyMap<string, string>,
): Map<string, { fanIn: number; fanOut: number }> {
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const directory of directories) {
    incoming.set(directory.directory, new Set());
    outgoing.set(directory.directory, new Set());
  }
  for (const pair of pairs) {
    const source = home.get(pair.source);
    const target = home.get(pair.target);
    if (source === undefined || target === undefined || source === target) {
      continue;
    }
    outgoing.get(source)?.add(pair.target);
    incoming.get(target)?.add(pair.source);
  }
  const fans = new Map<string, { fanIn: number; fanOut: number }>();
  for (const directory of directories) {
    fans.set(directory.directory, {
      fanIn: incoming.get(directory.directory)?.size ?? 0,
      fanOut: outgoing.get(directory.directory)?.size ?? 0,
    });
  }
  return fans;
}

function aggregateEdges(
  pairs: readonly Pair[],
  home: ReadonlyMap<string, string>,
  open: ReadonlySet<string>,
  visible: ReadonlySet<string>,
): VisualEdge[] {
  const grouped = new Map<string, VisualEdge>();
  for (const pair of pairs) {
    const source = home.get(pair.source);
    const target = home.get(pair.target);
    if (source === undefined || target === undefined) continue;
    if (source === target && !open.has(source)) continue;
    const sourceHandle = handleFor(source, pair.source, "out", open, visible);
    const targetHandle = handleFor(target, pair.target, "in", open, visible);
    const id = `${source}|${sourceHandle}|${target}|${targetHandle}`;
    const existing = grouped.get(id);
    if (existing === undefined) {
      grouped.set(id, {
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        pairs: [pair],
      });
    } else {
      existing.pairs.push(pair);
    }
  }
  return [...grouped.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

function handleFor(
  directory: string,
  path: string,
  side: "in" | "out",
  open: ReadonlySet<string>,
  visible: ReadonlySet<string>,
): string {
  if (!open.has(directory)) return side;
  if (visible.has(path)) return `${side}:${path}`;
  return `${side}:more`;
}

function focusOf(
  selection: MapSelection | null,
  edges: readonly VisualEdge[],
  nodes: readonly { directory: string; files: readonly string[] }[],
  home: ReadonlyMap<string, string>,
): { directories: Set<string>; files: Set<string> } {
  const directories = new Set<string>();
  const files = new Set<string>();
  if (selection === null) return { directories, files };
  if (selection.kind === "node") {
    directories.add(selection.directory);
    const owned = nodes.find((node) => node.directory === selection.directory);
    for (const path of owned?.files ?? []) files.add(path);
  } else {
    files.add(selection.path);
    const directory = home.get(selection.path);
    if (directory !== undefined) directories.add(directory);
  }
  for (const edge of edges) {
    if (toneOf(edge, selection) === "dimmed") continue;
    directories.add(edge.source);
    directories.add(edge.target);
    for (const pair of edge.pairs) {
      if (!edgeTouches(pair, selection, nodes)) continue;
      files.add(pair.source);
      files.add(pair.target);
      const sourceHome = home.get(pair.source);
      const targetHome = home.get(pair.target);
      if (sourceHome !== undefined) directories.add(sourceHome);
      if (targetHome !== undefined) directories.add(targetHome);
    }
  }
  return { directories, files };
}

function toneOf(edge: VisualEdge, selection: MapSelection | null): EdgeTone {
  if (selection === null) return "plain";
  switch (selection.kind) {
    case "node": {
      const fromHere = edge.source === selection.directory;
      const toHere = edge.target === selection.directory;
      if (toHere && !fromHere) return "incoming";
      if (fromHere && !toHere) return "outgoing";
      // Inside the selected node there is no in or out, so the edge stays grey.
      if (fromHere && toHere) return "plain";
      return "dimmed";
    }
    case "file": {
      const incoming = edge.pairs.some((pair) => pair.target === selection.path);
      const outgoing = edge.pairs.some((pair) => pair.source === selection.path);
      if (incoming && !outgoing) return "incoming";
      if (outgoing) return "outgoing";
      return "dimmed";
    }
    default: {
      const unhandled: never = selection;
      throw new Error(`Unhandled selection: ${String(unhandled)}`);
    }
  }
}

function edgeTouchesCategory(
  edge: VisualEdge,
  category: FileCategory,
): boolean {
  return edge.pairs.some(
    (pair) =>
      categoryOf(pair.source) === category || categoryOf(pair.target) === category,
  );
}

function foldedWidth(label: string): number {
  return Math.max(96, textWidth(label));
}

function foldedHeight(fanIn: number, maxFanIn: number): number {
  if (maxFanIn <= 0) return MIN_NODE_HEIGHT;
  return Math.round(
    MIN_NODE_HEIGHT + ((MAX_NODE_HEIGHT - MIN_NODE_HEIGHT) * fanIn) / maxFanIn,
  );
}

function openWidth(
  label: string,
  fileCount: number,
  fan: { fanIn: number; fanOut: number },
  files: readonly string[],
  labels: ReadonlyMap<string, string>,
): number {
  const header = textWidth(`${label}  ${fileCount}`);
  const fanLine = textWidth(`in ${fan.fanIn}   out ${fan.fanOut}`);
  let widest = Math.max(header, fanLine, 160);
  for (const path of files) {
    const row = textWidth(labels.get(path) ?? path) + 18;
    if (row > widest) widest = row;
  }
  if (files.length > VISIBLE_ROWS) widest += SCROLL_GUTTER;
  return widest;
}

function textWidth(text: string): number {
  return Math.ceil(text.length * CHAR_PX) + 20;
}

function edgeTouches(
  pair: Pair,
  selection: MapSelection,
  nodes: readonly { directory: string; files: readonly string[] }[],
): boolean {
  switch (selection.kind) {
    case "file":
      return pair.source === selection.path || pair.target === selection.path;
    case "node": {
      const owned = nodes.find((node) => node.directory === selection.directory);
      if (owned === undefined) return false;
      const files = new Set(owned.files);
      return files.has(pair.source) || files.has(pair.target);
    }
    default: {
      const unhandled: never = selection;
      throw new Error(`Unhandled selection: ${String(unhandled)}`);
    }
  }
}
