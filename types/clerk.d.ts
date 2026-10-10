export {};

declare global {
  // Added to the session token in Clerk: Sessions → Customize session token.
  // The default token carries the organization's id but not its name, and
  // reading the name back from Clerk's API per request is what the token is
  // there to avoid.
  interface CustomJwtSessionClaims {
    org_name?: string;
  }
}
