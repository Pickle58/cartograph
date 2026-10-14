import { defineDeepAgent } from "managed-deepagents";

import { contextSchema } from "./tools/context.ts";
import { analysisSummary } from "./tools/summary.ts";
import { searchFiles } from "./tools/search-files.ts";
import { filesByRole } from "./tools/files-by-role.ts";
import { fileNeighbours } from "./tools/neighbours.ts";
import { walkFromFile } from "./tools/walk.ts";
import { routes } from "./tools/routes.ts";

export const agent = defineDeepAgent({
  name: "cartograph",
  model: process.env.MODEL ?? "anthropic:claude-sonnet-5",
  contextSchema,
  tools: [
    analysisSummary,
    searchFiles,
    filesByRole,
    fileNeighbours,
    walkFromFile,
    routes,
  ],
});
