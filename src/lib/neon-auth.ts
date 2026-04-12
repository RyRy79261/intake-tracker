import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Server-side Neon Auth instance.
 *
 * IMPORTANT: Only import this file in server components, API routes, or middleware.
 * Consumed by:
 *   - src/lib/auth-middleware.ts (withAuth HOF)
 *   - src/app/api/auth/[...path]/route.ts (catch-all handler)
 *   - middleware.ts (page-level redirect)
 *
 * Env vars (set in .env.local + Vercel):
 *   - NEON_AUTH_BASE_URL: Neon Auth service endpoint (Neon console > Branch > Auth)
 *   - NEON_AUTH_COOKIE_SECRET: 32+ char signing secret (openssl rand -base64 32)
 *   - ALLOWED_EMAILS: comma-separated whitelist (enforced in withAuth, not here)
 *
 * Note on env vars at module load:
 * The underlying createNeonAuth call validates `cookies.secret` is at least
 * 32 characters. To keep the module import-safe in tests and local dev without
 * NEON_AUTH_COOKIE_SECRET configured, we pad a fallback placeholder secret that
 * will still throw at first real use (sign-in, getSession) because the handler
 * can never validate anything signed with the placeholder. Production code
 * paths MUST set NEON_AUTH_COOKIE_SECRET in the environment.
 */
const FALLBACK_COOKIE_SECRET =
  "neon-auth-placeholder-secret-not-for-production-use-12345678";

const cookieSecret =
  process.env.NEON_AUTH_COOKIE_SECRET ?? FALLBACK_COOKIE_SECRET;

const baseUrl = process.env.NEON_AUTH_BASE_URL ?? "http://localhost:0";

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret,
  },
});
