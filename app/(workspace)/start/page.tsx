import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { beginAnalysis } from "@/lib/actions";

export const maxDuration = 300;

// This page exists to start an analysis and leave. Nothing here is a shell.
export const instant = false;

// Reached after sign-in with the repository URL still on the query string.
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string | string[] }>;
}) {
  await auth.protect();
  const params = await searchParams;
  const raw = params.url;
  const url = Array.isArray(raw) ? raw[0] : raw;
  if (url === undefined || url.trim() === "") redirect("/");

  const result = await beginAnalysis(url);
  if (result === null) redirect("/");

  return <p className="px-3 py-3 text-[12px] text-fg">{result.error}</p>;
}
