import dagre from "@dagrejs/dagre";

// Dagre's x/y is the node's center. Positions come back as the top-left,
// which is what the canvas places. Insertion order is sorted so the same
// graph lays out the same way every time.
export function layoutGraph(
  nodes: readonly { id: string; width: number; height: number }[],
  edges: readonly { source: string; target: string }[],
): Map<string, { x: number; y: number }> {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    nodesep: 20,
    ranksep: 72,
    marginx: 28,
    marginy: 28,
  });

  const orderedNodes = [...nodes].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  for (const node of orderedNodes) {
    graph.setNode(node.id, { width: node.width, height: node.height });
  }

  const seen = new Set<string>();
  const orderedEdges = [...edges].sort((left, right) => {
    if (left.source < right.source) return -1;
    if (left.source > right.source) return 1;
    if (left.target < right.target) return -1;
    if (left.target > right.target) return 1;
    return 0;
  });
  for (const edge of orderedEdges) {
    if (edge.source === edge.target) continue;
    const key = `${edge.source}\0${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of orderedNodes) {
    const placed = graph.node(node.id);
    if (placed === undefined) {
      throw new Error(`Layout produced no position for ${node.id}`);
    }
    positions.set(node.id, {
      x: placed.x - node.width / 2,
      y: placed.y - node.height / 2,
    });
  }
  return positions;
}
