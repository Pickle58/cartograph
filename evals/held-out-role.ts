import { categoryOf } from "../lib/categories.ts";
import { isModelRole, type ModelRoleId } from "../parser/roles.mts";

// Convention already named this file, so production never asks the model.
// That is only a ground truth when the name is one the classifier is allowed
// to return. A page or a controller is certain and still the wrong question:
// scoring a forbidden answer measures nothing. Unidentified files are the
// ones production does send, so they are not held out.
export function heldOutRole(
  filePath: string,
  adapterRole: string | undefined,
): ModelRoleId | undefined {
  if (adapterRole !== undefined) {
    return isModelRole(adapterRole) ? adapterRole : undefined;
  }
  const conventional = categoryOf(filePath);
  return isModelRole(conventional) ? conventional : undefined;
}
