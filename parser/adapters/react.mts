import type { FrameworkAdapter } from "../adapter.mts";
import { manifestDependsOn } from "./manifest.mts";

// No roles of its own. Anything that is not a page, an endpoint, or a server
// action already falls through to the generic rail, and a React app has no
// route whose method and pattern are both written down.
export const reactAdapter: FrameworkAdapter = {
  id: "react",
  exclusions() {
    return [];
  },
  matches(root) {
    return manifestDependsOn(root, "react");
  },
  assign() {
    return { roles: [], routes: [] };
  },
};
