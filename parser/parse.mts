import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Node, Project, SyntaxKind, type SourceFile, ts } from "ts-morph";

import { type FrameworkAdapter, noFramework } from "./adapter.mts";
import { connect } from "./graph.mts";
import {
  type ResolutionModeName,
  type SeenImport,
  resolveSeenImports,
} from "./resolve.mts";
import type { ImportRecord, ModuleKind, ParseResult, ParsedFile, SkippedFile } from "./types.mts";
import { type WalkedSource, walkRepository } from "./walk.mts";

export function parseRepository(
  directory: string,
  adapter: FrameworkAdapter = noFramework,
): ParseResult {
  const root = path.resolve(directory);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(root);
  } catch (error) {
    throw new Error(
      `Cannot read directory ${root}: ${errorMessage(error)}`,
    );
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const walked = walkRepository(root, adapter);
  const project = openProject(root);
  const parsed: ParsedFile[] = [];
  const skipped: SkippedFile[] = [...walked.skipped];
  const sourceFiles: { source: WalkedSource; file: SourceFile }[] = [];

  for (const source of walked.source) {
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(source.absolutePath);
    } catch (error) {
      const skip = skipFile(source, `could not read file: ${errorMessage(error)}`);
      skipped.push(skip);
      continue;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      const skip = skipFile(source, "file is not valid UTF-8");
      skipped.push(skip);
      continue;
    }
    let file: SourceFile;
    try {
      // createSourceFile refuses a path that already exists on disk. These
      // files do. overwrite replaces the in-memory tree and does not write
      // the file back.
      file = project.createSourceFile(source.absolutePath, text, {
        overwrite: true,
      });
    } catch (error) {
      const skip = skipFile(source, `parser failed: ${errorMessage(error)}`);
      skipped.push(skip);
      continue;
    }
    sourceFiles.push({ source, file });
    parsed.push({
      path: source.path,
      folder: source.folder,
      lines: countLines(text),
      hash: createHash("sha256").update(bytes).digest("hex"),
      moduleKind: moduleKindOf(file),
      fanIn: 0,
      fanOut: 0,
    });
  }

  const compilerOptions = project.compilerOptions.get();
  const resolvedImports = resolveSeenImports(
    root,
    sourceFiles.map(({ source }) => ({
      absolutePath: source.absolutePath,
      path: source.path,
    })),
    skipped,
    walked.excluded,
    sourceFiles.map(({ source, file }) => ({
      absolutePath: source.absolutePath,
      path: source.path,
      imports: seenImports(file, compilerOptions),
    })),
  );
  const imports = resolvedImports.imports;
  const rawEdges = resolvedImports.edges;

  const connected = connect(
    parsed.map((file) => file.path),
    rawEdges,
  );
  const files = parsed
    .map((file) => {
      const fan = connected.fan.get(file.path);
      if (fan === undefined) {
        throw new Error(`No fan-in or fan-out for ${file.path}`);
      }
      return { ...file, fanIn: fan.fanIn, fanOut: fan.fanOut };
    })
    .sort((a, b) => compareText(a.path, b.path));

  const result: ParseResult = {
    files,
    skipped: skipped.sort((a, b) => compareText(a.path, b.path)),
    edges: connected.edges,
    imports: imports.sort(compareImports),
    excluded: walked.excluded.sort((a, b) => compareText(a.path, b.path)),
  };
  assertResult(result);
  return result;
}

function openProject(root: string): Project {
  const tsconfig = path.join(root, "tsconfig.json");
  const jsconfig = path.join(root, "jsconfig.json");
  const configPath = fs.existsSync(tsconfig)
    ? tsconfig
    : fs.existsSync(jsconfig)
      ? jsconfig
      : undefined;
  try {
    if (configPath === undefined) {
      // No config in this directory. Bundler resolution is what makes an
      // extensionless relative import find a real file. It is not a guess
      // about a framework.
      return new Project({
        compilerOptions: {
          allowJs: true,
          jsx: ts.JsxEmit.Preserve,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ESNext,
          esModuleInterop: true,
          strict: true,
          noEmit: true,
        },
        skipFileDependencyResolution: true,
        skipLoadingLibFiles: true,
      });
    }
    return new Project({
      tsConfigFilePath: configPath,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      skipLoadingLibFiles: true,
    });
  } catch (error) {
    throw new Error(
      `Could not load TypeScript configuration in ${root}: ${errorMessage(error)}`,
    );
  }
}

function seenImports(
  file: SourceFile,
  compilerOptions: ts.CompilerOptions,
): SeenImport[] {
  const seen: SeenImport[] = [];
  for (const declaration of file.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifier();
    seen.push({
      kind: "import",
      specifier: specifier.getLiteralValue(),
      mode: resolutionMode(file, specifier.compilerNode, compilerOptions),
      literal: true,
    });
  }
  for (const declaration of file.getExportDeclarations()) {
    const specifier = declaration.getModuleSpecifier();
    if (specifier === undefined) continue;
    seen.push({
      kind: "re-export",
      specifier: specifier.getLiteralValue(),
      mode: resolutionMode(file, specifier.compilerNode, compilerOptions),
      literal: true,
    });
  }
  // require() is a later phase. A type-position import("x").T is not a
  // dynamic import. Only a call of the form import("...") is.
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
    const argument = call.getArguments()[0];
    if (
      argument !== undefined &&
      (Node.isStringLiteral(argument) ||
        Node.isNoSubstitutionTemplateLiteral(argument))
    ) {
      seen.push({
        kind: "dynamic-import",
        specifier: argument.getLiteralValue(),
        mode: resolutionMode(file, argument.compilerNode, compilerOptions),
        literal: true,
      });
      continue;
    }
    seen.push({
      kind: "dynamic-import",
      specifier: argument?.getText() ?? "",
      mode: undefined,
      literal: false,
    });
  }
  return seen;
}

function resolutionMode(
  file: SourceFile,
  literal: ts.StringLiteralLike,
  compilerOptions: ts.CompilerOptions,
): ResolutionModeName | undefined {
  const mode = ts.getModeForUsageLocation(file.compilerNode, literal, compilerOptions);
  if (mode === ts.ModuleKind.CommonJS) return "commonjs";
  if (mode === ts.ModuleKind.ESNext) return "esnext";
  return undefined;
}

function moduleKindOf(file: SourceFile): ModuleKind {
  // TypeScript's own decision: import or export syntax, or an ES module
  // format (.mts, .mjs, or "type": "module"). We don't decide from the name.
  if (ts.isExternalModule(file.compilerNode)) return "module";
  if (file.compilerNode.impliedNodeFormat === ts.ModuleKind.ESNext) {
    return "module";
  }
  return "script";
}

function skipFile(source: WalkedSource, reason: string): SkippedFile {
  return { path: source.path, folder: source.folder, reason };
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  const parts = text.split(/\r?\n/);
  if (parts[parts.length - 1] === "") parts.pop();
  return parts.length;
}

function assertResult(result: ParseResult): void {
  const nodes = new Set(result.files.map((file) => file.path));
  if (nodes.size !== result.files.length) {
    throw new Error("Two parsed files share a path");
  }
  for (const file of result.files) {
    const parent = path.posix.dirname(file.path);
    const folder = parent === "." ? "." : parent;
    if (file.folder !== folder) {
      throw new Error(
        `${file.path} is in folder ${file.folder}, expected ${folder}`,
      );
    }
  }
  for (const file of result.skipped) {
    if (file.reason.length === 0) {
      throw new Error(`Skipped file ${file.path} has no reason`);
    }
  }
  for (const edge of result.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) {
      throw new Error(
        `Edge ${edge.source} -> ${edge.target} points at a file that is not a node`,
      );
    }
  }
  for (const record of result.imports) {
    if (record.resolution.status === "unresolved" && record.resolution.reason.length === 0) {
      throw new Error(
        `Unresolved import ${record.source} ${record.specifier} has no reason`,
      );
    }
    if (record.resolution.status === "excluded" && record.resolution.reason.length === 0) {
      throw new Error(
        `Excluded import ${record.source} ${record.specifier} has no reason`,
      );
    }
  }
}

function compareImports(a: ImportRecord, b: ImportRecord): number {
  return (
    compareText(a.source, b.source) ||
    compareText(a.kind, b.kind) ||
    compareText(a.specifier, b.specifier) ||
    compareText(a.resolution.status, b.resolution.status)
  );
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
