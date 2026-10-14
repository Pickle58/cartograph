import { z } from "zod";

// Opaque credential for the one analysis this run may read. The model does
// not see an analysis id; callers put the credential on the run context.
export const contextSchema = z.object({
  credential: z.string().min(1).optional(),
});

export type AskContext = z.infer<typeof contextSchema>;
