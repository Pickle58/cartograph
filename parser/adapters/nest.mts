import fs from "node:fs";
import path from "node:path";
import { Node, SyntaxKind, type Decorator, type SourceFile } from "ts-morph";

import type { AdapterFile, AdapterRoute, FrameworkAdapter } from "../adapter.mts";
import { CONTROLLER, ENTITY, MODULE, SERVICE, type RoleId } from "../roles.mts";
import { manifestDependsOn } from "./manifest.mts";

const NEST_MODULE = "@nestjs/common";

// @All is every verb, so it is not a method. It is omitted with the rest of
// the routes we cannot name.
const HTTP_METHODS: Readonly<Record<string, string>> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Head: "HEAD",
  Options: "OPTIONS",
};

const SOURCE_EXT = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

export const nestAdapter: FrameworkAdapter = {
  id: "nestjs",
  exclusions() {
    return [];
  },
  matches(root) {
    return (
      fs.existsSync(path.join(root, "nest-cli.json")) ||
      manifestDependsOn(root, "@nestjs/core") ||
      manifestDependsOn(root, "@nestjs/common")
    );
  },
  assign(_root, files) {
    const roles: { path: string; role: RoleId }[] = [];
    for (const file of files) {
      const role = roleFromName(file.path);
      if (role !== undefined) roles.push({ path: file.path, role });
    }
    return { roles, routes: routesFrom(files) };
  },
};

function roleFromName(filePath: string): RoleId | undefined {
  if (isIgnored(filePath)) return undefined;
  const base = filePath.split("/").pop() ?? filePath;
  const stem = base.replace(SOURCE_EXT, "");
  if (stem.endsWith(".controller")) return CONTROLLER;
  if (stem.endsWith(".service")) return SERVICE;
  if (stem.endsWith(".module")) return MODULE;
  if (stem.endsWith(".entity")) return ENTITY;
  return undefined;
}

function routesFrom(files: readonly AdapterFile[]): AdapterRoute[] {
  const prefix = globalPrefix(files);
  // A prefix we cannot read would make every pattern wrong, so none are shown.
  if (prefix === null) return [];
  const rootPrefix = prefix ?? "";
  const routes: AdapterRoute[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (isIgnored(file.path)) continue;
    for (const route of controllerRoutes(file, rootPrefix)) {
      const key = `${route.file}\0${route.method}\0${route.pattern}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push(route);
    }
  }
  return routes;
}

function controllerRoutes(file: AdapterFile, prefix: string): AdapterRoute[] {
  const routes: AdapterRoute[] = [];
  for (const declaration of file.source.getClasses()) {
    const controller = nestDecorator(file.source, declaration.getDecorators(), "Controller");
    if (controller === undefined) continue;
    const prefixes = literalPaths(controller);
    if (prefixes === undefined) continue;
    for (const method of declaration.getMethods()) {
      if (method.isStatic() || method.isAbstract()) continue;
      if (nestDecorator(file.source, method.getDecorators(), "Version") !== undefined) {
        continue;
      }
      for (const decorator of method.getDecorators()) {
        const imported = importedDecoratorName(file.source, decorator);
        if (imported === undefined) continue;
        const http = HTTP_METHODS[imported];
        if (http === undefined) continue;
        const paths = literalPaths(decorator);
        if (paths === undefined) continue;
        for (const controllerPath of prefixes) {
          for (const methodPath of paths) {
            routes.push({
              file: file.path,
              method: http,
              pattern: joinRoute([prefix, controllerPath, methodPath]),
            });
          }
        }
      }
    }
  }
  return routes;
}

// undefined: no call. null: a call whose argument is not a literal, or a
// second argument that could exclude paths. Either one hides every route.
function globalPrefix(files: readonly AdapterFile[]): string | null | undefined {
  const found: string[] = [];
  for (const file of files) {
    if (isIgnored(file.path)) continue;
    for (const call of file.source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      if (!Node.isPropertyAccessExpression(expression)) continue;
      if (expression.getName() !== "setGlobalPrefix") continue;
      const args = call.getArguments();
      const first = args[0];
      if (first === undefined || !Node.isStringLiteral(first)) return null;
      if (args.length > 1 && !isEmptyObject(args[1])) return null;
      found.push(first.getLiteralValue());
    }
  }
  if (found.length === 0) return undefined;
  if (found.length > 1) return null;
  const only = found[0];
  if (only === undefined) return undefined;
  return only;
}

function isEmptyObject(node: Node): boolean {
  return Node.isObjectLiteralExpression(node) && node.getProperties().length === 0;
}

function nestDecorator(
  source: SourceFile,
  decorators: readonly Decorator[],
  imported: string,
): Decorator | undefined {
  return decorators.find((decorator) => importedDecoratorName(source, decorator) === imported);
}

function importedDecoratorName(source: SourceFile, decorator: Decorator): string | undefined {
  const expression = decorator.getExpression();
  const callee = Node.isCallExpression(expression) ? expression.getExpression() : expression;
  if (Node.isIdentifier(callee)) {
    return namedImport(source, callee.getText());
  }
  if (!Node.isPropertyAccessExpression(callee)) return undefined;
  const object = callee.getExpression();
  if (!Node.isIdentifier(object)) return undefined;
  const specifier = namespaceImport(source, object.getText());
  if (!isNestModule(specifier)) return undefined;
  return callee.getName();
}

function namedImport(source: SourceFile, local: string): string | undefined {
  for (const declaration of source.getImportDeclarations()) {
    if (!isNestModule(declaration.getModuleSpecifierValue())) continue;
    for (const named of declaration.getNamedImports()) {
      const alias = named.getAliasNode()?.getText();
      if ((alias ?? named.getName()) === local) return named.getName();
    }
  }
  return undefined;
}

function namespaceImport(source: SourceFile, local: string): string | undefined {
  for (const declaration of source.getImportDeclarations()) {
    if (declaration.getNamespaceImport()?.getText() === local) {
      return declaration.getModuleSpecifierValue();
    }
  }
  return undefined;
}

function isNestModule(specifier: string | undefined): boolean {
  return specifier === NEST_MODULE || (specifier?.startsWith(`${NEST_MODULE}/`) ?? false);
}

// undefined when the path is not a literal. No argument is the empty path,
// which the decorator states by being there.
function literalPaths(decorator: Decorator): string[] | undefined {
  const expression = decorator.getExpression();
  if (Node.isIdentifier(expression)) return [""];
  if (!Node.isCallExpression(expression)) return undefined;
  const args = expression.getArguments();
  if (args.length === 0) return [""];
  const first = args[0];
  if (first === undefined) return [""];
  return literalStrings(first);
}

function literalStrings(node: Node): string[] | undefined {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return [node.getLiteralValue()];
  }
  if (!Node.isArrayLiteralExpression(node)) return undefined;
  const values: string[] = [];
  for (const element of node.getElements()) {
    if (Node.isSpreadElement(element)) return undefined;
    if (!Node.isStringLiteral(element) && !Node.isNoSubstitutionTemplateLiteral(element)) {
      return undefined;
    }
    values.push(element.getLiteralValue());
  }
  if (values.length === 0) return undefined;
  return values;
}

function joinRoute(parts: readonly string[]): string {
  const segments: string[] = [];
  for (const part of parts) {
    for (const segment of part.split("/")) {
      if (segment.length > 0) segments.push(segment);
    }
  }
  if (segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

function isIgnored(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  if (filePath.split("/").includes("__tests__")) return true;
  return TEST_FILE.test(base) || DECLARATION_FILE.test(base);
}
