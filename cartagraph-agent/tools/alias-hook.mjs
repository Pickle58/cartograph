import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

// The canvas modules live in the cartograph repo and import `@/`. Node does
// not resolve that alias. The dev server compiles those imports to require(),
// which the ESM register hook never sees, so the same mapping is installed on
// Module._resolveFilename as well.
let installed = false;

export function installAlias() {
  if (installed) return;
  installed = true;
  const { Module } = require("module");
  const previous = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (typeof request === "string" && request.startsWith("@/")) {
      request = resolveAlias(request);
    }
    return previous.call(this, request, parent, isMain, options);
  };
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const found = resolveAlias(specifier);
    return nextResolve(pathToFileURL(found).href, context);
  }
  return nextResolve(specifier, context);
}

function resolveAlias(specifier) {
  const relative = specifier.slice(2);
  const base = path.join(repoRoot(), relative);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve ${specifier}`);
}

function repoRoot() {
  return findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
}

function findRepoRoot(start) {
  let directory = start;
  for (;;) {
    if (
      existsSync(path.join(directory, "lib", "detail.ts")) &&
      existsSync(path.join(directory, "parser", "roles.mts"))
    ) {
      return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Could not find the cartograph graph modules next to this agent.");
    }
    directory = parent;
  }
}
