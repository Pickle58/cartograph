import path from "node:path";
import { Node, SyntaxKind, ts, type SourceFile } from "ts-morph";
import type { ExcludedPath, ImportKind, ImportRecord } from "./types.mts";
import { excluded, outside, resolved, unresolved } from "./types.mts";

export type ResolvedImport = {
  record: ImportRecord;
  target: string | null;
};

export function importsIn(
  sourceFile: SourceFile,
  sourcePath: string,
  root: string,
  parsed: ReadonlySet<string>,
  skipped: ReadonlyMap<string, string>,
  excludedDirs: readonly ExcludedPath[],
  paths: ts.MapLike<string[]> | undefined,
): ResolvedImport[] {
  const found: ResolvedImport[] = [];
  for (const seen of collect(sourceFile)) {
    found.push(
      resolveOne(
        sourceFile,
        sourcePath,
        seen,
        root,
        parsed,
        skipped,
        excludedDirs,
        paths,
      ),
    );
  }
  return found;
}

type SeenImport = {
  specifier: string;
  kind: ImportKind;
  literal: boolean;
};

function collect(sourceFile: SourceFile): SeenImport[] {
  const seen: SeenImport[] = [];

  for (const declaration of sourceFile.getImportDeclarations()) {
    seen.push({
      specifier: declaration.getModuleSpecifierValue(),
      kind: "import",
      literal: true,
    });
  }

  for (const declaration of sourceFile.getExportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier === undefined) continue;
    seen.push({ specifier, kind: "re-export", literal: true });
  }

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;
    const argument = call.getArguments()[0];
    if (
      argument &&
      (Node.isStringLiteral(argument) ||
        Node.isNoSubstitutionTemplateLiteral(argument))
    ) {
      seen.push({
        specifier: argument.getLiteralText(),
        kind: "dynamic-import",
        literal: true,
      });
      continue;
    }
    seen.push({
      specifier: argument ? argument.getText() : "",
      kind: "dynamic-import",
      literal: false,
    });
  }

  return seen;
}

function resolveOne(
  sourceFile: SourceFile,
  sourcePath: string,
  seen: SeenImport,
  root: string,
  parsed: ReadonlySet<string>,
  skipped: ReadonlyMap<string, string>,
  excludedDirs: readonly ExcludedPath[],
  paths: ts.MapLike<string[]> | undefined,
): ResolvedImport {
  const base = {
    source: sourcePath,
    specifier: seen.specifier,
    kind: seen.kind,
  };

  if (!seen.literal) {
    return {
      record: {
        ...base,
        resolution: unresolved("dynamic import specifier is not a string literal"),
      },
      target: null,
    };
  }

  const resolution = ts.resolveModuleName(
    seen.specifier,
    sourceFile.getFilePath(),
    sourceFile.getProject().getCompilerOptions(),
    ts.sys,
  );
  const resolvedFile = resolution.resolvedModule?.resolvedFileName;

  if (resolvedFile === undefined) {
    if (isRelative(seen.specifier) || matchesPath(seen.specifier, paths)) {
      return {
        record: {
          ...base,
          resolution: unresolved(`no file found for '${seen.specifier}'`),
        },
        target: null,
      };
    }
    return {
      record: {
        ...base,
        resolution: outside(packageName(seen.specifier)),
      },
      target: null,
    };
  }

  const relative = insideRoot(root, resolvedFile);
  if (relative === null) {
    return {
      record: {
        ...base,
        resolution: outside(portableOutside(root, resolvedFile)),
      },
      target: null,
    };
  }

  const exclusion = excludedDirs.find(
    (dir) => relative === dir.path || relative.startsWith(`${dir.path}/`),
  );
  if (exclusion) {
    return {
      record: {
        ...base,
        resolution: excluded(relative, exclusion.reason),
      },
      target: null,
    };
  }

  if (parsed.has(relative)) {
    return {
      record: { ...base, resolution: resolved(relative) },
      target: relative,
    };
  }

  const skip = skipped.get(relative);
  const reason =
    skip === undefined
      ? `resolved to ${relative}, which is not a parsed file`
      : `resolved to ${relative}, skipped because ${skip}`;
  return {
    record: { ...base, resolution: unresolved(reason) },
    target: null,
  };
}

function isRelative(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    path.isAbsolute(specifier)
  );
}

function matchesPath(
  specifier: string,
  paths: ts.MapLike<string[]> | undefined,
): boolean {
  if (paths === undefined) return false;
  for (const pattern of Object.keys(paths)) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      if (specifier === pattern) return true;
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) return true;
  }
  return false;
}

function packageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    if (scope === undefined || name === undefined || name.length === 0) {
      return specifier;
    }
    return `${scope}/${name}`;
  }
  const name = specifier.split("/")[0];
  return name === undefined || name.length === 0 ? specifier : name;
}

function insideRoot(root: string, fileName: string): string | null {
  const relative = path.relative(root, fileName);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

function portableOutside(root: string, fileName: string): string {
  return path.relative(root, fileName).split(path.sep).join("/");
}
