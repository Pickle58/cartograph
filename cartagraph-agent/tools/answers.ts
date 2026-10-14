import type { AnalysisSnapshot } from "./snapshot.ts";
import { loadCanvas, type WalkDirection } from "./canvas.ts";

export async function summarizeAnalysis(snapshot: AnalysisSnapshot): Promise<string> {
  const canvas = await loadCanvas();
  const detail = canvas.repositoryDetail(snapshot.files, snapshot.links, snapshot.framework);
  const insights = canvas.graphInsights(snapshot.files, snapshot.links);
  const lines = [
    `Repository: ${snapshot.repository}`,
    `Framework: ${canvas.frameworkLabel(snapshot.framework)}`,
    `Files: ${detail.fileCount}`,
    `Imports: ${snapshot.links.length}`,
    `Routes: ${snapshot.routes.length}`,
    `Unidentified: ${detail.unidentified}`,
    coverageText(snapshot),
    "",
    "Most imported",
    ranked(detail.leanedOn),
    "",
    "Nothing imports these",
    list(detail.unimported),
    "",
    "Insights",
    insightText(insights, canvas.sentences),
  ];
  return lines.join("\n");
}

export async function searchPaths(snapshot: AnalysisSnapshot, query: string): Promise<string> {
  const canvas = await loadCanvas();
  const detail = canvas.repositoryDetail(snapshot.files, snapshot.links, snapshot.framework);
  const matches = [...detail.files.values()]
    .filter((file) => file.path.includes(query))
    .sort((left, right) => compareText(left.path, right.path));
  if (matches.length === 0) return `No file path contains ${JSON.stringify(query)}.`;
  const lines = matches.map((file) => `${file.path} (${label(canvas, file.category)})`);
  return [`${matches.length} ${matches.length === 1 ? "file" : "files"}`, ...lines].join("\n");
}

export async function filesOfRole(snapshot: AnalysisSnapshot, role: string): Promise<string> {
  const canvas = await loadCanvas();
  if (!canvas.isRoleId(role)) return `${role} is not a role in this analysis.`;
  const detail = canvas.repositoryDetail(snapshot.files, snapshot.links, snapshot.framework);
  const matches = [...detail.files.values()]
    .filter((file) => file.category === role)
    .map((file) => file.path)
    .sort(compareText);
  const heading = label(canvas, role);
  if (matches.length === 0) return `${heading}: none.`;
  return [`${heading}: ${matches.length}`, ...matches].join("\n");
}

export async function neighbouringFiles(snapshot: AnalysisSnapshot, filePath: string): Promise<string> {
  const canvas = await loadCanvas();
  const detail = canvas.repositoryDetail(snapshot.files, snapshot.links, snapshot.framework);
  const file = detail.files.get(filePath);
  if (file === undefined) return absent(filePath);
  return [
    file.path,
    "Depends on",
    list(file.dependsOn),
    "Depended on",
    list(file.dependedOn),
  ].join("\n");
}

export async function dependencyWalk(
  snapshot: AnalysisSnapshot,
  filePath: string,
  direction: WalkDirection,
): Promise<string> {
  const canvas = await loadCanvas();
  const detail = canvas.repositoryDetail(snapshot.files, snapshot.links, snapshot.framework);
  if (!detail.files.has(filePath)) return absent(filePath);
  const reached = canvas.walkGraph(filePath, snapshot.links, direction);
  return [`${walkTitle(direction)} from ${filePath}`, list(reached)].join("\n");
}

export async function routeTableText(snapshot: AnalysisSnapshot): Promise<string> {
  if (snapshot.routes.length === 0) return "No routes.";
  const ordered = [...snapshot.routes].sort(
    (left, right) =>
      compareText(left.pattern, right.pattern) ||
      compareText(left.method, right.method) ||
      compareText(left.file, right.file),
  );
  return ordered.map((route) => `${route.method} ${route.pattern} ${route.file}`).join("\n");
}

function absent(filePath: string): string {
  return `${filePath} is not a file in this analysis.`;
}

function label(canvas: Awaited<ReturnType<typeof loadCanvas>>, category: string): string {
  if (!canvas.isRoleId(category)) throw new Error(`Unknown role ${category}`);
  return canvas.categoryLabel(category);
}

function coverageText(snapshot: AnalysisSnapshot): string {
  const { coverage } = snapshot;
  const lines = [
    `Coverage: ${coverage.parsed} of ${coverage.source} source files (${coverage.percent}%)`,
  ];
  if (coverage.skips.length === 0) {
    lines.push("Skipped: none");
  } else {
    lines.push("Skipped:");
    for (const skip of coverage.skips) lines.push(`${skip.reason} (${skip.count})`);
  }
  return lines.join("\n");
}

function insightText(
  insights: readonly { kind: string; paths: readonly string[] }[],
  sentences: Readonly<Record<string, string>>,
): string {
  if (insights.length === 0) return "None.";
  const lines: string[] = [];
  for (const insight of insights) {
    const sentence = sentences[insight.kind];
    if (sentence === undefined) throw new Error(`Unknown insight ${insight.kind}`);
    lines.push(sentence, ...insight.paths);
  }
  return lines.join("\n");
}

function ranked(entries: readonly { path: string; count: number }[]): string {
  if (entries.length === 0) return "None.";
  return entries.map((entry) => `${entry.path} ${entry.count}`).join("\n");
}

function list(paths: readonly string[]): string {
  if (paths.length === 0) return "None.";
  return paths.join("\n");
}

function walkTitle(direction: WalkDirection): string {
  switch (direction) {
    case "dependencies":
      return "Dependency chain";
    case "dependents":
      return "Blast radius";
    default: {
      const unhandled: never = direction;
      throw new Error(`Unhandled walk direction: ${String(unhandled)}`);
    }
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
