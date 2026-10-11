import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Node, Project, SyntaxKind, ts, type SourceFile } from "ts-morph";
import type { FrameworkAdapter } from "./adapter.mts";
import { importsIn } from "./resolve.mts";
import type { Edge, ImportRecord, ModuleKind, ParseResult } from "./types.mts";
import { folderOf, walkRepository } from "./walk.mts";

export function parseRepository(
  root: string,
  adapter: FrameworkAdapter,
): ParseResult {
  const absoluteRoot = path.resolve(root);
  const walked = walkRepository(absoluteRoot, adapter.exclusions());
  const options = compilerOptionsFor(absoluteRoot);
  const project = new Project({
    compilerOptions: options,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const parsed = new Set(walked.parsed);
  const skipped = new Map(walked.skipped.map((file) => [file.path, file.reason]));
  const files = [];
  const edges: Edge[] = [];
  const imports: ImportRecord[] = [];
  const edgeKeys = new Set<string>();
  const targetsBySource = new Map<string, Set<string>>();

  for (const relative of walked.parsed) {
    const absolute = path.join(absoluteRoot, relative);
    let sourceFile: SourceFile;
    try {
      sourceFile = project.addSourceFileAtPath(absolute);
    } catch (error) {
      walked.skipped.push({
        path: relative,
        folder: folderOf(relative),
        reason: error instanceof Error ? error.message : "could not parse",
      });
      parsed.delete(relative);
      skipped.set(
        relative,
        error instanceof Error ? error.message : "could not parse",
      );
      continue;
    }

    const text = fs.readFileSync(absolute);
    files.push({
      path: relative,
      folder: folderOf(relative),
      lines: countLines(text),
      hash: crypto.createHash("sha256").update(text).digest("hex"),
      moduleKind: moduleKind(sourceFile, relative),
      fanIn: 0,
      fanOut: 0,
    });

    for (const item of importsIn(
      sourceFile,
      relative,
      absoluteRoot,
      parsed,
      skipped,
      walked.excluded,
      options.paths,
    )) {
      imports.push(item.record);
      if (item.target === null) continue;
      const edge: Edge = {
        source: relative,
        target: item.target,
        kind: item.record.kind,
        specifier: item.record.specifier,
      };
      const key = `${edge.source}\0${edge.target}\0${edge.kind}\0${edge.specifier}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push(edge);
      const targets = targetsBySource.get(relative) ?? new Set<string>();
      targets.add(item.target);
      targetsBySource.set(relative, targets);
    }
  }

  const sourcesByTarget = new Map<string, Set<string>>();
  for (const [source, targets] of targetsBySource) {
    for (const target of targets) {
      const sources = sourcesByTarget.get(target) ?? new Set<string>();
      sources.add(source);
      sourcesByTarget.set(target, sources);
    }
  }

  for (const file of files) {
    file.fanOut = targetsBySource.get(file.path)?.size ?? 0;
    file.fanIn = sourcesByTarget.get(file.path)?.size ?? 0;
  }

  walked.skipped.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
  edges.sort((left, right) => {
    if (left.source !== right.source) return left.source < right.source ? -1 : 1;
    if (left.target !== right.target) return left.target < right.target ? -1 : 1;
    if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
    if (left.specifier === right.specifier) return 0;
    return left.specifier < right.specifier ? -1 : 1;
  });

  return {
    files,
    skipped: walked.skipped,
    edges,
    imports,
    excluded: walked.excluded,
  };
}

function moduleKind(sourceFile: SourceFile, relative: string): ModuleKind {
  const extension = path.posix.extname(relative);
  if (extension === ".mjs" || extension === ".mts") return "module";
  if (extension === ".cjs" || extension === ".cts") return "script";
  for (const statement of sourceFile.getStatements()) {
    if (
      Node.isImportDeclaration(statement) ||
      Node.isExportDeclaration(statement) ||
      Node.isExportAssignment(statement)
    ) {
      return "module";
    }
    if (!Node.isModifierable(statement)) continue;
    if (statement.getFirstModifierByKind(SyntaxKind.ExportKeyword) !== undefined) {
      return "module";
    }
  }
  return "script";
}

function countLines(contents: Buffer): number {
  if (contents.length === 0) return 0;
  let lines = 1;
  for (const byte of contents) {
    if (byte === 10) lines += 1;
  }
  if (contents[contents.length - 1] === 10) lines -= 1;
  return lines;
}

function compilerOptionsFor(root: string): ts.CompilerOptions {
  const options: ts.CompilerOptions = {
    allowJs: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: root,
  };
  const configPath = path.join(root, "tsconfig.json");
  if (!fs.existsSync(configPath)) return options;
  const parsed = ts.parseConfigFileTextToJson(
    configPath,
    fs.readFileSync(configPath, "utf8"),
  );
  const raw = parsed.config?.compilerOptions;
  if (typeof raw !== "object" || raw === null) return options;
  const record = raw as Record<string, unknown>;
  if (typeof record.baseUrl === "string") {
    options.baseUrl = path.resolve(path.dirname(configPath), record.baseUrl);
  }
  if (typeof record.paths === "object" && record.paths !== null) {
    options.paths = record.paths as ts.MapLike<string[]>;
  }
  return options;
}
