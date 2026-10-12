import type { FrameworkAdapter } from "../adapter.mts";
import { CONTROLLER, ENTITY, MODULE, SERVICE, type RoleId } from "../roles.mts";
import { manifestDependsOn } from "./manifest.mts";

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

// The folder name is the role, and real repositories use both the singular
// and the plural. Routes are the HTTP entry, which is the controller role.
// Models are the stored records, which is the entity role. Middleware has no
// role here: nothing in the rail is that layer, and a guess would be wrong.
const DIRECTORY_ROLES: ReadonlyMap<string, RoleId> = new Map([
  ["controller", CONTROLLER],
  ["controllers", CONTROLLER],
  ["route", CONTROLLER],
  ["routes", CONTROLLER],
  ["router", CONTROLLER],
  ["routers", CONTROLLER],
  ["service", SERVICE],
  ["services", SERVICE],
  ["model", ENTITY],
  ["models", ENTITY],
  ["entity", ENTITY],
  ["entities", ENTITY],
  ["module", MODULE],
  ["modules", MODULE],
]);

export const expressAdapter: FrameworkAdapter = {
  id: "express",
  exclusions() {
    return [];
  },
  matches(root) {
    return manifestDependsOn(root, "express");
  },
  assign(_root, files) {
    const roles: { path: string; role: RoleId }[] = [];
    for (const file of files) {
      const role = roleFromPath(file.path);
      if (role !== undefined) roles.push({ path: file.path, role });
    }
    // Route tables are assembled at runtime. Exact or absent, so none.
    return { roles, routes: [] };
  },
};

function roleFromPath(filePath: string): RoleId | undefined {
  if (isIgnored(filePath)) return undefined;
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

function isIgnored(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  if (filePath.split("/").includes("__tests__")) return true;
  return TEST_FILE.test(base) || DECLARATION_FILE.test(base);
}
