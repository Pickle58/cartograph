import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Supabase never sees its own sessions here: Clerk owns sign-in, and its
// session token is sent on every request so row-level security policies can
// read the organization claim. Without `accessToken` the client would run as
// `anon` and every policy would quietly return nothing.
//
// Built per request because the token belongs to the request's user.
export async function createSupabaseClient(): Promise<SupabaseClient> {
  const { getToken } = await auth();

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: async () => getToken(),
  });
}
