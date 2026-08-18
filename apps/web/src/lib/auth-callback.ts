/**
 * Post-sign-in redirect helpers shared by the /auth sign-in surface and
 * the middleware.
 *
 * Deliberately dependency-free (no `server-only`, no Next imports) so the
 * client form, the edge middleware, and plain node unit tests can all use
 * the same rules.
 */

/**
 * Query param Neon Auth's hosted callback appends on the OAuth return trip
 * (NEON_AUTH_SESSION_VERIFIER_PARAM_NAME in @neondatabase/auth). Its presence
 * is what makes the session-verifier exchange necessary.
 */
export const NEON_AUTH_VERIFIER_PARAM = "neon_auth_session_verifier";

/**
 * Origin the candidate is resolved against. Never navigated to — it exists
 * only so a value that escapes to *any* other origin is detectable as one.
 */
const RESOLUTION_ORIGIN = "https://callback.invalid";

/**
 * Only accept a same-origin relative path as the post-sign-in target.
 * Anything that resolves to another origin — an absolute URL, a
 * protocol-relative `//evil.example`, or a backslash form like
 * `/\evil.example` (browsers normalise the backslash to a slash, so
 * prefix checks alone let it through) — collapses to the canonical
 * fallback `/`.
 *
 * Resolution, not string matching, is what makes that exhaustive: the
 * value is parsed the way the browser will parse it, and kept only when
 * the parse lands back on our own origin.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/";
  try {
    const url = new URL(raw, RESOLUTION_ORIGIN);
    if (url.origin !== RESOLUTION_ORIGIN) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/** True when the target is an API route rather than a rendered page. */
export function isApiRoute(target: string): boolean {
  return target.startsWith("/api/");
}

/**
 * Pick the URL Neon Auth should return the browser to after a social
 * sign-in.
 *
 * Neon Auth's hosted flow returns to `callbackURL` with
 * `?neon_auth_session_verifier=<token>` appended, and that verifier is
 * only ever exchanged for a session cookie in one of two places:
 *
 *   - the client SDK, on a *page* load (it re-issues get-session with the
 *     verifier attached — this is what makes the plain /auth login work), or
 *   - `auth.middleware()`, which we route only for /auth* and /native-auth/*.
 *
 * Neither runs on an API route. So when the MCP authorize endpoint bounced
 * an unauthenticated user to `/auth?callbackURL=/api/mcp/oauth/authorize?…`
 * and that value was handed to `signIn.social()` verbatim, Google returned
 * the user straight to the API route, no session cookie ever materialised,
 * the route bounced back to /auth — and the user looped through sign-in
 * forever.
 *
 * Fix: when the final destination is an API route, hand Neon Auth *this
 * page* as the return target instead. The verifier then lands on /auth
 * where the SDK can exchange it, and SignInForm's effect forwards to the
 * API route with the session cookie in hand.
 *
 * Any stale verifier already on the current URL is dropped so a second
 * attempt doesn't return with a spent token.
 */
export function signInReturnTarget(
  callbackURL: string,
  current: { pathname: string; search: string },
): string {
  if (!isApiRoute(callbackURL)) return callbackURL;

  const params = new URLSearchParams(current.search);
  params.delete(NEON_AUTH_VERIFIER_PARAM);
  const query = params.toString();
  return query ? `${current.pathname}?${query}` : current.pathname;
}
