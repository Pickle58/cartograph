"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DetailPane, type DetailTab } from "@/components/detail-pane";
import { DependencyMap } from "@/components/dependency-map";
import { KindSwatch } from "@/components/kind-swatch";
import { MapActionsProvider } from "@/components/map-actions";
import type { CategoryCount, FileCategory } from "@/lib/categories";
import { repositoryDetail } from "@/lib/detail";
import { graphInsights } from "@/lib/graph-analysis";
import { sameHover, type HoverTarget } from "@/lib/hover";
import type { MapFile, MapLink, MapSelection } from "@/lib/map-scene";

export function MapShell({
  name,
  framework,
  importCount,
  routeCount,
  categories,
  files,
  links,
}: {
  name: string;
  framework: string;
  importCount: number;
  routeCount: number;
  categories: readonly CategoryCount[];
  files: readonly MapFile[];
  links: readonly MapLink[];
}) {
  const detail = useMemo(() => repositoryDetail(files, links), [files, links]);
  const insights = useMemo(() => graphInsights(files, links), [files, links]);
  const [open, setOpen] = useState<readonly string[]>([]);
  const [activeCategory, setActiveCategory] = useState<FileCategory | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [hover, setHoverState] = useState<HoverTarget | null>(null);
  // Remembered across selections, so comparing explanations does not reset the tab.
  const [tab, setTab] = useState<DetailTab>("structure");
  const fitAfterOpenRef = useRef(false);

  const setHover = useCallback((next: HoverTarget | null) => {
    setHoverState((current) => (sameHover(current, next) ? current : next));
  }, []);

  const openDirectory = useCallback((directory: string) => {
    fitAfterOpenRef.current = true;
    setOpen((current) =>
      current.includes(directory) ? current : [...current, directory].sort(),
    );
    setSelection({ kind: "node", directory });
  }, []);

  const closeDirectory = useCallback((directory: string) => {
    setOpen((current) => current.filter((item) => item !== directory));
    setSelection({ kind: "node", directory });
  }, []);

  const selectFile = useCallback(
    (path: string) => {
      setSelection({ kind: "file", path });
      // The row only exists once its folder is open.
      const directory = detail.directoryOf.get(path);
      if (directory === undefined) return;
      setOpen((current) => {
        if (current.includes(directory)) return current;
        fitAfterOpenRef.current = true;
        return [...current, directory].sort();
      });
    },
    [detail.directoryOf],
  );

  const clearSelection = useCallback(() => setSelection(null), []);

  const actions = useMemo(
    () => ({
      openDirectory,
      closeDirectory,
      selectFile,
      clearSelection,
      hover,
      setHover,
      directoryOf: detail.directoryOf,
    }),
    [
      openDirectory,
      closeDirectory,
      selectFile,
      clearSelection,
      hover,
      setHover,
      detail.directoryOf,
    ],
  );

  return (
    <MapActionsProvider actions={actions}>
      <div className="flex h-full min-h-0">
        <aside
          aria-label="File kinds"
          className="flex w-52 shrink-0 flex-col border-r border-border bg-surface"
        >
          <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted">
            Kind
          </div>
          <ul className="m-0 list-none overflow-auto p-0">
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  aria-pressed={activeCategory === category.id}
                  onClick={() => {
                    setSelection(null);
                    setActiveCategory((current) =>
                      current === category.id ? null : category.id,
                    );
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                    activeCategory === category.id
                      ? "bg-surface-sunken text-accent"
                      : ""
                  }`}
                >
                  <KindSwatch category={category.id} />
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    {category.label}
                  </span>
                  <span className="font-mono text-[12px] text-muted tabular-nums">
                    {category.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-h-0 min-w-0 flex-1 bg-surface-sunken">
          <DependencyMap
            files={files}
            links={links}
            open={open}
            selection={selection}
            activeCategory={activeCategory}
            fitAfterOpenRef={fitAfterOpenRef}
          />
        </div>
        <DetailPane
          name={name}
          framework={framework}
          importCount={importCount}
          routeCount={routeCount}
          detail={detail}
          links={links}
          insights={insights}
          selection={selection}
          tab={tab}
          onTab={setTab}
        />
      </div>
    </MapActionsProvider>
  );
}
