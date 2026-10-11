import type { Edge } from "./types.mts";

export type Fan = {
  fanIn: number;
  fanOut: number;
};

// Fan-in and fan-out count distinct files. Duplicate edges — the same source,
// target, kind and specifier — are removed first, so two import statements for
// the same module don't count twice. Two kinds pointing at the same file still
// count as one neighbour: the number is how many files, not how many times the
// syntax mentioned them.
export function connect(
  files: readonly string[],
  edges: readonly Edge[],
): { edges: Edge[]; fan: Map<string, Fan> } {
  const fan = new Map<string, Fan>();
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const file of files) {
    incoming.set(file, new Set());
    outgoing.set(file, new Set());
  }

  const kept: Edge[] = [];
  const seen = new Set<string>();
  for (const edge of [...edges].sort(compareEdges)) {
    const key = `${edge.kind}\0${edge.source}\0${edge.target}\0${edge.specifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!outgoing.has(edge.source) || !incoming.has(edge.target)) {
      throw new Error(
        `Edge ${edge.source} -> ${edge.target} does not connect two parsed files`,
      );
    }
    kept.push(edge);
    outgoing.get(edge.source)?.add(edge.target);
    incoming.get(edge.target)?.add(edge.source);
  }

  for (const file of files) {
    fan.set(file, {
      fanIn: incoming.get(file)?.size ?? 0,
      fanOut: outgoing.get(file)?.size ?? 0,
    });
  }
  return { edges: kept, fan };
}

function compareEdges(a: Edge, b: Edge): number {
  return (
    compareText(a.source, b.source) ||
    compareText(a.target, b.target) ||
    compareText(a.kind, b.kind) ||
    compareText(a.specifier, b.specifier)
  );
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
