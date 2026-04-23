import { auth } from "@/lib/neon-auth";

/**
 * Root Next.js middleware — page-level route protection via Neon Auth.
 *
 * Unauthenticated page requests are redirected to `/auth`. API routes are NOT
 * routed through this middleware because they are already protected by
 * `withAuth()` at the handler level (D-08: single centralized enforcement
 * point, and middleware-level protection would force us to special-case JSON
 * 401 responses vs page redirects).
 *
 * The matcher intentionally excludes:
 *   - /api/*        — protected by withAuth() in each route
 *   - /auth         — the sign-in page itself, else infinite redirect
 *   - /_next/*      — Next.js build assets
 *   - /icons/*      — PWA icon files
 *   - Files with extensions (favicon.ico, manifest.json, sw.js, etc.)
 */
export default auth.middleware({ loginUrl: "/auth" });

export const config = {
  matcher: [
    "/((?!api|auth|_next/static|_next/image|favicon\\.ico|manifest\\.json|icons|.*\\..*).*)",
  ],
};
