import { noFramework, type FrameworkAdapter } from "./adapter.mts";
import { nestAdapter } from "./adapters/nest.mts";
import { nextAdapter } from "./adapters/next.mts";
import { reactAdapter } from "./adapters/react.mts";

// Fixed order, first match wins. React is last because an app framework that
// also depends on it would otherwise lose.
const ADAPTERS: readonly FrameworkAdapter[] = [nestAdapter, nextAdapter, reactAdapter];

export function selectAdapter(root: string): FrameworkAdapter {
  for (const adapter of ADAPTERS) {
    if (adapter.matches(root)) return adapter;
  }
  return noFramework;
}
