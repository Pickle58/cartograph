"use server";

import { explainSelection } from "@/lib/explain";
import type { Explanation, ExplainTarget } from "@/lib/explanation";

export async function explainTarget(
  analysisId: string,
  target: ExplainTarget,
): Promise<Explanation> {
  return explainSelection(analysisId, target);
}
