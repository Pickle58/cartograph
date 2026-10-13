export function tracingProject(): string {
  const name =
    process.env.LANGSMITH_PROJECT?.trim() || process.env.LANGCHAIN_PROJECT?.trim() || "";
  return name.length > 0 ? name : "default";
}

export function langsmithApiKey(): string {
  const key = process.env.LANGSMITH_API_KEY?.trim() || process.env.LANGCHAIN_API_KEY?.trim() || "";
  if (key.length === 0) {
    throw new Error("Missing LANGSMITH_API_KEY. Set it in .env.local.");
  }
  return key;
}

export function langsmithEndpoint(): string {
  const endpoint =
    process.env.LANGSMITH_ENDPOINT?.trim() || process.env.LANGCHAIN_ENDPOINT?.trim() || "";
  return endpoint.length > 0 ? endpoint.replace(/\/$/, "") : "https://api.smith.langchain.com";
}

export function langsmithHeaders(): { [key: string]: string } {
  const headers: { [key: string]: string } = {
    "content-type": "application/json",
    "x-api-key": langsmithApiKey(),
  };
  const workspace =
    process.env.LANGSMITH_WORKSPACE_ID?.trim() ||
    process.env.LANGCHAIN_WORKSPACE_ID?.trim() ||
    "";
  if (workspace.length > 0) headers["x-tenant-id"] = workspace;
  return headers;
}
