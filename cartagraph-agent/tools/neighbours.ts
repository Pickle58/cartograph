import { tool } from "langchain";
import type { ManagedToolRuntime } from "managed-deepagents";
import { z } from "zod";

import { neighbouringFiles } from "./answers.ts";
import type { AskContext } from "./context.ts";
import { answerWithAnalysis } from "./read.ts";

export const fileNeighbours = tool(
  async ({ path }: { path: string }, runtime: ManagedToolRuntime<unknown, AskContext>) =>
    answerWithAnalysis(runtime, (snapshot) => neighbouringFiles(snapshot, path)),
  {
    name: "file_neighbours",
    description:
      "Direct imports of one file and the files that import it. The path must be a file the analysis already lists. This is not a transitive walk.",
    schema: z.object({
      path: z.string().min(1).describe("Exact file path."),
    }),
  },
);
