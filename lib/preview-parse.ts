import fs from "node:fs";
import path from "node:path";
import { selectAdapter } from "@/parser/detect.mts";
import { parseRepository } from "@/parser/parse.mts";
import type { ParseResult } from "@/parser/types.mts";

// The map classifies the repository this app is running in. There is no
// stored analysis to read yet, so the parse happens here.
const root = process.cwd();
const previewParse: ParseResult = parseRepository(root, selectAdapter(root));

export const previewRepository = {
  name: packageName(root),
  framework: previewParse.framework,
};

export function previewParseResult(): ParseResult {
  return previewParse;
}

function packageName(directory: string): string {
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(directory, "package.json"), "utf8"),
    );
    if (typeof parsed === "object" && parsed !== null && "name" in parsed) {
      const name = parsed.name;
      if (typeof name === "string" && name.length > 0) return name;
    }
  } catch {
    return path.basename(directory);
  }
  return path.basename(directory);
}
