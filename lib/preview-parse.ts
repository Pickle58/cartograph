import fs from "node:fs";
import path from "node:path";
import { noFramework } from "@/parser/adapter.mts";
import { readParseResult, type ParseResult } from "@/parser/types.mts";

// TanStack Query at dee1679bf42cad475a5c5810524475b2ffd6903d.
// Scaffolding: the map is built from this file, with no account and no network.
// It goes away once analyses are stored.
//
// Parsed with the no-framework adapter. It names no framework and recovers no
// routes, so the pane shows that id and a zero rather than a guess from paths.
export const previewRepository = {
  name: "TanStack Query",
  framework: noFramework.id,
  routeCount: 0,
} as const;
//
// Read at module scope. The file does not depend on the request, and a sync
// read here stays in the prerendered shell. JSON.parse is untyped;
// readParseResult is the check.
const previewParse: ParseResult = readParseResult(
  JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "data", "tanstack-query.json"),
      "utf8",
    ),
  ) as unknown,
);

export function previewParseResult(): ParseResult {
  return previewParse;
}
