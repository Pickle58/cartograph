// Role ids and their labels. No framework name in here: the browser reads this
// file for the rail, and it must not pull a parser or a filesystem with it.
export const PAGE_ROUTE = "page-route";
export const API_ENDPOINT = "api-endpoint";
export const SERVER_ACTION = "server-action";
export const CONTROLLER = "controller";
export const SERVICE = "service";
export const MODULE = "module";
export const ENTITY = "entity";
export const JSX = "jsx";
export const HOOK = "hook";
export const TYPES = "types";
export const TEST = "test";
export const UNIDENTIFIED = "unidentified";

export const ROLE_IDS = [
  PAGE_ROUTE,
  API_ENDPOINT,
  SERVER_ACTION,
  CONTROLLER,
  SERVICE,
  MODULE,
  ENTITY,
  JSX,
  HOOK,
  TYPES,
  TEST,
  UNIDENTIFIED,
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export const ROLE_LABELS: Record<RoleId, string> = {
  [PAGE_ROUTE]: "Page routes",
  [API_ENDPOINT]: "API endpoints",
  [SERVER_ACTION]: "Server actions",
  [CONTROLLER]: "Controllers",
  [SERVICE]: "Services",
  [MODULE]: "Modules",
  [ENTITY]: "Entities",
  [JSX]: "JSX",
  [HOOK]: "Hook",
  [TYPES]: "Types",
  [TEST]: "Test",
  [UNIDENTIFIED]: "Unidentified",
};

// Routable surfaces, then the layers behind them, then plumbing. Generic
// leftovers stay in this order on every rail so a file that no adapter claimed
// still has a place.
export const GENERIC_RAIL: readonly RoleId[] = [JSX, HOOK, TYPES, TEST, UNIDENTIFIED];

export const APP_RAIL: readonly RoleId[] = [
  PAGE_ROUTE,
  API_ENDPOINT,
  SERVER_ACTION,
  ...GENERIC_RAIL,
];

export const SERVICE_RAIL: readonly RoleId[] = [
  CONTROLLER,
  SERVICE,
  MODULE,
  ENTITY,
  ...GENERIC_RAIL,
];

const ROLE_ID_SET: ReadonlySet<string> = new Set(ROLE_IDS);

export function isRoleId(value: string): value is RoleId {
  return ROLE_ID_SET.has(value);
}
