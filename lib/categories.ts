import {
  API_ENDPOINT,
  APP_RAIL,
  ASTRO_RAIL,
  COMPONENT,
  CONTROLLER,
  ENTITY,
  GENERIC_RAIL,
  HOOK,
  JSX,
  LAYOUT,
  MODULE,
  PAGE_ROUTE,
  ROLE_LABELS,
  MODEL_ROLE_IDS,
  SERVER_ACTION,
  SERVICE,
  SERVICE_RAIL,
  TEST,
  TYPES,
  UNIDENTIFIED,
  isModelRole,
  isRoleId,
  type RoleId,
} from "../parser/roles.mts";

export type FileCategory = RoleId;

export type CategoryCount = {
  id: FileCategory;
  label: string;
  count: number;
};

type KnownFramework = "nextjs" | "nestjs" | "astro" | "express" | "react" | "none";

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const HOOK_FILE = /^use[A-Z].*\.[cm]?[jt]sx?$/;
const JSX_FILE = /\.(?:tsx|jsx)$/;

// Kind comes from the path when no adapter claimed the file. These patterns
// are the convention; a file they don't match stays unidentified.
export function categoryOf(filePath: string): FileCategory {
  const segments = filePath.split("/");
  const base = segments[segments.length - 1] ?? filePath;
  if (segments.includes("__tests__") || TEST_FILE.test(base)) return TEST;
  if (DECLARATION_FILE.test(base)) return TYPES;
  if (HOOK_FILE.test(base)) return HOOK;
  if (JSX_FILE.test(base)) return JSX;
  return UNIDENTIFIED;
}

export function categoryLabel(category: FileCategory): string {
  return ROLE_LABELS[category];
}

export function frameworkLabel(framework: string): string {
  const known = asFramework(framework);
  if (known === undefined) return framework;
  switch (known) {
    case "nextjs":
      return "Next.js";
    case "nestjs":
      return "NestJS";
    case "astro":
      return "Astro";
    case "express":
      return "Express";
    case "react":
      return "React";
    case "none":
      return "none";
    default: {
      const unhandled: never = known;
      throw new Error(`Unhandled framework: ${String(unhandled)}`);
    }
  }
}

export function isFrameworkEntry(category: FileCategory): boolean {
  switch (category) {
    case "page-route":
    case "api-endpoint":
    case "server-action":
    case "controller":
      return true;
    case "layout":
    case "component":
    case "service":
    case "module":
    case "entity":
    case "jsx":
    case "hook":
    case "types":
    case "test":
    case "repository":
    case "model":
    case "util":
    case "config":
    case "unidentified":
      return false;
    default: {
      const unhandled: never = category;
      throw new Error(`Unhandled file category: ${String(unhandled)}`);
    }
  }
}

export function categoryCounts(
  files: readonly { role: FileCategory }[],
  framework: string,
): CategoryCount[] {
  const known = asFramework(framework);
  const rail = known === undefined ? GENERIC_RAIL : railFor(known);
  const pinned = known === undefined ? new Set<FileCategory>() : pinnedRoles(known);
  const counts = new Map<FileCategory, number>();
  for (const id of rail) counts.set(id, 0);
  for (const file of files) {
    // A model label still counts when this framework's rail doesn't list it.
    // Folding it into unidentified would hide the role the model just assigned.
    const id = rail.includes(file.role) || isModelRole(file.role) ? file.role : UNIDENTIFIED;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const listed: CategoryCount[] = [];
  for (const id of rail) {
    const count = counts.get(id) ?? 0;
    if (count === 0 && !pinned.has(id)) continue;
    listed.push({ id, label: ROLE_LABELS[id], count });
  }
  const extras: CategoryCount[] = [];
  for (const id of MODEL_ROLE_IDS) {
    if (rail.includes(id)) continue;
    const count = counts.get(id) ?? 0;
    if (count === 0) continue;
    extras.push({ id, label: ROLE_LABELS[id], count });
  }
  if (extras.length === 0) return listed;
  const unidentified = listed.findIndex((item) => item.id === UNIDENTIFIED);
  if (unidentified === -1) listed.push(...extras);
  else listed.splice(unidentified, 0, ...extras);
  return listed;
}

// Convention and adapters already named this file. Classification is only for
// what's left, so a hook or a page is never sent to the model.
export function needsModelRole(
  filePath: string,
  assigned: ReadonlyMap<string, string> | ReadonlySet<string>,
): boolean {
  if (assigned.has(filePath)) return false;
  return categoryOf(filePath) === UNIDENTIFIED;
}

export function resolveRole(
  filePath: string,
  assigned: ReadonlyMap<string, string>,
): FileCategory {
  const role = assigned.get(filePath);
  if (role === undefined) return categoryOf(filePath);
  if (!isRoleId(role)) {
    throw new Error(`Unknown role ${role} on ${filePath}`);
  }
  return role;
}

function railFor(framework: KnownFramework): readonly FileCategory[] {
  switch (framework) {
    case "nextjs":
      return APP_RAIL;
    case "astro":
      return ASTRO_RAIL;
    case "nestjs":
    case "express":
      return SERVICE_RAIL;
    case "react":
    case "none":
      return GENERIC_RAIL;
    default: {
      const unhandled: never = framework;
      throw new Error(`Unhandled framework: ${String(unhandled)}`);
    }
  }
}

function pinnedRoles(framework: KnownFramework): ReadonlySet<FileCategory> {
  switch (framework) {
    case "nextjs":
      return new Set([PAGE_ROUTE, API_ENDPOINT, SERVER_ACTION]);
    case "astro":
      return new Set([PAGE_ROUTE, API_ENDPOINT, LAYOUT, COMPONENT]);
    case "nestjs":
    case "express":
      return new Set([CONTROLLER, SERVICE, MODULE, ENTITY]);
    case "react":
    case "none":
      return new Set();
    default: {
      const unhandled: never = framework;
      throw new Error(`Unhandled framework: ${String(unhandled)}`);
    }
  }
}

function asFramework(framework: string): KnownFramework | undefined {
  switch (framework) {
    case "nextjs":
    case "nestjs":
    case "astro":
    case "express":
    case "react":
    case "none":
      return framework;
    default:
      return undefined;
  }
}
