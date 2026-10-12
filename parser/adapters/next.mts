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
import { API_ENDPOINT, PAGE_ROUTE, SERVER_ACTION, type RoleId } from "../roles.mts";
import { manifestDependsOn } from "./manifest.mts";

const CONFIG_FILES = [
  "next.config.ts",
  "next.config.mts",
  "next.config.js",
  "next.config.mjs",
] as const;

const PAGE_FILES = new Set(["page.tsx", "page.ts", "page.jsx", "page.js", "page.mts", "page.mjs"]);
const ROUTE_FILES = new Set([
  "route.tsx",
  "route.ts",
  "route.jsx",
  "route.js",
  "route.mts",
  "route.mjs",
]);

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

const APP_ROOTS = ["app", "src/app"] as const;
const PAGES_ROOTS = ["pages", "src/pages"] as const;

type RouteOptions = {
  basePath: string;
  trailingSlash: boolean;
};

type Located = {
  app: readonly string[];
  pages: readonly string[];
};

type Classified = {
  role: RoleId;
  pattern: string;
  kind: "page" | "api";
  router: "app" | "pages";
};

export const nextAdapter: FrameworkAdapter = {
  id: "nextjs",
  exclusions() {
    return [];
  },
  matches(root) {
    return manifestDependsOn(root, "next") || configPresent(root).length > 0;
  },
  assign(root, files) {
    const located = locate(root);
    const roles: { path: string; role: RoleId }[] = [];
    const classified: { file: AdapterFile; found: Classified }[] = [];
    for (const file of files) {
      const found = classify(file.path, located);
      if (found !== undefined) {
        roles.push({ path: file.path, role: found.role });
        classified.push({ file, found });
        continue;
      }
      if (!isFixture(file.path) && fileHasUseServer(file.source)) {
        roles.push({ path: file.path, role: SERVER_ACTION });
      }
    }
    const options = routeOptions(root, files);
    return {
      roles,
      routes: options === null ? [] : emitRoutes(classified, options),
    };
  },
};

function locate(root: string): Located {
  return {
    app: existingDirectories(root, APP_ROOTS),
    pages: existingDirectories(root, PAGES_ROOTS),
  };
}

function existingDirectories(root: string, candidates: readonly string[]): string[] {
  return candidates.filter((candidate) => {
    try {
      return fs.statSync(path.join(root, ...candidate.split("/"))).isDirectory();
    } catch {
      return false;
    }
  });
}

// Two copies of the same root (app and src/app) are not both active. Using
// either one would publish routes the other copy does not serve.
function classify(repoPath: string, located: Located): Classified | undefined {
  if (isFixture(repoPath)) return undefined;
  if (located.app.length === 1) {
    const appRoot = located.app[0];
    if (appRoot !== undefined) {
      const relative = relativeTo(repoPath, appRoot);
      if (relative !== undefined) {
        const found = classifyApp(relative);
        if (found !== undefined) return found;
      }
    }
  }
  if (located.pages.length === 1) {
    const pagesRoot = located.pages[0];
    if (pagesRoot !== undefined) {
      const relative = relativeTo(repoPath, pagesRoot);
      if (relative !== undefined) return classifyPages(relative);
    }
  }
  return undefined;
}

function classifyApp(relativeFile: string): Classified | undefined {
  const base = relativeFile.split("/").pop() ?? relativeFile;
  const kind = PAGE_FILES.has(base) ? "page" : ROUTE_FILES.has(base) ? "api" : undefined;
  if (kind === undefined) return undefined;
  const pattern = appPattern(parentDir(relativeFile));
  if (pattern === undefined) return undefined;
  return { role: kind === "page" ? PAGE_ROUTE : API_ENDPOINT, pattern, kind, router: "app" };
}

function classifyPages(relativeFile: string): Classified | undefined {
  if (isPagesApi(relativeFile)) {
    const pattern = pagesPattern(relativeFile);
    if (pattern === undefined) return undefined;
    return { role: API_ENDPOINT, pattern, kind: "api", router: "pages" };
  }
  const pattern = pagesPattern(relativeFile);
  if (pattern === undefined) return undefined;
  return { role: PAGE_ROUTE, pattern, kind: "page", router: "pages" };
}

function emitRoutes(
  classified: readonly { file: AdapterFile; found: Classified }[],
  options: RouteOptions,
): AdapterRoute[] {
  // appPattern already drops route groups, so this key is the URL. Two app
  // files on one URL cannot both be served, and neither pattern is emitted.
  const appFilesByPattern = new Map<string, Set<string>>();
  for (const entry of classified) {
    if (entry.found.router !== "app") continue;
    const files = appFilesByPattern.get(entry.found.pattern) ?? new Set<string>();
    files.add(entry.file.path);
    appFilesByPattern.set(entry.found.pattern, files);
  }
  const conflicting = new Set<string>();
  for (const [pattern, files] of appFilesByPattern) {
    if (files.size > 1) conflicting.add(pattern);
  }

  const routes: AdapterRoute[] = [];
  const seen = new Set<string>();
  for (const entry of classified) {
    if (entry.found.router === "app" && conflicting.has(entry.found.pattern)) continue;
    const pattern = applyOptions(entry.found.pattern, options);
    if (pattern === undefined) continue;
    // A page file exports no method. The framework serves it as GET only.
    const methods =
      entry.found.kind === "page" ? ["GET"] : exportedMethods(entry.file.source);
    for (const method of methods) {
      const route = { file: entry.file.path, method, pattern };
      const key = `${route.file}\0${route.method}\0${route.pattern}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push(route);
    }
  }
  return routes;
}

// A slot, a private folder, or an intercepting folder does not name the URL.
// The intercept's URL is the route it covers, which is a different file.
function appPattern(dir: string): string | undefined {
  if (dir === "") return "/";
  const url: string[] = [];
  for (const segment of dir.split("/")) {
    if (segment.startsWith("_") || segment.startsWith("@")) return undefined;
    if (isIntercepting(segment)) return undefined;
    if (isRouteGroup(segment)) continue;
    url.push(segment);
  }
  return url.length === 0 ? "/" : `/${url.join("/")}`;
}

function pagesPattern(relativeFile: string): string | undefined {
  const withoutExt = relativeFile.replace(/\.[cm]?[jt]sx?$/, "");
  if (withoutExt === relativeFile) return undefined;
  const segments = withoutExt.split("/");
  if (segments.some((segment) => segment.startsWith("_"))) return undefined;
  if (segments[segments.length - 1] === "index") segments.pop();
  if (segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

function isPagesApi(relativeFile: string): boolean {
  return relativeFile.startsWith("api/");
}

function isRouteGroup(segment: string): boolean {
  return segment.startsWith("(") && segment.endsWith(")") && !isIntercepting(segment);
}

function isIntercepting(segment: string): boolean {
  return segment.startsWith("(.)") || segment.startsWith("(..)") || segment.startsWith("(...)");
}

function parentDir(relativeFile: string): string {
  const slash = relativeFile.lastIndexOf("/");
  return slash === -1 ? "" : relativeFile.slice(0, slash);
}

function isFixture(repoPath: string): boolean {
  const base = repoPath.split("/").pop() ?? repoPath;
  if (repoPath.split("/").includes("__tests__")) return true;
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(base) || /\.d\.[cm]?ts$/.test(base);
}

function relativeTo(repoPath: string, root: string): string | undefined {
  if (repoPath === root) return "";
  const prefix = `${root}/`;
  if (!repoPath.startsWith(prefix)) return undefined;
  return repoPath.slice(prefix.length);
}

function applyOptions(pattern: string, options: RouteOptions): string | undefined {
  let result = pattern;
  if (options.basePath !== "") {
    result = pattern === "/" ? options.basePath : `${options.basePath}${pattern}`;
  }
  if (options.trailingSlash && result !== "/" && !result.endsWith("/")) {
    result = `${result}/`;
  }
  if (!result.startsWith("/")) return undefined;
  return result;
}

// No config means the defaults: no prefix, no trailing slash. More than one
// config, or a config whose prefix is not a literal, means we do not know the
// pattern, so no route is emitted.
function routeOptions(root: string, files: readonly AdapterFile[]): RouteOptions | null {
  const present = configPresent(root);
  if (present.length > 1) return null;
  if (present.length === 0) return { basePath: "", trailingSlash: false };
  const name = present[0];
  if (name === undefined) return null;
  const parsed = files.find((file) => file.path === name);
  if (parsed === undefined) return null;
  const object = configObject(parsed.source);
  if (object === undefined) return null;
  if (object.getProperty("i18n") !== undefined) return null;
  const basePath = stringProperty(object, "basePath");
  if (basePath === "unreadable") return null;
  if (basePath !== "absent" && !isBasePath(basePath)) return null;
  const trailingSlash = booleanProperty(object, "trailingSlash");
  if (trailingSlash === "unreadable") return null;
  return {
    basePath: basePath === "absent" ? "" : basePath,
    trailingSlash: trailingSlash === "absent" ? false : trailingSlash,
  };
}

function configPresent(root: string): string[] {
  return CONFIG_FILES.filter((name) =>
    fs.existsSync(
      /*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, name),
    ),
  );
}

function isBasePath(value: string): boolean {
  return value.startsWith("/") && value.length > 1 && !value.endsWith("/");
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
  if (depth > 3) return undefined;
  const value = unwrap(expression);
  if (Node.isObjectLiteralExpression(value)) {
    if (value.getProperties().some((property) => Node.isSpreadAssignment(property))) {
      return undefined;
    }
    return value;
  }
  if (Node.isIdentifier(value)) return objectFromName(value.getText(), source, depth + 1);
  return undefined;
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

function booleanProperty(
  object: ObjectLiteralExpression,
  name: string,
): "absent" | "unreadable" | boolean {
  const property = object.getProperty(name);
  if (property === undefined) return "absent";
  if (!Node.isPropertyAssignment(property)) return "unreadable";
  const initializer = property.getInitializer();
  if (initializer === undefined) return "unreadable";
  const value = unwrap(initializer);
  if (value.getKind() === SyntaxKind.TrueKeyword) return true;
  if (value.getKind() === SyntaxKind.FalseKeyword) return false;
  return "unreadable";
}

// `export default function handler` decides the method at runtime. Nothing is
// emitted for it. Only a value export whose name is the method counts.
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

function fileHasUseServer(source: SourceFile): boolean {
  if (hasDirective(source.getStatements())) return true;
  for (const node of source.getDescendants()) {
    if (
      !Node.isFunctionDeclaration(node) &&
      !Node.isFunctionExpression(node) &&
      !Node.isArrowFunction(node) &&
      !Node.isMethodDeclaration(node) &&
      !Node.isConstructorDeclaration(node) &&
      !Node.isGetAccessorDeclaration(node) &&
      !Node.isSetAccessorDeclaration(node)
    ) {
      continue;
    }
    const body = node.getBody();
    if (body !== undefined && Node.isBlock(body) && hasDirective(body.getStatements())) {
      return true;
    }
  }
  return false;
}

function hasDirective(statements: readonly Statement[]): boolean {
  for (const statement of statements) {
    if (!Node.isExpressionStatement(statement)) return false;
    const expression = statement.getExpression();
    if (!Node.isStringLiteral(expression)) return false;
    if (expression.getLiteralValue() === "use server") return true;
  }
  return false;
}
