/**
 * GET /api/mcp/oauth/authorize — interactive OAuth 2.1 authorize endpoint.
 *
 *   1. Validate query params (client_id, redirect_uri, PKCE, state).
 *   2. Check Neon Auth session.
 *      - If none, redirect to /api/auth/sign-in/social?provider=google with
 *        callbackURL pointing back here. After Google sign-in completes,
 *        Neon Auth sets the session cookie and re-delivers the user to us.
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
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/neon-auth";
import { db } from "@/lib/drizzle";
import { usersSync } from "@/db/schema";
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
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256").default("S256"),
  state: z.string().min(1).max(512),
  scope: z.string().optional(),
});

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
  return NextResponse.redirect(url.toString(), { status: 302 });
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
    const callback = `${origin}/api/mcp/oauth/authorize?${req.nextUrl.searchParams.toString()}`;
    const signInUrl = new URL("/api/auth/sign-in/social", origin);
    signInUrl.searchParams.set("provider", "google");
    signInUrl.searchParams.set("callbackURL", callback);
    return NextResponse.redirect(signInUrl.toString(), { status: 302 });
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

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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
  return NextResponse.redirect(cb.toString(), { status: 302 });
}
