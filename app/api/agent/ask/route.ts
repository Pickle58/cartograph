import { askRepository } from "@/lib/ask";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  return askRepository(request);
}
