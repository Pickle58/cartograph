import fs from "node:fs";
import path from "node:path";

import { selectAdapter } from "./detect.mts";
import { parseRepository } from "./parse.mts";
import { readParseResult, type ImportRecord, type ParseResult } from "./types.mts";

const directory = readArguments(process.argv.slice(2));

try {
  const adapter = selectAdapter(directory.directory);
  const result = parseRepository(directory.directory, adapter);
  report(result);
  if (directory.out !== undefined) {
    writeAndReadBack(directory.out, result);
  }
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}

function report(result: ParseResult): void {
  const found = result.files.length + result.skipped.length;
  const folders = new Set(result.files.map((file) => file.folder));
  const resolutions = countResolutions(result.imports);
  const reexports = result.imports.filter((record) => record.kind === "re-export");
  const reexportResolutions = countResolutions(reexports);

  console.log(`framework: ${result.framework}`);
  console.log(`files found: ${found}`);
  console.log(`files parsed: ${result.files.length}`);
  console.log(`files skipped: ${result.skipped.length}`);
  console.log(`distinct folders: ${folders.size}`);
  console.log(`edges: ${result.edges.length}`);
  console.log(`routes: ${result.routes.length}`);
  const roleCounts = new Map<string, number>();
  for (const role of result.roles) {
    roleCounts.set(role.role, (roleCounts.get(role.role) ?? 0) + 1);
  }
  console.log("roles:");
  for (const [role, count] of [...roleCounts].sort((a, b) => compareText(a[0], b[0]))) {
    console.log(`  ${role}: ${count}`);
  }
  console.log("routes:");
  for (const route of result.routes) {
    console.log(`  ${route.method} ${route.pattern} ${route.file}`);
  }
  console.log(`imports resolved: ${resolutions.resolved}`);
  console.log(`imports outside: ${resolutions.outside}`);
  console.log(`imports excluded: ${resolutions.excluded}`);
  console.log(`imports unresolved: ${resolutions.unresolved}`);
  console.log(`re-exports found: ${reexports.length}`);
  console.log(`re-exports resolved: ${reexportResolutions.resolved}`);
  console.log(`re-exports outside: ${reexportResolutions.outside}`);
  console.log(`re-exports excluded: ${reexportResolutions.excluded}`);
  console.log(`re-exports unresolved: ${reexportResolutions.unresolved}`);

  if (found !== result.files.length + result.skipped.length) {
    throw new Error("files found is not parsed plus skipped");
  }
  const reexportGaps =
    reexportResolutions.outside +
    reexportResolutions.excluded +
    reexportResolutions.unresolved;
  if (reexportResolutions.resolved + reexportGaps !== reexports.length) {
    throw new Error("re-export outcomes do not add up");
  }

  console.log("skip reasons:");
  for (const [reason, paths] of groupBy(result.skipped, (file) => file.reason)) {
    console.log(`  ${reason}: ${paths.length}`);
    for (const filePath of paths) console.log(`    ${filePath}`);
  }
  console.log("excluded paths:");
  for (const entry of result.excluded) {
    console.log(`  ${entry.path}: ${entry.reason}`);
  }
  console.log("unresolved imports:");
  for (const record of result.imports) {
    if (record.resolution.status !== "unresolved") continue;
    console.log(
      `  ${record.source} ${record.kind} ${JSON.stringify(record.specifier)}: ${record.resolution.reason}`,
    );
  }
}

function writeAndReadBack(outPath: string, result: ParseResult): void {
  const absolute = path.resolve(outPath);
  fs.writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`);
  const read = readParseResult(JSON.parse(fs.readFileSync(absolute, "utf8")));
  if (JSON.stringify(read) !== JSON.stringify(result)) {
    throw new Error(`Read-back of ${absolute} did not match what was written`);
  }
  console.log(`wrote: ${absolute}`);
  console.log(`read back: ${read.files.length} files, types hold`);
}

function countResolutions(records: readonly ImportRecord[]): {
  resolved: number;
  outside: number;
  excluded: number;
  unresolved: number;
} {
  const counts = { resolved: 0, outside: 0, excluded: 0, unresolved: 0 };
  for (const record of records) {
    const status = record.resolution.status;
    switch (status) {
      case "resolved":
        counts.resolved += 1;
        break;
      case "outside":
        counts.outside += 1;
        break;
      case "excluded":
        counts.excluded += 1;
        break;
      case "unresolved":
        counts.unresolved += 1;
        break;
      default: {
        const unexpected: never = status;
        throw new Error(`Unexpected import status: ${String(unexpected)}`);
      }
    }
  }
  return counts;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const name = key(item);
    const list = groups.get(name);
    if (list === undefined) groups.set(name, [label(item)]);
    else list.push(label(item));
  }
  return groups;
}

function label(item: unknown): string {
  if (typeof item === "object" && item !== null && "path" in item) {
    const filePath = item.path;
    if (typeof filePath === "string") return filePath;
  }
  return String(item);
}

function readArguments(args: readonly string[]): { directory: string; out: string | undefined } {
  let directory: string | undefined;
  let out: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === "--out") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) usage();
      out = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
    if (directory !== undefined) usage();
    directory = arg;
  }
  if (directory === undefined) usage();
  return { directory, out };
}

function usage(): never {
  console.error("Usage: node parser/cli.mts <directory> [--out <file>]");
  process.exit(1);
}
