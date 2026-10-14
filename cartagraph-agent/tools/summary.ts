import { tool } from "langchain";
import type { ManagedToolRuntime } from "managed-deepagents";
import { z } from "zod";

import { summarizeAnalysis } from "./answers.ts";
import type { AskContext } from "./context.ts";
import { answerWithAnalysis } from "./read.ts";

export const analysisSummary = tool(
  async (_input: Record<string, never>, runtime: ManagedToolRuntime<unknown, AskContext>) =>
    answerWithAnalysis(runtime, summarizeAnalysis),
  {
    name: "analysis_summary",
    description:
      "Summarize the whole analysis: repository, framework, file and import counts, coverage, how many routes were recovered, the most-imported files, files nothing imports, and insights. Does not list the route table.",
    schema: z.object({}),
  },
);
