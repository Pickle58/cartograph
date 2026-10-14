import { tool } from "langchain";
import type { ManagedToolRuntime } from "managed-deepagents";
import { z } from "zod";

import { routeTableText } from "./answers.ts";
import type { AskContext } from "./context.ts";
import { answerWithAnalysis } from "./read.ts";

export const routes = tool(
  async (_input: Record<string, never>, runtime: ManagedToolRuntime<unknown, AskContext>) =>
    answerWithAnalysis(runtime, routeTableText),
  {
    name: "route_table",
    description:
      "The route table the parser recovered: HTTP method, path pattern, and file. A route that was not recovered is absent. Do not infer one from a file name.",
    schema: z.object({}),
  },
);
