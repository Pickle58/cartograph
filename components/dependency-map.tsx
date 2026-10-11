"use client";

import { useLayoutEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  MarkerType,
  getViewportForBounds,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
} from "@xyflow/react";
import { useMapActions } from "@/components/map-actions";
import { ModuleNode, type ModuleFlowNode } from "@/components/module-node";
import {
  buildScene,
  type EdgeTone,
  type MapFile,
  type MapLink,
  type MapSelection,
  type SceneNode,
} from "@/lib/map-scene";
import "@xyflow/react/dist/style.css";

const nodeTypes = { module: ModuleNode };

export function DependencyMap({
  files,
  links,
  open,
  selection,
  fitAfterOpenRef,
}: {
  files: readonly MapFile[];
  links: readonly MapLink[];
  open: readonly string[];
  selection: MapSelection | null;
  fitAfterOpenRef: { current: boolean };
}) {
  const { clearSelection } = useMapActions();
  const scene = useMemo(
    () => buildScene(files, links, open, selection),
    [files, links, open, selection],
  );

  const nodes = useMemo<ModuleFlowNode[]>(
    () =>
      scene.nodes.map((node) => ({
        id: node.directory,
        type: "module",
        position: { x: node.x, y: node.y },
        width: node.width,
        height: node.height,
        draggable: false,
        data: node,
        style: { width: node.width, height: node.height },
      })),
    [scene.nodes],
  );

  const edges = useMemo<Edge[]>(
    () =>
      scene.edges.map((edge) => {
        const stroke = strokeFor(edge.tone);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: "smoothstep",
          selectable: false,
          zIndex: edge.tone === "dimmed" ? 0 : 1,
          style: {
            stroke,
            strokeWidth: 1,
            opacity: edge.tone === "dimmed" ? 0.35 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: stroke,
          },
        };
      }),
    [scene.edges],
  );

  return (
    <ReactFlowProvider>
      <Canvas
        nodes={nodes}
        edges={edges}
        sceneNodes={scene.nodes}
        fitAfterOpenRef={fitAfterOpenRef}
        onPaneClick={clearSelection}
      />
    </ReactFlowProvider>
  );
}

function Canvas({
  nodes,
  edges,
  sceneNodes,
  fitAfterOpenRef,
  onPaneClick,
}: {
  nodes: ModuleFlowNode[];
  edges: Edge[];
  sceneNodes: readonly SceneNode[];
  fitAfterOpenRef: { current: boolean };
  onPaneClick: () => void;
}) {
  const { getViewport, setViewport } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  useLayoutEffect(() => {
    if (!fitAfterOpenRef.current) return;
    if (width === 0 || height === 0) return;
    fitAfterOpenRef.current = false;
    updateNodeInternals(sceneNodes.map((node) => node.directory));
    const current = getViewport();
    const next = getViewportForBounds(
      graphBounds(sceneNodes),
      width,
      height,
      0.05,
      current.zoom,
      0.08,
    );
    if (next.zoom > current.zoom + 0.001) return;
    void setViewport(next, { duration: 0 });
  }, [
    sceneNodes,
    width,
    height,
    fitAfterOpenRef,
    getViewport,
    setViewport,
    updateNodeInternals,
  ]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={(instance) => {
        void instance.fitView({ padding: 0.08, maxZoom: 1.25, duration: 0 });
      }}
      onPaneClick={onPaneClick}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesReconnectable={false}
      deleteKeyCode={null}
      selectionOnDrag={false}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      minZoom={0.15}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      className="h-full w-full"
      style={{ background: "transparent" }}
    />
  );
}

function graphBounds(nodes: readonly SceneNode[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x + node.width > maxX) maxX = node.x + node.width;
    if (node.y + node.height > maxY) maxY = node.y + node.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function strokeFor(tone: EdgeTone): string {
  switch (tone) {
    case "incoming":
      return "var(--incoming)";
    case "outgoing":
      return "var(--outgoing)";
    case "plain":
      return "var(--muted)";
    case "dimmed":
      return "var(--border)";
    default: {
      const unhandled: never = tone;
      throw new Error(`Unhandled edge tone: ${String(unhandled)}`);
    }
  }
}
