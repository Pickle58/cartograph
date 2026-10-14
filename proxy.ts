import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Protected by default: a new route is private unless it's listed here. The
// redirect happens in the proxy, so a signed-out visitor never receives the
// page's HTML. `/` is the landing page. The snapshot route is public to Clerk
// because the agent has no session. Authorization is the bearer credential,
// not a signed-in user.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/agent/snapshot",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
