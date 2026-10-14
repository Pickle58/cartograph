import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

// Supabase never sees its own sessions here: Clerk owns sign-in, and its
// session token is sent on every request so row-level security policies can
// read the organization claim. Without `accessToken` the client would run as
// `anon` and every policy would quietly return nothing.
//
// Built per request because the token belongs to the request's user.
export async function createSupabaseClient(): Promise<SupabaseClient<Database>> {
  const { getToken } = await auth();

  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: async () => getToken(),
  });
}

// The agent has no Clerk session. Its bearer token is the access token, and
// the publishable key is only the apikey header. The secret key is not used:
// it would bypass row-level security.
export function createSupabaseClientWithAccessToken(
  accessToken: string,
): SupabaseClient<Database> {
  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: async () => accessToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
