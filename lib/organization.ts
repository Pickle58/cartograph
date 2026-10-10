import "server-only";
import { auth } from "@clerk/nextjs/server";

export type ActiveOrganization = {
  id: string;
  name: string;
};

// Everything comes from the verified session token; nothing here calls Clerk.
// The proxy has already turned away signed-out visitors, and Clerk's
// "membership required" setting means an active session always has an
// organization, so a missing claim is misconfiguration and fails loudly.
export async function getActiveOrganization(): Promise<ActiveOrganization> {
  const { orgId, sessionClaims } = await auth();

  if (!orgId) {
    throw new Error(
      "Session token has no active organization. Check that Organizations are enabled with membership required in the Clerk dashboard.",
    );
  }

  const name = sessionClaims?.org_name;
  if (typeof name !== "string" || name === "") {
    throw new Error(
      'Session token is missing the org_name claim. Add "org_name": "{{org.name}}" under Sessions → Customize session token in the Clerk dashboard.',
    );
  }

  return { id: orgId, name };
}
