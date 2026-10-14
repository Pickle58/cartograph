import { tool } from "langchain";
import type { ManagedToolRuntime } from "managed-deepagents";
import { z } from "zod";

import { filesOfRole } from "./answers.ts";
import { loadCanvas } from "./canvas.ts";
import type { AskContext } from "./context.ts";
import { answerWithAnalysis } from "./read.ts";

const canvas = await loadCanvas();

export const filesByRole = tool(
  async ({ role }: { role: string }, runtime: ManagedToolRuntime<unknown, AskContext>) =>
    answerWithAnalysis(runtime, (snapshot) => filesOfRole(snapshot, role)),
  {
    name: "files_by_role",
    description: `List every file with one parser role. The role id must be one of: ${canvas.roleIds.join(", ")}.`,
    schema: z.object({
      role: z.enum(roleEnum(canvas.roleIds)).describe("Parser role id."),
    }),
  },
);

function roleEnum(ids: readonly string[]): [string, ...string[]] {
  const [first, ...rest] = ids;
  if (first === undefined) throw new Error("The parser has no role ids.");
  return [first, ...rest];
}
