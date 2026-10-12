import { noFramework, type FrameworkAdapter } from "./adapter.mts";
import { astroAdapter } from "./adapters/astro.mts";
import { expressAdapter } from "./adapters/express.mts";
import { nestAdapter } from "./adapters/nest.mts";
import { nextAdapter } from "./adapters/next.mts";
import { reactAdapter } from "./adapters/react.mts";

// Fixed order, first match wins. Nest and Next can depend on Express, so
// Express comes after them. Astro comes before Express and React, so a site
// that also depends on React is Astro. React is last for the same reason.
const ADAPTERS: readonly FrameworkAdapter[] = [
  nestAdapter,
  nextAdapter,
  astroAdapter,
  expressAdapter,
  reactAdapter,
];

export function selectAdapter(root: string): FrameworkAdapter {
  for (const adapter of ADAPTERS) {
    if (adapter.matches(root)) return adapter;
  }
  return noFramework;
}
