import fs from "node:fs";
import path from "node:path";
import { noFramework } from "./adapter.mts";
import { parseRepository } from "./parse.mts";
import { readParseResult, type ImportRecord } from "./types.mts";

const directory = process.argv[2];
const outFlag = process.argv.indexOf("--out");
const outPath = outFlag === -1 ? undefined : process.argv[outFlag + 1];

if (directory === undefined || directory.startsWith("--") || (outFlag !== -1 && outPath === undefined)) {
  process.stderr.write("usage: node parser/cli.mts <directory> [--out <file>]\n");
  process.exit(1);
}

const result = parseRepository(directory, noFramework);
const checked = readParseResult(JSON.parse(JSON.stringify(result)));

if (outPath !== undefined) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(checked, null, 2)}\n`);
}

const reexports = checked.imports.filter((item) => item.kind === "re-export");
const reexportsResolved = reexports.filter(
  (item) => item.resolution.status === "resolved",
);
const found = checked.files.length + checked.skipped.length;

process.stdout.write(
  [
    `files found ${found}`,
    `parsed ${checked.files.length}`,
    `skipped ${checked.skipped.length}`,
    `imports ${checked.imports.length}`,
    `resolved ${count(checked.imports, "resolved")}`,
    `outside ${count(checked.imports, "outside")}`,
    `excluded ${count(checked.imports, "excluded")}`,
    `unresolved ${count(checked.imports, "unresolved")}`,
    `re-exports found ${reexports.length}`,
    `re-exports resolved ${reexportsResolved.length}`,
    "",
  ].join("\n"),
);

for (const item of reexports) {
  if (item.resolution.status === "resolved") continue;
  process.stdout.write(
    `re-export ${item.source} '${item.specifier}' ${item.resolution.status}: ${reasonOf(item)}\n`,
  );
}

for (const item of checked.imports) {
  if (item.resolution.status !== "unresolved") continue;
  process.stdout.write(
    `unresolved ${item.source} '${item.specifier}' (${item.kind}): ${item.resolution.reason}\n`,
  );
}

function count(imports: readonly ImportRecord[], status: ImportRecord["resolution"]["status"]): number {
  return imports.filter((item) => item.resolution.status === status).length;
}

function reasonOf(item: ImportRecord): string {
  switch (item.resolution.status) {
    case "resolved":
      return item.resolution.target;
    case "outside":
      return item.resolution.resolvedPath;
    case "excluded":
      return item.resolution.reason;
    case "unresolved":
      return item.resolution.reason;
    default: {
      const unhandled: never = item.resolution;
      return String(unhandled);
    }
  }
}
