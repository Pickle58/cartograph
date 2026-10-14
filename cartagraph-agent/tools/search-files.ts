import { tool } from "langchain";
import type { ManagedToolRuntime } from "managed-deepagents";
import { z } from "zod";

import { searchPaths } from "./answers.ts";
import type { AskContext } from "./context.ts";
import { answerWithAnalysis } from "./read.ts";

export const searchFiles = tool(
  async ({ query }: { query: string }, runtime: ManagedToolRuntime<unknown, AskContext>) =>
    answerWithAnalysis(runtime, (snapshot) => searchPaths(snapshot, query)),
  {
    name: "search_files",
    description:
      "Find files whose path contains a case-sensitive substring. Use this to find a file before asking for its neighbours or walking from it. Returns no file when nothing matches.",
    schema: z.object({
      query: z.string().min(1).describe("Case-sensitive substring of a file path."),
    }),
  },
);
