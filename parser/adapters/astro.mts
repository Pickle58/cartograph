import fs from "node:fs";
import path from "node:path";
import {
  Node,
  SyntaxKind,
  type ObjectLiteralExpression,
  type SourceFile,
  type Statement,
} from "ts-morph";

import type { AdapterFile, AdapterRoute, FrameworkAdapter } from "../adapter.mts";
import { isInsideRoot } from "../paths.mts";
import { API_ENDPOINT, COMPONENT, LAYOUT, PAGE_ROUTE, type RoleId } from "../roles.mts";
import { manifestDependsOn } from "./manifest.mts";

const CONFIG_FILES = [
  "astro.config.mjs",
  "astro.config.js",
  "astro.config.ts",
  "astro.config.mts",
  "astro.config.cjs",
  "astro.config.cts",
] as const;

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

const BUILD_FORMATS = ["directory", "file", "preserve"] as const;
const TRAILING_SLASHES = ["always", "never", "ignore"] as const;

const SCRIPT_EXT = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

const DIRECTORY_ROLES: ReadonlyMap<string, RoleId> = new Map([
  ["layout", LAYOUT],
  ["layouts", LAYOUT],
  ["component", COMPONENT],
  ["components", COMPONENT],
]);

type BuildFormat = (typeof BUILD_FORMATS)[number];
type TrailingSlash = (typeof TRAILING_SLASHES)[number];
type PageKind = "page" | "endpoint";

type RouteSettings = {
  format: BuildFormat;
  trailingSlash: TrailingSlash;
  base: string;
};

type Routing = {
  pagesDir: string | undefined;
  settings: RouteSettings | undefined;
};

type RawRoute = {
  kind: PageKind;
  pattern: string;
  index: boolean;
};

const DEFAULT_ROUTING: Routing = {
  pagesDir: "src/pages",
  settings: { format: "directory", trailingSlash: "ignore", base: "" },
};

export const astroAdapter: FrameworkAdapter = {
  id: "astro",
  exclusions() {
    return [];
  },
  matches(root) {
    return manifestDependsOn(root, "astro") || configPresent(root).length > 0;
  },
  assign(root, files) {
    const routing = readRouting(root, files);
    const roles: { path: string; role: RoleId }[] = [];
    const routed: { file: AdapterFile; found: RawRoute }[] = [];
    for (const file of files) {
      if (isIgnored(file.path)) continue;
      const relative =
        routing.pagesDir === undefined ? undefined : relativeTo(file.path, routing.pagesDir);
      if (relative !== undefined) {
        const found = rawRoute(relative);
        if (found === undefined) continue;
        roles.push({
          path: file.path,
          role: found.kind === "page" ? PAGE_ROUTE : API_ENDPOINT,
        });
        routed.push({ file, found });
        continue;
      }
      const role = directoryRole(file.path);
      if (role !== undefined) roles.push({ path: file.path, role });
    }
    return {
      roles,
      routes: routing.settings === undefined ? [] : emitRoutes(routed, routing.settings),
    };
  },
};

function rawRoute(relative: string): RawRoute | undefined {
  const split = splitLanguage(relative);
  if (split === undefined) return undefined;
  const segments = split.stem.split("/");
  if (segments.some((segment) => segment.startsWith("_") || segment.length === 0)) {
    return undefined;
  }
  const last = segments[segments.length - 1];
  const index = last === "index";
  if (index) segments.pop();
  return {
    kind: split.kind,
    index,
    pattern: segments.length === 0 ? "/" : `/${segments.join("/")}`,
  };
}

function splitLanguage(relative: string): { stem: string; kind: PageKind } | undefined {
  const lower = relative.toLowerCase();
  if (lower.endsWith(".astro")) {
    return { stem: relative.slice(0, -".astro".length), kind: "page" };
  }
  const match = SCRIPT_EXT.exec(lower);
  if (match === null || match.index !== lower.length - match[0].length) return undefined;
  return { stem: relative.slice(0, match.index), kind: "endpoint" };
}

function directoryRole(filePath: string): RoleId | undefined {
  const segments = filePath.split("/");
  segments.pop();
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment === undefined) continue;
    const role = DIRECTORY_ROLES.get(segment.toLowerCase());
    if (role !== undefined) return role;
  }
  return undefined;
}

function emitRoutes(
  routed: readonly { file: AdapterFile; found: RawRoute }[],
  settings: RouteSettings,
): AdapterRoute[] {
  const pending: AdapterRoute[] = [];
  for (const entry of routed) {
    const formatted = applyFormat(entry.found, settings.format);
    const pattern = finishPattern(formatted, settings);
    if (!pattern.startsWith("/")) continue;
    const methods = entry.found.kind === "page" ? ["GET"] : exportedMethods(entry.file.source);
    for (const method of methods) {
      pending.push({ file: entry.file.path, method, pattern });
    }
  }
  // Two files on one pattern cannot both be served. Astro's priority order
  // would pick one, and that pick is not written in the files, so neither is.
  const filesByPattern = new Map<string, Set<string>>();
  for (const route of pending) {
    const files = filesByPattern.get(route.pattern) ?? new Set<string>();
    files.add(route.file);
    filesByPattern.set(route.pattern, files);
  }
  const conflicting = new Set<string>();
  for (const [pattern, files] of filesByPattern) {
    if (files.size > 1) conflicting.add(pattern);
  }
  const routes: AdapterRoute[] = [];
  const seen = new Set<string>();
  for (const route of pending) {
    if (conflicting.has(route.pattern)) continue;
    const key = `${route.file}\0${route.method}\0${route.pattern}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push(route);
  }
  return routes;
}

function applyFormat(found: RawRoute, format: BuildFormat): string {
  if (found.kind === "endpoint") return found.pattern;
  switch (format) {
    case "directory":
      return found.pattern;
    case "file":
      return found.pattern === "/" ? found.pattern : `${found.pattern}.html`;
    case "preserve":
      return found.index ? found.pattern : `${found.pattern}.html`;
    default: {
      const unexpected: never = format;
      throw new Error(`Unexpected build format: ${String(unexpected)}`);
    }
  }
}

function finishPattern(pattern: string, settings: RouteSettings): string {
  const prefixed =
    settings.base === ""
      ? pattern
      : pattern === "/"
        ? settings.base
        : `${settings.base}${pattern}`;
  if (settings.trailingSlash !== "always") return prefixed;
  if (prefixed === "/" || prefixed.endsWith("/") || hasFileExtension(prefixed)) return prefixed;
  return `${prefixed}/`;
}

function hasFileExtension(pattern: string): boolean {
  const segment = pattern.slice(pattern.lastIndexOf("/") + 1);
  return segment.lastIndexOf(".") > 0;
}

// No config means the defaults. More than one config, a value that is not a
// literal, an i18n setting, or an adapter that does not also set build.format
// means the URL is not known, so no route is emitted. An unreadable srcDir
// also drops page roles, because the pages directory would be a guess.
function readRouting(root: string, files: readonly AdapterFile[]): Routing {
  const present = configPresent(root);
  if (present.length > 1) return { pagesDir: undefined, settings: undefined };
  if (present.length === 0) return DEFAULT_ROUTING;
  const name = present[0];
  if (name === undefined) return { pagesDir: undefined, settings: undefined };
  const parsed = files.find((file) => file.path === name);
  if (parsed === undefined) return { pagesDir: undefined, settings: undefined };
  const object = configObject(parsed.source);
  if (object === undefined) return { pagesDir: undefined, settings: undefined };

  const pagesDir = readPagesDir(object, root);
  if (pagesDir === "unreadable") return { pagesDir: undefined, settings: undefined };
  const resolvedPages = pagesDir === "absent" ? "src/pages" : pagesDir;
  if (object.getProperty("i18n") !== undefined) {
    return { pagesDir: resolvedPages, settings: undefined };
  }

  const base = readBase(object);
  if (base === "unreadable") return { pagesDir: resolvedPages, settings: undefined };
  const trailingSlash = readTrailingSlash(object);
  if (trailingSlash === "unreadable") return { pagesDir: resolvedPages, settings: undefined };
  const format = readFormat(object);
  if (format === "unreadable") return { pagesDir: resolvedPages, settings: undefined };
  if (object.getProperty("adapter") !== undefined && format === "absent") {
    return { pagesDir: resolvedPages, settings: undefined };
  }

  return {
    pagesDir: resolvedPages,
    settings: {
      format: format === "absent" ? "directory" : format,
      trailingSlash: trailingSlash === "absent" ? "ignore" : trailingSlash,
      base: base === "absent" ? "" : base,
    },
  };
}

function readPagesDir(
  object: ObjectLiteralExpression,
  root: string,
): "absent" | "unreadable" | string {
  const srcDir = stringProperty(object, "srcDir");
  if (srcDir === "absent" || srcDir === "unreadable") return srcDir;
  const pages = pagesDirectory(root, srcDir);
  if (pages === undefined) return "unreadable";
  return pages;
}

function pagesDirectory(root: string, srcDir: string): string | undefined {
  const portable = srcDir.replaceAll("\\", "/");
  if (portable.includes("://") || portable.startsWith("//")) return undefined;
  if (path.posix.isAbsolute(portable) || path.win32.isAbsolute(srcDir)) return undefined;
  const normalized = path.posix.normalize(portable);
  if (normalized.split("/").includes("..")) return undefined;
  const relative = normalized === "." ? "" : normalized.replace(/^\.\//, "").replace(/\/$/, "");
  if (relative.split("/").some((segment) => segment.length === 0)) return undefined;
  const absolute = path.resolve(root, relative === "" ? "." : relative);
  const atRoot = path.resolve(absolute) === path.resolve(root);
  if (!atRoot && !isInsideRoot(root, absolute)) return undefined;
  return relative === "" ? "pages" : `${relative}/pages`;
}

function readBase(object: ObjectLiteralExpression): "absent" | "unreadable" | string {
  const base = stringProperty(object, "base");
  if (base === "absent" || base === "unreadable") return base;
  const prefix = normalizeBase(base);
  if (prefix === undefined) return "unreadable";
  return prefix;
}

function normalizeBase(value: string): string | undefined {
  if (value.includes("\\") || value.includes("://") || value.includes("?") || value.includes("#")) {
    return undefined;
  }
  if (value === "" || value === "/") return "";
  let prefix = value.startsWith("/") ? value : `/${value}`;
  if (prefix.endsWith("/")) prefix = prefix.slice(0, -1);
  if (prefix.length === 0 || prefix.includes("//") || prefix.split("/").includes("..")) {
    return undefined;
  }
  return prefix;
}

function readTrailingSlash(
  object: ObjectLiteralExpression,
): "absent" | "unreadable" | TrailingSlash {
  return literalProperty(object, "trailingSlash", TRAILING_SLASHES);
}

function readFormat(object: ObjectLiteralExpression): "absent" | "unreadable" | BuildFormat {
  const property = object.getProperty("build");
  if (property === undefined) return "absent";
  if (!Node.isPropertyAssignment(property)) return "unreadable";
  const initializer = property.getInitializer();
  if (initializer === undefined) return "unreadable";
  const value = unwrap(initializer);
  if (!Node.isObjectLiteralExpression(value)) return "unreadable";
  if (value.getProperties().some((entry) => Node.isSpreadAssignment(entry))) return "unreadable";
  return literalProperty(value, "format", BUILD_FORMATS);
}

function literalProperty<T extends string>(
  object: ObjectLiteralExpression,
  name: string,
  allowed: readonly T[],
): "absent" | "unreadable" | T {
  const raw = stringProperty(object, name);
  if (raw === "absent" || raw === "unreadable") return raw;
  const match = allowed.find((entry) => entry === raw);
  if (match === undefined) return "unreadable";
  return match;
}

function configPresent(root: string): string[] {
  return CONFIG_FILES.filter((name) =>
    fs.existsSync(
      /*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, name),
    ),
  );
}

function configObject(source: SourceFile): ObjectLiteralExpression | undefined {
  for (const exported of source.getExportAssignments()) {
    if (exported.isExportEquals()) continue;
    const found = objectFrom(exported.getExpression(), source, 0);
    if (found !== undefined) return found;
  }
  for (const statement of source.getStatements()) {
    const assigned = moduleExportsObject(statement, source);
    if (assigned !== undefined) return assigned;
  }
  for (const declaration of source.getExportDeclarations()) {
    if (declaration.getModuleSpecifier() !== undefined) continue;
    for (const specifier of declaration.getNamedExports()) {
      const exported = specifier.getAliasNode()?.getText() ?? specifier.getName();
      if (exported !== "default") continue;
      const found = objectFromName(specifier.getName(), source, 0);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function moduleExportsObject(
  statement: Statement,
  source: SourceFile,
): ObjectLiteralExpression | undefined {
  if (!Node.isExpressionStatement(statement)) return undefined;
  const expression = statement.getExpression();
  if (!Node.isBinaryExpression(expression)) return undefined;
  if (expression.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return undefined;
  if (expression.getLeft().getText() !== "module.exports") return undefined;
  return objectFrom(expression.getRight(), source, 0);
}

function objectFrom(
  expression: Node,
  source: SourceFile,
  depth: number,
): ObjectLiteralExpression | undefined {
  if (depth > 4) return undefined;
  const value = unwrap(expression);
  if (Node.isObjectLiteralExpression(value)) {
    if (value.getProperties().some((property) => Node.isSpreadAssignment(property))) {
      return undefined;
    }
    return value;
  }
  if (Node.isIdentifier(value)) return objectFromName(value.getText(), source, depth + 1);
  if (!Node.isCallExpression(value)) return undefined;
  const callee = value.getExpression();
  if (!Node.isIdentifier(callee) || callee.getText() !== "defineConfig") return undefined;
  const argument = value.getArguments()[0];
  if (argument === undefined) return undefined;
  return objectFrom(argument, source, depth + 1);
}

function objectFromName(
  name: string,
  source: SourceFile,
  depth: number,
): ObjectLiteralExpression | undefined {
  for (const statement of source.getStatements()) {
    if (!Node.isVariableStatement(statement)) continue;
    for (const declaration of statement.getDeclarations()) {
      if (declaration.getName() !== name) continue;
      const initializer = declaration.getInitializer();
      if (initializer === undefined) return undefined;
      return objectFrom(initializer, source, depth + 1);
    }
  }
  return undefined;
}

function unwrap(expression: Node): Node {
  let current = expression;
  while (
    Node.isSatisfiesExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isParenthesizedExpression(current) ||
    Node.isTypeAssertion(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

function stringProperty(
  object: ObjectLiteralExpression,
  name: string,
): "absent" | "unreadable" | string {
  const property = object.getProperty(name);
  if (property === undefined) return "absent";
  if (!Node.isPropertyAssignment(property)) return "unreadable";
  const initializer = property.getInitializer();
  if (initializer === undefined) return "unreadable";
  const value = unwrap(initializer);
  if (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value)) {
    return value.getLiteralValue();
  }
  return "unreadable";
}

function isIgnored(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  if (filePath.split("/").includes("__tests__")) return true;
  return TEST_FILE.test(base) || DECLARATION_FILE.test(base);
}

function relativeTo(repoPath: string, root: string): string | undefined {
  if (repoPath === root) return "";
  const prefix = `${root}/`;
  if (!repoPath.startsWith(prefix)) return undefined;
  return repoPath.slice(prefix.length);
}

// `export const ALL` matches every method, and a default export decides the
// method at runtime. Neither names one method, so neither is a route.
function exportedMethods(source: SourceFile): string[] {
  const found = new Set<string>();
  for (const statement of source.getStatements()) {
    if (
      Node.isFunctionDeclaration(statement) &&
      statement.hasModifier(SyntaxKind.ExportKeyword) &&
      !statement.hasModifier(SyntaxKind.DefaultKeyword)
    ) {
      const name = statement.getName();
      if (name !== undefined && isHttpMethod(name)) found.add(name);
    }
    if (Node.isVariableStatement(statement) && statement.isExported()) {
      for (const declaration of statement.getDeclarations()) {
        const name = declaration.getName();
        if (isHttpMethod(name)) found.add(name);
      }
    }
    if (Node.isExportDeclaration(statement) && !statement.isTypeOnly()) {
      for (const specifier of statement.getNamedExports()) {
        if (specifier.isTypeOnly()) continue;
        const exported = specifier.getAliasNode()?.getText() ?? specifier.getName();
        if (isHttpMethod(exported)) found.add(exported);
      }
    }
  }
  return HTTP_METHODS.filter((method) => found.has(method));
}

function isHttpMethod(name: string): boolean {
  return HTTP_METHODS.some((method) => method === name);
}
