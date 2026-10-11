import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { isInsideRoot, pathKey, toRepoPath } from "./paths.mts";
import type {
  Edge,
  ExcludedPath,
  ImportKind,
  ImportRecord,
  ImportResolution,
  SkippedFile,
} from "./types.mts";
import { excluded, outside, resolved, unresolved } from "./types.mts";
import { isSourceExtension, NOT_SOURCE } from "./walk.mts";

export const UNRESOLVED_NOT_LITERAL = "specifier is not a string literal";
export const UNRESOLVED_NOT_FOUND =
  "TypeScript could not resolve this specifier";
export const UNRESOLVED_AMBIENT =
  "resolved to an ambient module declaration, not a file";

export type ResolutionModeName = "commonjs" | "esnext";

export type SeenImport = {
  kind: ImportKind;
  specifier: string;
  mode: ResolutionModeName | undefined;
  literal: boolean;
};

type ParsedRef = {
  absolutePath: string;
  path: string;
};

export function resolveSeenImports(
  root: string,
  parsed: readonly ParsedRef[],
  skipped: readonly SkippedFile[],
  excludedPaths: readonly ExcludedPath[],
  files: readonly { absolutePath: string; path: string; imports: readonly SeenImport[] }[],
): { imports: ImportRecord[]; edges: Edge[] } {
  const options = compilerOptionsFor(root);
  // The parser's library bundles a newer TypeScript that does not load
  // @types unless the config opts in. This is the compiler the repository
  // typechecks with, so a specifier that compiles is not reported as a failure.
  const program = ts.createProgram({
    rootNames: parsed.map((file) => file.absolutePath),
    options,
  });
  const sourceFiles = new Map<string, ts.SourceFile>();
  for (const sourceFile of program.getSourceFiles()) {
    sourceFiles.set(pathKey(sourceFile.fileName), sourceFile);
  }
  const checker = program.getTypeChecker();
  const cache = ts.createModuleResolutionCache(
    root,
    (fileName) =>
      ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
    options,
  );
  const parsedByKey = new Map(parsed.map((file) => [pathKey(file.absolutePath), file]));
  const skippedByKey = new Map(
    skipped.map((file) => [pathKey(path.join(root, ...file.path.split("/"))), file]),
  );

  const imports: ImportRecord[] = [];
  const edges: Edge[] = [];
  for (const file of files) {
    for (const seen of file.imports) {
      const resolution = resolveOne(
        seen,
        file.absolutePath,
        root,
        options,
        cache,
        checker,
        sourceFiles,
        parsedByKey,
        skippedByKey,
        excludedPaths,
      );
      imports.push({
        source: file.path,
        specifier: seen.specifier,
        kind: seen.kind,
        resolution,
      });
      if (resolution.status === "resolved") {
        edges.push({
          source: file.path,
          target: resolution.target,
          kind: seen.kind,
          specifier: seen.specifier,
        });
      }
    }
  }
  return { imports, edges };
}

function resolveOne(
  seen: SeenImport,
  fromAbsolute: string,
  root: string,
  options: ts.CompilerOptions,
  cache: ts.ModuleResolutionCache,
  checker: ts.TypeChecker,
  sourceFiles: ReadonlyMap<string, ts.SourceFile>,
  parsedByKey: ReadonlyMap<string, ParsedRef>,
  skippedByKey: ReadonlyMap<string, SkippedFile>,
  excludedPaths: readonly ExcludedPath[],
): ImportResolution {
  if (!seen.literal) return unresolved(UNRESOLVED_NOT_LITERAL);

  const resolvedModule = ts.resolveModuleName(
    seen.specifier,
    fromAbsolute,
    options,
    ts.sys,
    cache,
    undefined,
    toResolutionMode(seen.mode),
  ).resolvedModule;
  if (resolvedModule !== undefined) {
    return classifyFile(
      resolvedModule.resolvedFileName,
      resolvedModule.isExternalLibraryImport === true,
      root,
      parsedByKey,
      skippedByKey,
      excludedPaths,
    );
  }

  // The specifier is already a relative path. Accept it only when that exact
  // path is a file or directory we already refused — no extension search.
  const exact = exactRelative(fromAbsolute, seen.specifier);
  if (exact !== undefined && isInsideRoot(root, exact)) {
    const skippedFile = skippedByKey.get(pathKey(exact));
    if (skippedFile !== undefined) return excluded(skippedFile.path, skippedFile.reason);
    const repoPath = toRepoPath(root, exact);
    const reason = exclusionReason(repoPath, excludedPaths);
    if (reason !== undefined) return excluded(repoPath, reason);
  }

  const ambient = ambientDeclaration(sourceFiles, checker, fromAbsolute, seen.specifier);
  if (ambient !== undefined) {
    if (pointsOutside(root, ambient, false)) return outside(displayPath(root, ambient));
    return unresolved(UNRESOLVED_AMBIENT);
  }

  return unresolved(UNRESOLVED_NOT_FOUND);
}

function classifyFile(
  absolute: string,
  external: boolean,
  root: string,
  parsedByKey: ReadonlyMap<string, ParsedRef>,
  skippedByKey: ReadonlyMap<string, SkippedFile>,
  excludedPaths: readonly ExcludedPath[],
): ImportResolution {
  if (pointsOutside(root, absolute, external)) return outside(displayPath(root, absolute));

  const parsedFile = parsedByKey.get(pathKey(absolute));
  if (parsedFile !== undefined) return resolved(parsedFile.path);

  const skippedFile = skippedByKey.get(pathKey(absolute));
  if (skippedFile !== undefined) return excluded(skippedFile.path, skippedFile.reason);

  const repoPath = toRepoPath(root, absolute);
  const reason = exclusionReason(repoPath, excludedPaths);
  if (reason !== undefined) return excluded(repoPath, reason);
  if (!isSourceExtension(path.posix.extname(repoPath))) return excluded(repoPath, NOT_SOURCE);
  return excluded(repoPath, "file was not selected as a node");
}

function pointsOutside(root: string, absolute: string, external: boolean): boolean {
  if (external || !isInsideRoot(root, absolute)) return true;
  return toRepoPath(root, absolute).split("/").includes("node_modules");
}

function displayPath(root: string, absolute: string): string {
  if (!isInsideRoot(root, absolute)) return path.resolve(absolute);
  return toRepoPath(root, absolute);
}

function exactRelative(fromAbsolute: string, specifier: string): string | undefined {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return undefined;
  return path.resolve(path.dirname(fromAbsolute), specifier);
}

function exclusionReason(
  repoPath: string,
  excludedPaths: readonly ExcludedPath[],
): string | undefined {
  const segments = repoPath.split("/");
  for (const excludedPath of excludedPaths) {
    const excludedSegments = excludedPath.path.split("/");
    if (excludedSegments.length > segments.length) continue;
    const matches = excludedSegments.every(
      (segment, index) => segment === segments[index],
    );
    if (matches) return excludedPath.reason;
  }
  return undefined;
}

// A wildcard such as `declare module "*.css"` matches every specifier, including
// one whose file is not there. Only an exact module name counts.
function ambientDeclaration(
  sourceFiles: ReadonlyMap<string, ts.SourceFile>,
  checker: ts.TypeChecker,
  fromAbsolute: string,
  specifier: string,
): string | undefined {
  const sourceFile = sourceFiles.get(pathKey(fromAbsolute));
  if (sourceFile === undefined) return undefined;
  let found: string | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    const literal = specifierLiteral(node, specifier);
    if (literal !== undefined) {
      const symbol = checker.getSymbolAtLocation(literal);
      const fileName = declarationFile(symbol, specifier);
      if (fileName !== undefined) found = fileName;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function specifierLiteral(node: ts.Node, specifier: string): ts.StringLiteral | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text === specifier
  ) {
    return node.moduleSpecifier;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    const argument = node.arguments[0];
    if (argument !== undefined && ts.isStringLiteral(argument) && argument.text === specifier) {
      return argument;
    }
  }
  return undefined;
}

function declarationFile(
  symbol: ts.Symbol | undefined,
  specifier: string,
): string | undefined {
  if (symbol === undefined) return undefined;
  for (const declaration of symbol.getDeclarations() ?? []) {
    if (!ts.isModuleDeclaration(declaration)) continue;
    const name = moduleDeclarationName(declaration);
    if (name === undefined || name.includes("*") || name !== specifier) continue;
    return declaration.getSourceFile().fileName;
  }
  return undefined;
}

function moduleDeclarationName(declaration: ts.ModuleDeclaration): string | undefined {
  if (ts.isStringLiteral(declaration.name)) return declaration.name.text;
  return undefined;
}

function toResolutionMode(mode: ResolutionModeName | undefined): ts.ResolutionMode | undefined {
  switch (mode) {
    case "commonjs":
      return ts.ModuleKind.CommonJS;
    case "esnext":
      return ts.ModuleKind.ESNext;
    case undefined:
      return undefined;
    default: {
      const unexpected: never = mode;
      throw new Error(`Unexpected resolution mode: ${String(unexpected)}`);
    }
  }
}

function compilerOptionsFor(root: string): ts.CompilerOptions {
  const tsconfig = path.join(root, "tsconfig.json");
  const jsconfig = path.join(root, "jsconfig.json");
  const configPath = fs.existsSync(tsconfig)
    ? tsconfig
    : fs.existsSync(jsconfig)
      ? jsconfig
      : undefined;
  if (configPath === undefined) {
    return {
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ESNext,
      esModuleInterop: true,
      strict: true,
      noEmit: true,
    };
  }
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(
      `Could not read ${configPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    root,
    undefined,
    configPath,
  );
  if (parsed.errors.length > 0) {
    const message = parsed.errors
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
      .join("\n");
    throw new Error(`Could not load TypeScript configuration in ${root}: ${message}`);
  }
  return parsed.options;
}
