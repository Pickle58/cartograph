"use client";

import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { KindSwatch } from "@/components/kind-swatch";
import { useMapActions } from "@/components/map-actions";
import { filePathFrom, hoveredFilePath, nodeIsHighlighted } from "@/lib/hover";
import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
  VISIBLE_ROWS,
  type SceneNode,
} from "@/lib/map-scene";

export type ModuleFlowNode = Node<SceneNode, "module">;

export function ModuleNode({ data }: NodeProps<ModuleFlowNode>) {
  const { openDirectory, closeDirectory, selectFile, setHover, hover, directoryOf } =
    useMapActions();
  const updateNodeInternals = useUpdateNodeInternals();
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const scrolledTo = useRef<string | null>(null);
  const frame = data.selected ? "border-accent" : "border-border";
  const nodeHighlighted = nodeIsHighlighted(
    data.directory,
    data.open,
    hover,
    directoryOf,
  );
  const litPath = hoveredFilePath(hover);
  const dim = data.dimmed && !nodeHighlighted ? "opacity-30" : "";
  const highlight = nodeHighlighted ? "map-highlight" : "";
  const selectedPath = data.rows.find((row) => row.selected)?.path ?? null;

  useLayoutEffect(() => {
    if (!data.open) {
      scrolledTo.current = null;
      return;
    }
    if (selectedPath === null || selectedPath === scrolledTo.current) return;
    scrolledTo.current = selectedPath;
    const list = listRef.current;
    if (list === null) return;
    const index = data.rows.findIndex((row) => row.path === selectedPath);
    if (index < 0) return;
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [data.open, data.rows, selectedPath]);

  function hoverFromMap(event: MouseEvent<HTMLElement>) {
    const path = filePathFrom(event.target);
    if (path !== null && data.rows.some((row) => row.path === path)) {
      setHover({ kind: "file", path });
      return;
    }
    setHover({ kind: "directory", directory: data.directory });
  }

  if (!data.open && scrollTop !== 0) setScrollTop(0);

  useLayoutEffect(() => {
    updateNodeInternals(data.directory);
  }, [
    data.directory,
    data.height,
    data.open,
    data.rows,
    scrollTop,
    updateNodeInternals,
  ]);

  if (!data.open) {
    return (
      <div
        className={`relative h-full w-full border bg-surface ${frame} ${dim} ${highlight}`}
        onMouseOver={hoverFromMap}
        onMouseLeave={() => setHover(null)}
      >
        <button
          type="button"
          onClick={() => openDirectory(data.directory)}
          className="h-full w-full px-2 py-1 text-left"
          aria-label={`Open ${data.label}`}
        >
          <span className="font-mono text-[12px] whitespace-nowrap">
            {data.label}
          </span>
        </button>
        <Handle type="target" position={Position.Left} id="in" />
        <Handle type="source" position={Position.Right} id="out" />
      </div>
    );
  }

  const viewHeight = Math.min(data.rows.length, VISIBLE_ROWS) * ROW_HEIGHT;
  const scrolls = data.rows.length > VISIBLE_ROWS;

  return (
    <div
      className={`relative flex h-full w-full flex-col border bg-surface ${frame} ${highlight}`}
      onMouseOver={hoverFromMap}
      onMouseLeave={() => setHover(null)}
    >
      <button
        type="button"
        onClick={() => closeDirectory(data.directory)}
        className={`flex w-full shrink-0 flex-col justify-center border-b border-border px-2 text-left ${dim}`}
        style={{ height: HEADER_HEIGHT }}
        aria-label={`Close ${data.label}`}
      >
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[12px] whitespace-nowrap">
            {data.label}
          </span>
          <span className="ml-auto font-mono text-[12px] text-muted tabular-nums">
            {data.matchedCount === null
              ? data.fileCount
              : `${data.matchedCount} / ${data.fileCount}`}
          </span>
        </span>
        <span className="mt-0.5 flex gap-3 font-mono text-[11px] text-muted tabular-nums">
          <span>in {data.fanIn}</span>
          <span>out {data.fanOut}</span>
        </span>
      </button>
      <ul
        ref={listRef}
        className={`map-file-list m-0 list-none overflow-x-hidden p-0 ${
          scrolls ? "nowheel nopan nodrag overflow-y-auto" : "overflow-y-hidden"
        }`}
        style={{ height: viewHeight }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {data.rows.map((row) => {
          const rowLit = litPath === row.path;
          return (
          <li key={row.path}>
            <button
              type="button"
              data-file-path={row.path}
              onClick={() => selectFile(row.path)}
              aria-pressed={row.selected}
              className={`flex w-full items-center gap-2 px-2 text-left ${
                row.selected ? "map-row-selected" : ""
              } ${rowLit ? "map-highlight" : ""} ${
                row.dimmed && !nodeHighlighted && !rowLit ? "opacity-30" : ""
              }`}
              style={{ height: ROW_HEIGHT }}
            >
              <KindSwatch category={row.category} />
              <span className="font-mono text-[12px] whitespace-nowrap">
                {row.label}
              </span>
            </button>
          </li>
          );
        })}
      </ul>
      {data.rows.map((row, index) => {
        const top = rowHandleTop(index, scrollTop, viewHeight);
        return (
          <span key={row.path}>
            <Handle
              type="target"
              position={Position.Left}
              id={`in:${row.path}`}
              style={{ top }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id={`out:${row.path}`}
              style={{ top }}
            />
          </span>
        );
      })}
    </div>
  );
}

// Handles sit on the panel, not in the scrolling list, and clamp to the
// list's top or bottom while their file is scrolled out of view.
function rowHandleTop(index: number, scrollTop: number, viewHeight: number): number {
  const center = index * ROW_HEIGHT - scrollTop + ROW_HEIGHT / 2;
  const clamped = Math.min(Math.max(center, 0), viewHeight);
  return HEADER_HEIGHT + clamped;
}
