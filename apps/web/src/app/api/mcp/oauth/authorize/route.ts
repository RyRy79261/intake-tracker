/**
 * GET /api/mcp/oauth/authorize — interactive OAuth 2.1 authorize endpoint.
 *
 *   1. Validate query params (client_id, redirect_uri, PKCE, state).
 *   2. Check Neon Auth session.
 *      - If none, redirect to /auth?callbackURL=<this-url>. The /auth
 *        page is the client-side sign-in UI (email/password + Google
 *        button); because this URL is an API route it keeps the OAuth
 *        return trip on itself (so the session verifier can be
 *        exchanged) and forwards here afterwards — see
 *        signInReturnTarget() in src/lib/auth-callback.ts.
 *        We can't redirect straight to /api/auth/sign-in/social: that
 *        endpoint is the Neon Auth POST-only JSON API, not a navigable
 *        browser URL.
 *      - The bounce happens AT MOST ONCE per attempt: it sets a
 *        short-lived HttpOnly marker cookie, and coming back still
 *        signed out renders a dead-end "finish signing in" page instead
 *        of bouncing again. Without that guard a sign-in that fails to
 *        leave a session cookie ping-pongs the user between /auth and
 *        this route forever. The marker is server-issued rather than a
 *        query param precisely because everything in the query string
 *        is client-supplied: a caller must not be able to skip its own
 *        trip through sign-in by asserting it already happened.
 *   3. Verify the signed-in email is on the ALLOWED_EMAILS whitelist.
 *   4. Mirror the user into neon_auth.users_sync (FK target for auth_codes).
 *   5. Render a minimal consent page on first GET; on POST (Approve), mint
 *      an authorization code and 302 to the client's redirect_uri.
 *
 * Single route handles GET (initial + consent screen) and POST (consent
 * confirmation). Skip-with-cookie auto-approval is intentionally NOT
 * implemented in this iteration — the user always sees the consent screen
 * once per code, which is more transparent.
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/neon-auth";
import { db } from "@intake/db/client";
import { usersSync } from "@intake/db/schema";
import { sql } from "drizzle-orm";
import { getClient, issueAuthCode } from "@/lib/mcp/oauth";
import { parseScopeString, serialiseScopes } from "@/lib/mcp/scopes";
import { isEmailAllowed } from "@/lib/mcp/whitelist";
import { getPublicOrigin } from "@/lib/mcp/origin";

export const dynamic = "force-dynamic";

// PKCE method intentionally restricted to S256 — must match the
// `code_challenge_methods_supported: ["S256"]` advertised by the
// authorization-server metadata. Accepting "plain" here would weaken
// PKCE and contradict discovery, so the schema rejects it outright.
const querySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256").default("S256"),
  state: z.string().min(1).max(512),
  scope: z.string().optional(),
});

/**
 * Server-issued marker proving this browser has already been sent through
 * sign-in *for this authorization attempt*. HttpOnly (no script can forge
 * it), scoped to this route alone, and short-lived — it only has to
 * survive one trip to /auth and back. See the "at most once" note in the
 * file docstring.
 *
 * The value is a fingerprint of the attempt, not a flag: a marker left by
 * an abandoned attempt must not make a *different* attempt's first request
 * dead-end. Someone who gives up on one connect and starts another — a
 * second tab, a different client — should still get their own automatic
 * trip through sign-in.
 */
const SIGNIN_RETRY_COOKIE = "mcp_signin_retry";
const SIGNIN_RETRY_TTL_SECONDS = 600;
const AUTHORIZE_PATH = "/api/mcp/oauth/authorize";

function renderError(message: string, status = 400) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Authorization error</title>
<style>
  body { font-family: ui-sans-serif, system-ui; background: #0f172a; color: #e2e8f0; padding: 2rem; max-width: 32rem; margin: 0 auto; }
  h1 { font-size: 1.25rem; color: #fca5a5; }
  pre { background: #1e293b; padding: 1rem; border-radius: 0.5rem; overflow: auto; }
</style></head>
<body>
  <h1>Authorization failed</h1>
  <pre>${escapeHtml(message)}</pre>
</body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c] as string);
}

/**
 * Cross-origin "redirect" via HTML response.
 *
 * Why this exists instead of NextResponse.redirect:
 *
 * The app-wide CSP (next.config.js) sets `form-action 'self'`. When the
 * consent screen's form POSTs to this route and the handler responds
 * with a 302 to claude.ai (or any non-self origin), CSP3 §6.1.18 makes
 * the browser check `form-action` against the redirect target as well —
 * not just the initial submission URL. The 302 to claude.ai therefore
 * gets blocked silently and the user's Approve click appears to do
 * nothing. (Reproduced in mobile Chrome inside Claude's in-app browser.)
 *
 * Returning an HTML page instead is treated as a normal document load —
 * `form-action` only restricts form submissions, so the meta-refresh and
 * JS-driven navigation that follow are unaffected. Both vectors are
 * included so users without JS still continue, and the anchor is the
 * final fallback for old engines that ignore meta-refresh too.
 */
function htmlRedirect(target: string): NextResponse {
  const escaped = escapeHtml(target);
  const body = `<!doctype html>
<html><head><meta charset="utf-8"><title>Redirecting…</title>
<meta http-equiv="refresh" content="0;url=${escaped}">
</head><body>
<p>Redirecting back to the application… <a href="${escaped}">Continue</a> if not redirected.</p>
<script>window.location.replace(${JSON.stringify(target)});</script>
</body></html>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function redirectClientWithError(
  redirectUri: string,
  state: string | null,
  error: string,
  description?: string,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return htmlRedirect(url.toString());
}

async function getSignedInUser(): Promise<
  { userId: string; email: string | null } | null
> {
  try {
    const { data: session } = await auth.getSession();
    if (!session?.user) return null;
    return {
      userId: session.user.id,
      email: session.user.email?.toLowerCase() ?? null,
    };
  } catch {
    return null;
  }
}

async function validateRequest(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: renderError(
        `Invalid request: ${parsed.error.message}`,
        400,
      ),
    };
  }

  const client = await getClient(parsed.data.client_id);
  if (!client) {
    return {
      ok: false as const,
      response: renderError("Unknown client_id", 400),
    };
  }
  if (!client.redirectUris.includes(parsed.data.redirect_uri)) {
    return {
      ok: false as const,
      response: renderError("redirect_uri not registered for this client", 400),
    };
  }

  const scopes = parseScopeString(parsed.data.scope);
  return {
    ok: true as const,
    params: parsed.data,
    client,
    scope: serialiseScopes(scopes),
  };
}

/** `/auth?callbackURL=<this exact request>`. */
function buildSignInUrl(req: NextRequest, origin: string): URL {
  const signInUrl = new URL("/auth", origin);
  signInUrl.searchParams.set(
    "callbackURL",
    `${AUTHORIZE_PATH}?${req.nextUrl.searchParams.toString()}`,
  );
  return signInUrl;
}

/**
 * Identifies one authorization attempt. `client_id` + `state` is what
 * distinguishes concurrent attempts from each other; hashed so the cookie
 * carries no readable request detail. Not a security boundary — the cookie
 * is HttpOnly and same-site, and the worst a forged one could do is show
 * its own sender the "sign in to continue" page.
 */
function attemptFingerprint(params: URLSearchParams): string {
  const clientId = params.get("client_id") ?? "";
  const state = params.get("state") ?? "";
  return createHash("sha256")
    .update(`${clientId}\u0000${state}`)
    .digest("base64url")
    .slice(0, 22);
}

/** Record that this browser has now been sent through sign-in once. */
function setRetryMarker(
  res: NextResponse,
  origin: string,
  fingerprint: string,
): NextResponse {
  res.cookies.set({
    name: SIGNIN_RETRY_COOKIE,
    value: fingerprint,
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: AUTHORIZE_PATH,
    maxAge: SIGNIN_RETRY_TTL_SECONDS,
  });
  return res;
}

/**
 * Spend the marker. Cleared both when the flow succeeds and when it
 * dead-ends, so the next attempt starts from a clean slate and gets its
 * own automatic trip through sign-in.
 */
function clearRetryMarker(res: NextResponse): NextResponse {
  res.cookies.set({
    name: SIGNIN_RETRY_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: AUTHORIZE_PATH,
    maxAge: 0,
  });
  return res;
}

/** True only for a second signed-out arrival of *this same* attempt. */
function hasRetryMarker(req: NextRequest, fingerprint: string): boolean {
  return req.cookies.get(SIGNIN_RETRY_COOKIE)?.value === fingerprint;
}

/**
 * Terminal page for "came back from sign-in without a session". Nothing
 * here navigates on its own — the link is the only way onward, so the
 * flow cannot loop.
 */
function renderSignInRequired(signInUrl: URL): NextResponse {
  const href = escapeHtml(signInUrl.toString());
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sign in to continue</title>
<style>
  body { font-family: ui-sans-serif, system-ui; background: #0f172a; color: #e2e8f0; padding: 2rem; max-width: 32rem; margin: 0 auto; }
  .card { background: #1e293b; border-radius: 0.75rem; padding: 1.5rem; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  p { color: #cbd5e1; }
  a.button { display: inline-block; margin-top: 1rem; background: #22c55e; color: #052e16; font-weight: 600; padding: 0.5rem 1rem; border-radius: 0.5rem; text-decoration: none; }
</style></head>
<body>
  <div class="card">
    <h1>Sign in to continue</h1>
    <p>You were sent to sign in, but came back without an active session, so
    the connection can&#39;t be authorized yet.</p>
    <p>This usually means the sign-in didn&#39;t finish, or the browser is
    blocking cookies for this site (common in an in-app browser — try opening
    this page in your normal browser instead).</p>
    <a class="button" href="${href}">Sign in and try again</a>
  </div>
</body></html>`;
  return new NextResponse(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function ensureUserInSync(userId: string, email: string | null) {
  await db
    .insert(usersSync)
    .values({ id: userId, email })
    .onConflictDoUpdate({
      target: usersSync.id,
      set: { email: sql`COALESCE(${usersSync.email}, ${email ?? null})` },
    });
}

export async function GET(req: NextRequest) {
  const validated = await validateRequest(req);
  if (!validated.ok) return validated.response;
  const { params, client, scope } = validated;

  const user = await getSignedInUser();
  if (!user) {
    const origin = getPublicOrigin(req);
    const signInUrl = buildSignInUrl(req, origin);

    // Already been sent to sign in once and still no session — stop.
    // Redirecting again would just restart the same round trip, which is
    // exactly the loop this guard exists to break. Hand the user a page
    // that says what happened and a link they have to click, so any
    // further attempt is deliberate rather than automatic.
    const fingerprint = attemptFingerprint(req.nextUrl.searchParams);
    if (hasRetryMarker(req, fingerprint)) {
      return clearRetryMarker(renderSignInRequired(signInUrl));
    }

    // Bounce through the /auth page (client UI) rather than the
    // /api/auth/sign-in/social JSON endpoint, which only accepts POST.
    // The /auth page reads `callbackURL` from its query string and hands
    // it to signIn.social/.email, keeping the OAuth return trip on a page
    // (see signInReturnTarget) before forwarding here. callbackURL is a
    // same-origin relative path (sign-in-form.tsx rejects anything else).
    return setRetryMarker(
      NextResponse.redirect(signInUrl.toString(), { status: 302 }),
      origin,
      fingerprint,
    );
  }

  if (!isEmailAllowed(user.email)) {
    return redirectClientWithError(
      params.redirect_uri,
      params.state,
      "access_denied",
      "Email not on allow-list",
    );
  }

  await ensureUserInSync(user.userId, user.email);

  // Render consent page. Form POSTs back to the same URL with the same
  // search params (encoded in hidden inputs) plus `confirm=yes`.
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Connect to intake-tracker</title>
<style>
  body { font-family: ui-sans-serif, system-ui; background: #0f172a; color: #e2e8f0; padding: 2rem; max-width: 32rem; margin: 0 auto; }
  .card { background: #1e293b; border-radius: 0.75rem; padding: 1.5rem; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  p { color: #cbd5e1; }
  ul { padding-left: 1.25rem; }
  .meta { font-size: 0.875rem; color: #94a3b8; margin-top: 1rem; }
  .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
  button { font: inherit; padding: 0.5rem 1rem; border-radius: 0.5rem; border: 0; cursor: pointer; }
  .approve { background: #22c55e; color: #052e16; font-weight: 600; }
  .deny { background: #ef4444; color: #450a0a; font-weight: 600; }
</style></head>
<body>
  <div class="card">
    <h1>Connect to intake-tracker</h1>
    <p><strong>${escapeHtml(client.clientName)}</strong> is requesting read-only access to your intake-tracker data:</p>
    <ul>
      <li>Today's intake totals and latest BP/weight</li>
      <li>Intake, weight, blood-pressure, and food history</li>
      <li>Active medications and recent dose logs</li>
      <li>Inventory status</li>
    </ul>
    <p class="meta">Signed in as ${escapeHtml(user.email ?? user.userId)}. Scope: ${escapeHtml(scope)}.</p>
    <form method="POST" class="actions">
      ${Array.from(req.nextUrl.searchParams.entries())
        .map(
          ([k, v]) =>
            `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`,
        )
        .join("")}
      <button type="submit" name="action" value="approve" class="approve">Approve</button>
      <button type="submit" name="action" value="deny" class="deny">Deny</button>
    </form>
  </div>
</body></html>`;

  // Reaching consent means sign-in worked; retire the marker so a later
  // attempt is not mistaken for a retry of this one.
  return clearRetryMarker(
    new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const action = String(form.get("action") ?? "");

  // Rebuild the validation params from the form body (they were carried in
  // hidden inputs).
  const fakeUrl = new URL(req.url);
  for (const [k, v] of form.entries()) {
    if (typeof v === "string" && k !== "action") {
      fakeUrl.searchParams.set(k, v);
    }
  }
  const fakeReq = new NextRequest(fakeUrl);
  const validated = await validateRequest(fakeReq);
  if (!validated.ok) return validated.response;
  const { params, scope } = validated;

  const user = await getSignedInUser();
  if (!user || !isEmailAllowed(user.email)) {
    return redirectClientWithError(
      params.redirect_uri,
      params.state,
      "access_denied",
      "Session expired or email not on allow-list",
    );
  }

  if (action !== "approve") {
    return redirectClientWithError(
      params.redirect_uri,
      params.state,
      "access_denied",
      "User declined consent",
    );
  }

  await ensureUserInSync(user.userId, user.email);

  const code = await issueAuthCode({
    clientId: params.client_id,
    userId: user.userId,
    redirectUri: params.redirect_uri,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method,
    scope,
  });

  const cb = new URL(params.redirect_uri);
  cb.searchParams.set("code", code);
  cb.searchParams.set("state", params.state);
  // HTML redirect (not 302) — see htmlRedirect() docstring for why
  // form-action 'self' in the global CSP would otherwise block this.
  return htmlRedirect(cb.toString());
}
