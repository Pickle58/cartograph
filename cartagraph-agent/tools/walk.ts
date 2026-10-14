import { tool } from "langchain";
import type { ManagedToolRuntime } from "managed-deepagents";
import { z } from "zod";

import { dependencyWalk } from "./answers.ts";
import type { WalkDirection } from "./canvas.ts";
import type { AskContext } from "./context.ts";
import { answerWithAnalysis } from "./read.ts";

export const walkFromFile = tool(
  async (
    { path, direction }: { path: string; direction: WalkDirection },
    runtime: ManagedToolRuntime<unknown, AskContext>,
  ) => answerWithAnalysis(runtime, (snapshot) => dependencyWalk(snapshot, path, direction)),
  {
    name: "walk_graph",
    description:
      "Walk the import graph from one file. dependencies follows what that file imports, the dependency chain. dependents follows what imports it, the blast radius. The walk uses the same depth as the map. The path must already be a file in the analysis.",
    schema: z.object({
      path: z.string().min(1).describe("Exact file path to start from."),
      direction: z
        .enum(["dependencies", "dependents"])
        .describe("dependencies for the dependency chain, dependents for the blast radius."),
    }),
  },
);
