import { isRoleId } from "./roles.mts";

export type ModuleKind = "module" | "script";

export type ImportKind = "import" | "re-export" | "dynamic-import" | "require";

export type ParsedFile = {
  path: string;
  folder: string;
  lines: number;
  hash: string;
  moduleKind: ModuleKind;
  fanIn: number;
  fanOut: number;
};

export type SkippedFile = {
  path: string;
  folder: string;
  reason: string;
};

export type Edge = {
  source: string;
  target: string;
  kind: ImportKind;
  specifier: string;
};

export type ImportResolution =
  | { status: "resolved"; target: string }
  | { status: "outside"; resolvedPath: string }
  | { status: "excluded"; resolvedPath: string; reason: string }
  | { status: "unresolved"; reason: string };

export type ImportRecord = {
  source: string;
  specifier: string;
  kind: ImportKind;
  resolution: ImportResolution;
};

export type ExcludedPath = {
  path: string;
  reason: string;
};

export type AssignedRole = {
  path: string;
  role: string;
};

export type ExtractedRoute = {
  file: string;
  method: string;
  pattern: string;
};

export type ParseResult = {
  framework: string;
  files: ParsedFile[];
  skipped: SkippedFile[];
  edges: Edge[];
  imports: ImportRecord[];
  excluded: ExcludedPath[];
  roles: AssignedRole[];
  routes: ExtractedRoute[];
};

export function resolved(target: string): ImportResolution {
  return { status: "resolved", target };
}

export function outside(resolvedPath: string): ImportResolution {
  return { status: "outside", resolvedPath };
}

export function excluded(resolvedPath: string, reason: string): ImportResolution {
  return { status: "excluded", resolvedPath, reason };
}

export function unresolved(reason: string): ImportResolution {
  return { status: "unresolved", reason };
}

const IMPORT_KINDS: readonly ImportKind[] = [
  "import",
  "re-export",
  "dynamic-import",
  "require",
];

const MODULE_KINDS: readonly ModuleKind[] = ["module", "script"];

export function readParseResult(value: unknown): ParseResult {
  const record = asRecord(value, "result");
  return {
    // Written before classification. No framework and no routes, rather than
    // a guess filled in at read time.
    framework:
      record.framework === undefined
        ? "none"
        : readString(record.framework, "framework"),
    files: asArray(record.files, "files").map((entry, index) =>
      readParsedFile(entry, `files[${index}]`),
    ),
    skipped: asArray(record.skipped, "skipped").map((entry, index) =>
      readSkippedFile(entry, `skipped[${index}]`),
    ),
    edges: asArray(record.edges, "edges").map((entry, index) =>
      readEdge(entry, `edges[${index}]`),
    ),
    imports: asArray(record.imports, "imports").map((entry, index) =>
      readImport(entry, `imports[${index}]`),
    ),
    excluded: asArray(record.excluded, "excluded").map((entry, index) =>
      readExcluded(entry, `excluded[${index}]`),
    ),
    roles:
      record.roles === undefined
        ? []
        : asArray(record.roles, "roles").map((entry, index) =>
            readRole(entry, `roles[${index}]`),
          ),
    routes:
      record.routes === undefined
        ? []
        : asArray(record.routes, "routes").map((entry, index) =>
            readRoute(entry, `routes[${index}]`),
          ),
  };
}

function readRole(value: unknown, where: string): { path: string; role: string } {
  const record = asRecord(value, where);
  const role = readString(record.role, `${where}.role`);
  if (!isRoleId(role)) {
    throw new Error(`Parse result is not valid: ${where}.role is not a known role`);
  }
  return {
    path: readString(record.path, `${where}.path`),
    role,
  };
}

function readRoute(
  value: unknown,
  where: string,
): { file: string; method: string; pattern: string } {
  const record = asRecord(value, where);
  const pattern = readString(record.pattern, `${where}.pattern`);
  if (!pattern.startsWith("/")) {
    throw new Error(`Parse result is not valid: ${where}.pattern does not start with /`);
  }
  return {
    file: readString(record.file, `${where}.file`),
    method: readString(record.method, `${where}.method`),
    pattern,
  };
}

function readParsedFile(value: unknown, where: string): ParsedFile {
  const record = asRecord(value, where);
  return {
    path: readString(record.path, `${where}.path`),
    folder: readString(record.folder, `${where}.folder`),
    lines: readCount(record.lines, `${where}.lines`),
    hash: readHash(record.hash, `${where}.hash`),
    moduleKind: readUnion(record.moduleKind, MODULE_KINDS, `${where}.moduleKind`),
    fanIn: readCount(record.fanIn, `${where}.fanIn`),
    fanOut: readCount(record.fanOut, `${where}.fanOut`),
  };
}

function readSkippedFile(value: unknown, where: string): SkippedFile {
  const record = asRecord(value, where);
  return {
    path: readString(record.path, `${where}.path`),
    folder: readString(record.folder, `${where}.folder`),
    reason: readString(record.reason, `${where}.reason`),
  };
}

function readEdge(value: unknown, where: string): Edge {
  const record = asRecord(value, where);
  return {
    source: readString(record.source, `${where}.source`),
    target: readString(record.target, `${where}.target`),
    kind: readUnion(record.kind, IMPORT_KINDS, `${where}.kind`),
    specifier: readString(record.specifier, `${where}.specifier`),
  };
}

function readImport(value: unknown, where: string): ImportRecord {
  const record = asRecord(value, where);
  return {
    source: readString(record.source, `${where}.source`),
    specifier: readText(record.specifier, `${where}.specifier`),
    kind: readUnion(record.kind, IMPORT_KINDS, `${where}.kind`),
    resolution: readResolution(record.resolution, `${where}.resolution`),
  };
}

function readExcluded(value: unknown, where: string): ExcludedPath {
  const record = asRecord(value, where);
  return {
    path: readString(record.path, `${where}.path`),
    reason: readString(record.reason, `${where}.reason`),
  };
}

function readResolution(value: unknown, where: string): ImportResolution {
  const record = asRecord(value, where);
  const status = record.status;
  switch (status) {
    case "resolved":
      return resolved(readString(record.target, `${where}.target`));
    case "outside":
      return outside(readString(record.resolvedPath, `${where}.resolvedPath`));
    case "excluded":
      return excluded(
        readString(record.resolvedPath, `${where}.resolvedPath`),
        readString(record.reason, `${where}.reason`),
      );
    case "unresolved":
      return unresolved(readString(record.reason, `${where}.reason`));
    default:
      throw new Error(
        `Parse result is not valid: ${where}.status is not a known outcome`,
      );
  }
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Parse result is not valid: ${where} is not an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Parse result is not valid: ${where} is not an array`);
  }
  return value;
}

function readString(value: unknown, where: string): string {
  const text = readText(value, where);
  if (text.length === 0) {
    throw new Error(`Parse result is not valid: ${where} is empty`);
  }
  return text;
}

function readText(value: unknown, where: string): string {
  if (typeof value !== "string") {
    throw new Error(`Parse result is not valid: ${where} is not a string`);
  }
  return value;
}

function readCount(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Parse result is not valid: ${where} is not a count`);
  }
  return value;
}

function readHash(value: unknown, where: string): string {
  const text = readString(value, where);
  if (!/^[0-9a-f]{64}$/.test(text)) {
    throw new Error(`Parse result is not valid: ${where} is not a sha256`);
  }
  return text;
}

function readUnion<T extends string>(
  value: unknown,
  allowed: readonly T[],
  where: string,
): T {
  if (typeof value !== "string" || !allowed.some((entry) => entry === value)) {
    throw new Error(`Parse result is not valid: ${where} is not a known value`);
  }
  const match = allowed.find((entry) => entry === value);
  if (match === undefined) {
    throw new Error(`Parse result is not valid: ${where} is not a known value`);
  }
  return match;
}
