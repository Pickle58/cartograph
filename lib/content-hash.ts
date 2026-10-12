import "server-only";
import { createHash } from "node:crypto";

export function sha256(parts: readonly (string | Buffer)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}
