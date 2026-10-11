"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { KindSwatch } from "@/components/kind-swatch";
import { useMapActions } from "@/components/map-actions";
import { categoryLabel, type FileCategory } from "@/lib/categories";
import type { FileDetail, RepositoryDetail } from "@/lib/detail";
import {
  INSIGHT_SENTENCES,
  walkGraph,
  type Insight,
  type WalkDirection,
} from "@/lib/graph-analysis";
import { filePathFrom, pathIsHighlighted, type HoverTarget } from "@/lib/hover";
import type { MapLink, MapSelection } from "@/lib/map-scene";

export type DetailTab = "structure" | "explanation";

export function DetailPane({
  name,
  framework,
  importCount,
  routeCount,
  detail,
  links,
  insights,
  selection,
  tab,
  onTab,
}: {
  name: string;
  framework: string;
  importCount: number;
  routeCount: number;
  detail: RepositoryDetail;
  links: readonly MapLink[];
  insights: readonly Insight[];
  selection: MapSelection | null;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
}) {
  const { setHover } = useMapActions();
  const [walk, setWalk] = useState<{
    path: string;
    direction: WalkDirection;
    paths: readonly string[];
  } | null>(null);
  return (
    <aside
      aria-label="Details"
      className="flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-border bg-surface"
      onMouseOver={(event) => hoverFromPane(event, setHover)}
      onMouseLeave={() => setHover(null)}
    >
      <PaneBody
        name={name}
        framework={framework}
        importCount={importCount}
        routeCount={routeCount}
        detail={detail}
        links={links}
        insights={insights}
        selection={selection}
        tab={tab}
        onTab={onTab}
        walk={walk}
        onWalk={(path, direction) =>
          setWalk({ path, direction, paths: walkGraph(path, links, direction) })
        }
      />
    </aside>
  );
}

function PaneBody({
  name,
  framework,
  importCount,
  routeCount,
  detail,
  insights,
  selection,
  tab,
  onTab,
  walk,
  onWalk,
}: {
  name: string;
  framework: string;
  importCount: number;
  routeCount: number;
  detail: RepositoryDetail;
  links: readonly MapLink[];
  insights: readonly Insight[];
  selection: MapSelection | null;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  walk: {
    path: string;
    direction: WalkDirection;
    paths: readonly string[];
  } | null;
  onWalk: (path: string, direction: WalkDirection) => void;
}) {
  if (selection === null) {
    return (
      <Summary
        name={name}
        framework={framework}
        importCount={importCount}
        routeCount={routeCount}
        detail={detail}
        insights={insights}
      />
    );
  }
  switch (selection.kind) {
    case "file":
      return (
        <FilePane
          file={fileDetail(detail, selection.path)}
          tab={tab}
          onTab={onTab}
          walk={walk?.path === selection.path ? walk : null}
          onWalk={onWalk}
        />
      );
    case "node":
      return (
        <FolderPane
          directory={selection.directory}
          detail={detail}
          tab={tab}
          onTab={onTab}
        />
      );
    default: {
      const unhandled: never = selection;
      throw new Error(`Unhandled selection: ${String(unhandled)}`);
    }
  }
}

function Summary({
  name,
  framework,
  importCount,
  routeCount,
  detail,
  insights,
}: {
  name: string;
  framework: string;
  importCount: number;
  routeCount: number;
  detail: RepositoryDetail;
  insights: readonly Insight[];
}) {
  return (
    <>
      <div className="shrink-0 border-b border-border pb-1">
        <div className="px-3 py-2 text-[13px]">{name}</div>
        <Stat label="Framework" value={framework} />
        <Stat label="Files" value={detail.fileCount} />
        <Stat label="Imports" value={importCount} />
        <Stat label="Routes" value={routeCount} />
        <Stat label="Unidentified" value={detail.unidentified} />
      </div>
      <PathList title="Most imported" entries={detail.leanedOn} headingCount={false} />
      <PathList
        title="Where reading starts"
        note="Nothing imports these."
        entries={detail.unimported.map((path) => ({ path }))}
      />
      <InsightsPanel insights={insights} />
    </>
  );
}

function FilePane({
  file,
  tab,
  onTab,
  walk,
  onWalk,
}: {
  file: FileDetail;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  walk: {
    direction: WalkDirection;
    paths: readonly string[];
  } | null;
  onWalk: (path: string, direction: WalkDirection) => void;
}) {
  return (
    <>
      <div className="shrink-0 border-b border-border">
        <PathButton path={file.path} wrap />
      </div>
      <TabBar tab={tab} onTab={onTab} />
      <TabBody tab={tab}>{fileTab(tab, file, walk, onWalk)}</TabBody>
    </>
  );
}

function FolderPane({
  directory,
  detail,
  tab,
  onTab,
}: {
  directory: string;
  detail: RepositoryDetail;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
}) {
  const { hover } = useMapActions();
  const folder = detail.directories.find((item) => item.directory === directory);
  if (folder === undefined) {
    throw new Error(`Selected directory ${directory} is not in the detail`);
  }
  const highlighted = directoryTitleHighlighted(directory, hover);
  return (
    <>
      <div
        className={`shrink-0 border-b border-border px-3 py-2 font-mono text-[12px] break-all ${
          highlighted ? "map-highlight" : ""
        }`}
      >
        {folder.directory}
      </div>
      <TabBar tab={tab} onTab={onTab} />
      <TabBody tab={tab}>{folderTab(tab, folder.kinds)}</TabBody>
    </>
  );
}

function TabBar({ tab, onTab }: { tab: DetailTab; onTab: (tab: DetailTab) => void }) {
  return (
    <div role="tablist" className="flex shrink-0 border-b border-border">
      <TabButton id="structure" label="Structure" tab={tab} onTab={onTab} />
      <TabButton id="explanation" label="Explanation" tab={tab} onTab={onTab} />
    </div>
  );
}

function TabButton({
  id,
  label,
  tab,
  onTab,
}: {
  id: DetailTab;
  label: string;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
}) {
  const selected = tab === id;
  return (
    <button
      type="button"
      role="tab"
      id={`detail-tab-${id}`}
      aria-selected={selected}
      aria-controls={`detail-panel-${id}`}
      onClick={() => onTab(id)}
      className={`border-b-2 px-3 py-1.5 text-[12px] ${
        selected ? "border-accent text-fg" : "border-transparent text-muted"
      }`}
    >
      {label}
    </button>
  );
}

function TabBody({ tab, children }: { tab: DetailTab; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`detail-panel-${tab}`}
      aria-labelledby={`detail-tab-${tab}`}
      className="flex min-h-0 flex-1 flex-col"
    >
      {children}
    </div>
  );
}

function fileTab(
  tab: DetailTab,
  file: FileDetail,
  walk: { direction: WalkDirection; paths: readonly string[] } | null,
  onWalk: (path: string, direction: WalkDirection) => void,
): ReactNode {
  switch (tab) {
    case "structure":
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border py-1">
            <KindLine category={file.category} />
            <Stat label="Lines" value={file.lines} />
          </div>
          <PathList title="Depends on" entries={file.dependsOn.map((path) => ({ path }))} />
          <PathList
            title="Depended on"
            entries={file.dependedOn.map((path) => ({ path }))}
          />
          <GraphWalk file={file} walk={walk} onWalk={onWalk} />
        </div>
      );
    case "explanation":
      return <Explanation />;
    default: {
      const unhandled: never = tab;
      throw new Error(`Unhandled detail tab: ${String(unhandled)}`);
    }
  }
}

function GraphWalk({
  file,
  walk,
  onWalk,
}: {
  file: FileDetail;
  walk: { direction: WalkDirection; paths: readonly string[] } | null;
  onWalk: (path: string, direction: WalkDirection) => void;
}) {
  const title =
    walk?.direction === "dependents" ? "Blast radius" : "Dependency chain";
  return (
    <section
      // Results share leftover height with the dependency lists. A shrink-0
      // section would grow with the walk and push those lists off the pane.
      className={
        walk !== null
          ? "flex min-h-0 flex-1 flex-col border-t border-border"
          : "shrink-0 border-t border-border"
      }
    >
      <div className="flex shrink-0 gap-1 px-3 py-1.5">
        <WalkButton
          label="Blast radius"
          active={walk?.direction === "dependents"}
          onClick={() => onWalk(file.path, "dependents")}
        />
        <WalkButton
          label="Dependency chain"
          active={walk?.direction === "dependencies"}
          onClick={() => onWalk(file.path, "dependencies")}
        />
      </div>
      {walk !== null ? (
        <PathList
          title={title}
          entries={walk.paths.map((path) => ({ path }))}
        />
      ) : null}
    </section>
  );
}

function WalkButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`border px-2 py-1 text-[11px] ${
        active ? "border-accent text-accent" : "border-border text-muted"
      }`}
    >
      {label}
    </button>
  );
}

function InsightsPanel({ insights }: { insights: readonly Insight[] }) {
  return (
    <details className="shrink-0 border-t border-border">
      <summary className="cursor-pointer px-3 py-1.5 text-[12px]">
        Insights
        <span className="float-right font-mono text-muted tabular-nums">
          {insights.length}
        </span>
      </summary>
      <ul className="m-0 max-h-64 list-none overflow-auto border-t border-border p-0">
        {insights.map((insight, index) => (
          <li
            key={`${insight.kind}:${insight.paths.join("\0")}`}
            className="border-b border-border py-1.5 last:border-b-0"
          >
            <p className="px-3 text-[11px] text-muted">
              {INSIGHT_SENTENCES[insight.kind]}
            </p>
            {insight.paths.map((path) => (
              <PathButton
                key={`${index}:${path}`}
                path={path}
              />
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

function folderTab(tab: DetailTab, kinds: RepositoryDetail["directories"][number]["kinds"]): ReactNode {
  switch (tab) {
    case "structure":
      return (
        <ul className="m-0 min-h-0 flex-1 list-none overflow-auto p-0">
          {kinds.map((kind) => (
            <li key={kind.id} className="flex items-center gap-2 px-3 py-1">
              <KindSwatch category={kind.id} />
              <span className="min-w-0 flex-1 truncate text-[12px]">{kind.label}</span>
              <span className="font-mono text-[12px] text-muted tabular-nums">
                {kind.count}
              </span>
            </li>
          ))}
        </ul>
      );
    case "explanation":
      return <Explanation />;
    default: {
      const unhandled: never = tab;
      throw new Error(`Unhandled detail tab: ${String(unhandled)}`);
    }
  }
}

function Explanation() {
  return (
    <p className="px-3 py-2 text-[12px] text-muted">Nothing has explained this yet.</p>
  );
}

function PathList({
  title,
  note,
  entries,
  headingCount = true,
}: {
  title: string;
  note?: string;
  entries: readonly { path: string; count?: number }[];
  headingCount?: boolean;
}) {
  return (
    <section
      className={
        entries.length > 0
          ? "flex min-h-0 flex-1 flex-col border-b border-border last:border-b-0"
          : "shrink-0 border-b border-border last:border-b-0"
      }
    >
      <div className="shrink-0 px-3 py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px]">{title}</span>
          {headingCount ? (
            <span className="ml-auto font-mono text-[12px] text-muted tabular-nums">
              {entries.length}
            </span>
          ) : null}
        </div>
        {note !== undefined ? <p className="text-[11px] text-muted">{note}</p> : null}
      </div>
      {entries.length > 0 ? (
        <ul className="map-file-list m-0 min-h-0 flex-1 list-none overflow-auto p-0">
          {entries.map((entry) => (
            <li key={entry.path}>
              <PathButton path={entry.path} count={entry.count} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PathButton({
  path,
  count,
  wrap = false,
}: {
  path: string;
  count?: number;
  wrap?: boolean;
}) {
  const { selectFile, hover, directoryOf } = useMapActions();
  const highlighted = pathIsHighlighted(path, hover, directoryOf);
  return (
    <button
      type="button"
      data-file-path={path}
      title={wrap ? undefined : path}
      onClick={() => selectFile(path)}
      className={`flex w-full items-center gap-2 px-3 text-left ${
        wrap ? "py-2" : "h-[22px]"
      } ${highlighted ? "map-highlight" : ""}`}
    >
      {wrap ? (
        <span className="min-w-0 flex-1 font-mono text-[12px] break-all">{path}</span>
      ) : (
        <PathLabel path={path} />
      )}
      {count !== undefined ? (
        <span className="shrink-0 font-mono text-[12px] text-muted tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function PathLabel({ path }: { path: string }) {
  const slash = path.lastIndexOf("/");
  const directory = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);
  return (
    <span className="flex min-w-0 flex-1 font-mono text-[12px]">
      {directory.length > 0 ? (
        <span className="min-w-0 truncate text-muted">{directory}</span>
      ) : null}
      <span className="max-w-full shrink-0 truncate">{name}</span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-3 px-3 py-0.5">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="ml-auto font-mono text-[12px] tabular-nums">{value}</span>
    </div>
  );
}

function KindLine({ category }: { category: FileCategory }) {
  return (
    <div className="flex items-center gap-3 px-3 py-0.5">
      <span className="text-[12px] text-muted">Kind</span>
      <span className="ml-auto flex items-center gap-2 text-[12px]">
        <KindSwatch category={category} />
        {categoryLabel(category)}
      </span>
    </div>
  );
}

function fileDetail(detail: RepositoryDetail, path: string): FileDetail {
  const file = detail.files.get(path);
  if (file === undefined) {
    throw new Error(`Selected file ${path} is not in the detail`);
  }
  return file;
}

function directoryTitleHighlighted(
  directory: string,
  hover: HoverTarget | null,
): boolean {
  if (hover === null) return false;
  switch (hover.kind) {
    case "directory":
      return hover.directory === directory;
    case "file":
      return false;
    default: {
      const unhandled: never = hover;
      throw new Error(`Unhandled hover: ${String(unhandled)}`);
    }
  }
}

function hoverFromPane(
  event: MouseEvent<HTMLElement>,
  setHover: (hover: { kind: "file"; path: string } | null) => void,
): void {
  const path = filePathFrom(event.target);
  setHover(path === null ? null : { kind: "file", path });
}
