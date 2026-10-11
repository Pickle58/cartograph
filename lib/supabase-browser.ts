"use client";

import { useAuth } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import type { Database } from "@/types/database";

function publicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"): string {
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

// The Clerk session token is the access token. Realtime needs it on the
// socket; a client constructed with only the publishable key would join as
// anonymous and the channel policy would refuse the subscribe.
export function useSupabase(): SupabaseClient<Database> {
  const { getToken } = useAuth();
  return useMemo(
    () =>
      createClient<Database>(publicEnv("NEXT_PUBLIC_SUPABASE_URL"), publicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
        accessToken: async () => getToken(),
        realtime: {
          accessToken: async () => getToken(),
        },
      }),
    [getToken],
  );
}
