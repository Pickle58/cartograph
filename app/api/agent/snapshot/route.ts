import { readAnalysisSnapshot, type AnalysisSnapshotResult } from "@/lib/analyses";

const NO_STORE = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
};

// The agent has no Clerk session. The bearer token is the analysis credential,
// checked here and again by row-level security. The analysis id is not a
// parameter and is not in the body.
export async function GET(request: Request) {
  const credential = bearerCredential(request);
  if (credential === null) return unauthorized();

  try {
    const result = await readAnalysisSnapshot(credential);
    return snapshotResponse(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    console.error("Analysis snapshot failed.", detail);
    return Response.json({ error: "Unavailable" }, { status: 500, headers: NO_STORE });
  }
}

function snapshotResponse(result: AnalysisSnapshotResult): Response {
  switch (result.status) {
    case "ok":
      return Response.json(result.graph, { headers: NO_STORE });
    case "rejected":
      return unauthorized();
    case "absent":
      return Response.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
}

function bearerCredential(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null || header.length > 4096) return null;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  if (match === null) return null;
  return match[1] ?? null;
}
