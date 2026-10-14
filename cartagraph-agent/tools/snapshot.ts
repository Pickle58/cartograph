// The read API returns this and nothing else. It is the canvas input:
// files, edges, recovered routes, and coverage. No analysis id.
export type SnapshotFile = {
  path: string;
  folder: string;
  lines: number;
  role: string;
};

export type SnapshotLink = {
  source: string;
  target: string;
};

export type SnapshotRoute = {
  file: string;
  method: string;
  pattern: string;
};

export type SnapshotCoverage = {
  parsed: number;
  source: number;
  percent: number;
  skips: readonly { reason: string; count: number }[];
};

export type AnalysisSnapshot = {
  repository: string;
  framework: string;
  files: SnapshotFile[];
  links: SnapshotLink[];
  routes: SnapshotRoute[];
  coverage: SnapshotCoverage;
};

export function parseSnapshot(value: unknown, isRoleId: (role: string) => boolean): AnalysisSnapshot {
  const record = asRecord(value, "snapshot");
  const files = parseFiles(record.files, isRoleId);
  const known = new Set(files.map((file) => file.path));
  return {
    repository: requiredText(record.repository, "repository"),
    framework: requiredText(record.framework, "framework"),
    files,
    links: parseLinks(record.links, known),
    routes: parseRoutes(record.routes, known),
    coverage: parseCoverage(record.coverage),
  };
}

function parseFiles(value: unknown, isRoleId: (role: string) => boolean): SnapshotFile[] {
  if (!Array.isArray(value)) throw new Error("Snapshot files are not a list.");
  const seen = new Set<string>();
  const files: SnapshotFile[] = [];
  for (const item of value) {
    const record = asRecord(item, "file");
    const filePath = requiredText(record.path, "file path");
    if (seen.has(filePath)) throw new Error(`Snapshot lists ${filePath} twice.`);
    seen.add(filePath);
    const role = requiredText(record.role, `role of ${filePath}`);
    if (!isRoleId(role)) throw new Error(`Snapshot role ${role} on ${filePath} is not a parser role.`);
    files.push({
      path: filePath,
      folder: requiredString(record.folder, `folder of ${filePath}`),
      lines: requiredCount(record.lines, `lines of ${filePath}`),
      role,
    });
  }
  return files;
}

function parseLinks(value: unknown, known: ReadonlySet<string>): SnapshotLink[] {
  if (!Array.isArray(value)) throw new Error("Snapshot links are not a list.");
  const links: SnapshotLink[] = [];
  for (const item of value) {
    const record = asRecord(item, "link");
    const source = requiredText(record.source, "link source");
    const target = requiredText(record.target, "link target");
    if (!known.has(source) || !known.has(target)) {
      throw new Error(`Snapshot link ${source} -> ${target} does not connect two files.`);
    }
    links.push({ source, target });
  }
  return links;
}

function parseRoutes(value: unknown, known: ReadonlySet<string>): SnapshotRoute[] {
  if (!Array.isArray(value)) throw new Error("Snapshot routes are not a list.");
  const routes: SnapshotRoute[] = [];
  for (const item of value) {
    const record = asRecord(item, "route");
    const file = requiredText(record.file, "route file");
    if (!known.has(file)) throw new Error(`Snapshot route file ${file} is not a parsed file.`);
    routes.push({
      file,
      method: requiredText(record.method, "route method"),
      pattern: requiredText(record.pattern, "route pattern"),
    });
  }
  return routes;
}

function parseCoverage(value: unknown): AnalysisSnapshot["coverage"] {
  const record = asRecord(value, "coverage");
  const skipsValue = record.skips;
  if (!Array.isArray(skipsValue)) throw new Error("Snapshot coverage skips are not a list.");
  const skips: { reason: string; count: number }[] = [];
  for (const item of skipsValue) {
    const skip = asRecord(item, "coverage skip");
    const count = requiredCount(skip.count, "coverage skip count");
    if (count === 0) throw new Error("Snapshot coverage skip count is zero.");
    skips.push({
      reason: requiredText(skip.reason, "coverage skip reason"),
      count,
    });
  }
  const percent = requiredCount(record.percent, "coverage percent");
  if (percent > 100) throw new Error("Snapshot coverage percent is over 100.");
  return {
    parsed: requiredCount(record.parsed, "coverage parsed"),
    source: requiredCount(record.source, "coverage source"),
    percent,
    skips,
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Snapshot ${label} is not an object.`);
  }
  // A JSON object has string keys. TypeScript's `object` type does not.
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Snapshot ${label} is not a string.`);
  return value;
}

function requiredText(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (text.length === 0) throw new Error(`Snapshot ${label} is empty.`);
  return text;
}

function requiredCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Snapshot ${label} is not a non-negative integer.`);
  }
  return value;
}
