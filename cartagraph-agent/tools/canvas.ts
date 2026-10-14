import { importRepo } from "./repo.ts";
import type { SnapshotFile, SnapshotLink } from "./snapshot.ts";

type FileDetail = {
  path: string;
  lines: number;
  category: string;
  dependsOn: readonly string[];
  dependedOn: readonly string[];
};

export type RepositoryView = {
  files: ReadonlyMap<string, FileDetail>;
  fileCount: number;
  unidentified: number;
  leanedOn: readonly { path: string; count: number }[];
  unimported: readonly string[];
};

export type WalkDirection = "dependencies" | "dependents";

export type Canvas = {
  repositoryDetail: (
    files: readonly SnapshotFile[],
    links: readonly SnapshotLink[],
    framework: string,
  ) => RepositoryView;
  walkGraph: (
    start: string,
    links: readonly SnapshotLink[],
    direction: WalkDirection,
    depth?: number,
  ) => string[];
  graphInsights: (
    files: readonly SnapshotFile[],
    links: readonly SnapshotLink[],
  ) => readonly { kind: string; paths: readonly string[] }[];
  sentences: Readonly<Record<string, string>>;
  frameworkLabel: (framework: string) => string;
  categoryLabel: (category: string) => string;
  isRoleId: (value: string) => boolean;
  roleIds: readonly string[];
};

let loading: Promise<Canvas> | undefined;

export function loadCanvas(): Promise<Canvas> {
  if (loading === undefined) {
    loading = load().catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  }
  return loading;
}

async function load(): Promise<Canvas> {
  const [detail, analysis, categories, roles] = await Promise.all([
    importRepo<DetailModule>("lib/detail.ts"),
    importRepo<AnalysisModule>("lib/graph-analysis.ts"),
    importRepo<CategoriesModule>("lib/categories.ts"),
    importRepo<RolesModule>("parser/roles.mts"),
  ]);
  return {
    repositoryDetail: (files, links, framework) => detail.repositoryDetail(files, links, framework),
    walkGraph: (start, links, direction, depth) => analysis.walkGraph(start, links, direction, depth),
    graphInsights: (files, links) => analysis.graphInsights(files, links),
    sentences: analysis.INSIGHT_SENTENCES,
    frameworkLabel: (framework) => categories.frameworkLabel(framework),
    categoryLabel: (category) => categories.categoryLabel(category),
    isRoleId: (value) => roles.isRoleId(value),
    roleIds: roles.ROLE_IDS,
  };
}

type DetailModule = {
  repositoryDetail: Canvas["repositoryDetail"];
};

type AnalysisModule = {
  walkGraph: Canvas["walkGraph"];
  graphInsights: Canvas["graphInsights"];
  INSIGHT_SENTENCES: Canvas["sentences"];
};

type CategoriesModule = {
  frameworkLabel: Canvas["frameworkLabel"];
  categoryLabel: Canvas["categoryLabel"];
};

type RolesModule = {
  ROLE_IDS: readonly string[];
  isRoleId: (value: string) => boolean;
};
