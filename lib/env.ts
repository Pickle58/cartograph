import { signingKeyFromJwk } from "./analysis-jwt";

// Loaded by next.config.ts, so a missing value stops `next dev`, `next build`
// and `next start` before the first request rather than surfacing later as a
// Clerk redirect to the wrong place or an anonymous Supabase client.
//
// Server-only in practice: CLERK_SECRET_KEY is not in the client bundle, so
// importing this from a client component would throw in the browser.

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Set it in .env.local and restart.`,
    );
  }
  return value;
}

function requiredUrl(name: string, value: string | undefined): string {
  const raw = required(name, value);
  try {
    new URL(raw);
  } catch {
    throw new Error(`Environment variable ${name} is not a valid URL: ${raw}`);
  }
  return raw;
}

// Literal `process.env.X` reads, one per name, so Next can inline the
// NEXT_PUBLIC_ values wherever they're bundled.
export const env = {
  clerkPublishableKey: required(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  ),
  clerkSecretKey: required("CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY),
  // Without these, Clerk silently falls back to its hosted Account Portal.
  clerkSignInUrl: required(
    "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
  ),
  clerkSignUpUrl: required(
    "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
    process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
  ),
  // Every sign-in method lands here unless a protected route sent the
  // visitor to sign in, in which case they go back to it.
  clerkSignInFallbackRedirectUrl: required(
    "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
  ),
  clerkSignUpFallbackRedirectUrl: required(
    "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
    process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
  ),
  supabaseUrl: requiredUrl(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  // Private half of an ES256 key Supabase has imported. Used only to mint a
  // short-lived token for one analysis. Not the secret API key.
  analysisSigningJwk: requiredSigningJwk(process.env.ANALYSIS_SIGNING_JWK),
} as const;

function requiredSigningJwk(value: string | undefined): string {
  const raw = required("ANALYSIS_SIGNING_JWK", value);
  signingKeyFromJwk(raw);
  return raw;
}
