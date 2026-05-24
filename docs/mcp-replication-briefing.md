# Briefing: Implementing Neon Auth + Claude MCP Custom Connector

> Implementation checklist for a Claude Code agent adding an
> OAuth-bridged Claude.ai Custom Connector to a Next.js 14 + Vercel +
> Neon app.
>
> Status: working in production reference (`intake-tracker`). Follow
> in order and you'll skip the wrong turns that produced this doc. The
> "Hard-won gotchas" section is the single most valuable part. **Read it
> before writing any code.**

## What this gives you

A Claude.ai web user can open Settings → Connectors → Add custom connector,
paste `https://<your-app>/api/mcp/mcp`, complete a Google sign-in (via your
app's existing Neon Auth flow), approve a consent screen, and then chat with
Claude using read-only tools that pull from your Postgres.

Two cleanly separable phases:

1. **Phase A — Neon Auth.** Email + Google social sign-in, session cookies,
   server middleware. Required on its own merits.
2. **Phase B — MCP Custom Connector.** OAuth 2.1 + DCR authorization server
   that delegates user identity to Phase A.

Phase B depends on Phase A; do not attempt B before A is verified working
for normal app pages.

---

## Prerequisites

- Next.js 14 (App Router) deployed on Vercel
- A Neon Postgres database with the Neon Auth feature enabled on the branch
- A Google Cloud OAuth client (configured in the Neon Auth console)
- Vercel custom domain (optional but recommended — see gotcha #2 below)
- Claude Pro / Max / Team / Enterprise account (Free plan can't add custom
  connectors)
- pnpm workspace

---

## Phase A — Neon Auth

### A.1 Install

```bash
pnpm add @neondatabase/auth
```

### A.2 Environment variables

```bash
# .env.local + Vercel project settings (Production + Preview)
DATABASE_URL=postgres://...?sslmode=require
NEON_AUTH_URL=https://your-branch.neon-auth.neon.tech
NEON_AUTH_COOKIE_SECRET=  # openssl rand -base64 32 — minimum 32 chars

# Optional: comma-separated allow-list. If empty, anyone with a Neon Auth
# account can sign in.
ALLOWED_EMAILS=you@example.com,team@example.com
```

### A.3 Server-side auth instance

```ts
// src/lib/neon-auth.ts
import { createNeonAuth } from "@neondatabase/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    // Optional: enable if you serve from multiple subdomains
    // domain: '.example.com',
  },
});
```

### A.4 Catch-all API handler

```ts
// src/app/api/auth/[...path]/route.ts
import { auth } from "@/lib/neon-auth";
export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
```

This handles `/api/auth/sign-in/email`, `/api/auth/sign-in/social`,
`/api/auth/get-session`, `/api/auth/callback/google`, and the rest.
**It is POST-only for the action endpoints** — see gotcha #3.

### A.5 **CRITICAL: install `auth.middleware()`**

```ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/neon-auth";

const neonAuthMiddleware = auth.middleware({ loginUrl: "/auth" });

export default async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // The OAuth verifier-to-cookie exchange (exchangeOAuthToken) runs ONLY
  // inside auth.middleware(). Without this, Google sign-in returns the
  // user to /auth?...&neon_auth_session_verifier=... but no server code
  // converts the verifier into a session cookie, and useSession() stays
  // null forever. This is the #1 trap — see gotcha #1 in the parent doc.
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return neonAuthMiddleware(request);
  }

  return NextResponse.next();
}

export const config = {
  // Include /auth and /auth/* so the verifier exchange runs on the OAuth
  // return trip. Add /api/:path* if you also need API middleware (CORS,
  // capacitor-shell handling, etc.) — but route those branches separately
  // before reaching neonAuthMiddleware: it will try to redirect API calls
  // to /auth which breaks public endpoints like DCR.
  matcher: ["/auth", "/auth/:path*"],
};
```

### A.6 Client-side auth instance

```ts
// src/lib/auth-client.ts
"use client";

import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const authClient = createAuthClient(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  { adapter: BetterAuthReactAdapter() },
);

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
```

### A.7 Sign-in page that honours `?callbackURL=`

The `/auth` page must read a `callbackURL` query param and (a) forward it
into `signIn.social({...})` and (b) detect "already signed in" and
auto-forward. **This is the bridge that lets Phase B work — without it the
MCP authorize redirect chain dies after Google.**

```tsx
// src/app/auth/sign-in-form.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { signIn, useSession } from "@/lib/auth-client";

// Same-origin relative paths only — reject cross-origin redirects.
function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/"; // protocol-relative attack
  return raw;
}

export function SignInForm() {
  const searchParams = useSearchParams();
  const callbackURL = safeCallbackUrl(searchParams.get("callbackURL"));
  const { data: session, isPending: sessionPending } = useSession();
  const router = useRouter();

  // After Google sign-in, Neon Auth returns the user to the page they
  // *started* on (/auth?callbackURL=…) — NOT to the callbackURL value.
  // Detect "I'm signed in and there's a pending callback" and forward.
  // Hard navigation (not router.push) because callbackURL may be an API
  // route the App Router won't reach.
  useEffect(() => {
    if (sessionPending || !session?.user || callbackURL === "/") return;
    window.location.replace(callbackURL);
  }, [sessionPending, session, callbackURL]);

  // ... email + Google buttons, both passing { callbackURL } to signIn.*
}
```

Wrap `SignInForm` in `<Suspense>` on the page — `useSearchParams` forces
a CSR bailout at build time otherwise:

```tsx
// src/app/auth/page.tsx
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
```

### A.8 Server-side route protection (optional)

If you want `withAuth()` for protecting API routes, see
`src/lib/auth-middleware.ts` in `intake-tracker`. It reads the session via
`auth.getSession()` (cookie) or a bearer token (for native shells), checks
`ALLOWED_EMAILS`, and mirrors the user into `neon_auth.users_sync`.

### A.9 Verify Phase A before Phase B

- [ ] Sign up + sign in with email works and persists a session cookie.
- [ ] Sign in with Google completes the round-trip and you land back signed in.
- [ ] DevTools → Cookies shows `neon-auth.session_token` for your domain.
- [ ] Navigating to `/api/auth/get-session` (browser) returns JSON with your user.

If Google sign-in returns you to `/auth?…&neon_auth_session_verifier=…`
and you stay unauthenticated, **you missed A.5**. That's the single
biggest gotcha in this whole stack.

---

## Phase B — MCP Custom Connector

### B.1 Install

```bash
pnpm add mcp-handler @modelcontextprotocol/sdk@1.26.0
```

`mcp-handler` is the renamed `@vercel/mcp-adapter` — same API, same
maintainers, Apache-2.0. Pin `@modelcontextprotocol/sdk` to ≥ 1.26.0
(earlier versions have a security advisory).

### B.2 Drizzle schema additions

Four server-only tables. None of these participate in any client-side
sync — they're pure auth-server state.

```ts
// src/db/schema.ts — see intake-tracker for the full definitions
export const mcpOauthClients   // DCR-registered Claude installs
export const mcpAuthCodes      // single-use authorization codes
export const mcpAccessTokens   // hashed access + refresh tokens
export const mcpAuditLog       // per-tool-call audit trail
```

All tokens stored as SHA-256 hashes (`hashToken` helper). Plaintext never
hits the DB. FK references to `neon_auth.users_sync(id)` with
`ON DELETE CASCADE` so user deletion nukes their tokens.

### B.3 Routes

```
src/app/api/mcp/
├── [transport]/
│   └── route.ts                                    # the MCP endpoint
├── well-known/
│   ├── oauth-authorization-server/route.ts         # RFC 8414 metadata
│   └── oauth-protected-resource/route.ts           # RFC 9728 metadata
└── oauth/
    ├── register/route.ts                           # POST DCR
    ├── authorize/route.ts                          # GET (consent) + POST (approve/deny)
    └── token/route.ts                              # POST grants
```

Plus a `next.config.js` rewrite so the well-known URLs land at the
canonical RFC paths:

```js
async rewrites() {
  return [
    {
      source: '/.well-known/oauth-authorization-server',
      destination: '/api/mcp/well-known/oauth-authorization-server',
    },
    {
      source: '/.well-known/oauth-protected-resource',
      destination: '/api/mcp/well-known/oauth-protected-resource',
    },
  ];
}
```

(Next.js's app router doesn't route `.`-prefixed folders, so the
canonical `/.well-known/*` paths must be rewritten into normal paths.)

### B.4 The MCP endpoint

```ts
// src/app/api/mcp/[transport]/route.ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";

const baseHandler = createMcpHandler(
  (server) => {
    // Register tools. Each tool reads userId from extra.authInfo.extra
    // and queries your Postgres scoped to that user.
    server.registerTool("get_today_summary", { ... }, async (_args, extra) => {
      const userId = (extra.authInfo?.extra as any)?.userId;
      const result = await getTodaySummary(userId);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    });
    // ... more tools
  },
  { serverInfo: { name: "your-app", version: "1.0.0" } },
  { basePath: "/api/mcp", disableSse: true },
);

// IMPORTANT: with basePath: "/api/mcp" + file at
// /api/mcp/[transport]/route.ts, the actual MCP endpoint is
// /api/mcp/mcp (double "mcp" intentional — basePath + transport).
// Connector URL = https://<host>/api/mcp/mcp

const authedHandler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export const GET = authedHandler;
export const POST = authedHandler;
export const DELETE = authedHandler;  // MCP session termination
```

CORS is required (Claude.ai is a different origin). Wrap the response
with these headers:

```ts
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
"Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version, mcp-session-id",
// MCP's "Bearer resource_metadata=..." hint must be readable cross-origin
"Access-Control-Expose-Headers": "WWW-Authenticate",
```

### B.5 The `getPublicOrigin` helper

Required for OAuth metadata to advertise the correct issuer. **Order of
precedence matters — see gotcha #2**:

```ts
export function getPublicOrigin(req?: NextRequest | Request): string {
  // 1. Explicit override (set MCP_PUBLIC_URL in prod if behind a proxy)
  const override = process.env.MCP_PUBLIC_URL?.trim();
  if (override) return override.replace(/\/$/, "");

  // 2. Request forwarded headers — THIS WINS over VERCEL_URL because
  //    VERCEL_URL is the deployment-hash domain which is SSO-gated.
  if (req) {
    const fwdHost = req.headers.get("x-forwarded-host");
    const fwdProto = req.headers.get("x-forwarded-proto");
    if (fwdHost) return `${fwdProto ?? "https"}://${fwdHost}`;
    const host = req.headers.get("host");
    if (host) return `${fwdProto ?? "https"}://${host}`;
  }

  // 3. VERCEL_URL is a LAST-RESORT fallback (no-request contexts only)
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
```

### B.6 The authorize endpoint (this is where the design lives)

GET path:
1. Validate query params (PKCE, client_id, redirect_uri, state).
2. Look up the DCR client; verify `redirect_uri` is in its registered list.
3. Read Neon Auth session via `auth.getSession()`.
   - **If absent**, redirect to `/auth?callbackURL=<this-url>`. **Do NOT
     redirect to `/api/auth/sign-in/social` — see gotcha #3.**
4. Enforce `ALLOWED_EMAILS` whitelist.
5. Mirror user into `neon_auth.users_sync` (FK target for `mcp_auth_codes`).
6. Render consent HTML with a `<form method="POST">` carrying every
   query param in hidden inputs.

POST path:
1. Re-validate from form-rebuilt searchParams.
2. Re-check session + whitelist.
3. If `action === "approve"`, mint an authorization code:
   ```ts
   const code = await issueAuthCode({
     clientId, userId, redirectUri,
     codeChallenge, codeChallengeMethod: "S256", scope,
   });
   ```
4. Redirect back to `redirect_uri` with `?code=…&state=…`.
   **MUST use HTML redirect, NOT `NextResponse.redirect(302)` — see gotcha #4.**

```ts
function htmlRedirect(target: string): NextResponse {
  const e = escapeHtml(target);
  return new NextResponse(
    `<!doctype html><html><head>
       <meta charset="utf-8">
       <meta http-equiv="refresh" content="0;url=${e}">
     </head><body>
       <p>Redirecting… <a href="${e}">Continue</a> if not redirected.</p>
       <script>window.location.replace(${JSON.stringify(target)});</script>
     </body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
```

### B.7 The token endpoint

Standard RFC 6749 token endpoint. Two grant types: `authorization_code`
and `refresh_token`. Three non-obvious requirements:

```ts
// Required by RFC 6749 §5.1 — set on every response, success and error
{ "Cache-Control": "no-store", "Pragma": "no-cache" }
```

Wrap the body parser in try/catch — empty body + `application/json`
content-type throws SyntaxError otherwise (fuzz-test discovered this):

```ts
async function readBody(request: NextRequest) {
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const text = await request.text();
      return text.trim() ? JSON.parse(text) : {};
    }
    return Object.fromEntries(await request.formData());
  } catch (err) {
    return { __error: String(err) };
  }
}
```

Refresh-token rotation MUST be transactional — atomic revoke-old +
insert-new in a single `db.transaction()` so a transient DB failure
doesn't permanently kill the user's session:

```ts
return await db.transaction(async (tx) => {
  const revoked = await tx
    .update(mcpAccessTokens)
    .set({ revokedAt: now })
    .where(and(
      eq(mcpAccessTokens.refreshTokenHash, refreshHash),
      eq(mcpAccessTokens.clientId, clientId),
      isNull(mcpAccessTokens.revokedAt),
      gte(mcpAccessTokens.refreshExpiresAt, now),
    ))
    .returning();
  if (revoked.length === 0) return { ok: false, reason: "..." };

  await tx.insert(mcpAccessTokens).values({ /* new row */ });
  return { ok: true, tokens };
});
```

`drizzle-orm/neon-http` DOES support transactions despite being stateless
HTTP — verified working in production.

### B.8 DCR endpoint hardening

DCR is unauthenticated by design (RFC 7591). Harden by allow-listing
redirect URIs to known MCP-client domains:

```ts
function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (isLoopback) return u.protocol === "http:" || u.protocol === "https:";
    if (u.protocol !== "https:") return false;  // public hosts: https only
    return (
      u.hostname === "claude.ai" ||
      u.hostname.endsWith(".claude.ai") ||
      u.hostname === "anthropic.com" ||
      u.hostname.endsWith(".anthropic.com")
    );
  } catch {
    return false;
  }
}
```

### B.9 The 8 read-only tools

In `intake-tracker` these are:
- `get_today_summary`
- `query_intake_history`
- `query_weight_history`
- `query_blood_pressure_history`
- `query_eating_history`
- `list_medications`
- `list_recent_doses`
- `get_inventory_status`

Adapt to your domain. Patterns to copy:
- Every query takes `userId` as the first argument and scopes EVERY
  WHERE clause by it.
- `isNull(table.deletedAt)` on every soft-delete-aware table.
- Date-range queries: validate `end >= start` and `(end - start) <= 1 year`
  in the Zod input schema.
- Cap row results at 5000 with a `truncated: true` flag so the model
  knows to narrow the window instead of getting back a partial set.
- `leftJoin`s onto secondary tables must include the user/soft-delete
  filter in the join predicate (defence in depth on top of FKs).

---

## Hard-won gotchas (READ THIS BEFORE WRITING CODE)

Each of these is a specific wrong assumption that breaks the flow in a
way that's hard to diagnose without prior knowledge. Read all ten before
writing any of the code below.

### Gotcha 1: `auth.middleware()` is required, not optional

The OAuth verifier-to-session-cookie exchange runs ONLY inside
`auth.middleware()` — it is NOT in `auth.handler()`. If you only install
the handler, Google sign-in completes but the session cookie never gets
set. Symptom: user lands on `/auth?…&neon_auth_session_verifier=…` with
the verifier in the URL but stays unauthenticated forever.

The verifier exchange also requires a `neon-auth.session_challange`
cookie (yes, that's the typo in the package) to be present on the
return trip. If it's missing (e.g. SameSite policy stripped it), the
exchange returns null silently.

### Gotcha 2: `VERCEL_URL` is the wrong issuer

`VERCEL_URL` (auto-set by Vercel) is the deployment-hash URL
(e.g. `intake-tracker-ooptvrqpl-…vercel.app`). On production deployments
that URL is gated by Vercel SSO. If your `getPublicOrigin()` returns
`VERCEL_URL` and you advertise it in OAuth metadata, Claude follows the
URL, hits SSO, and gets a 403. **Always prefer the request's
`x-forwarded-host`/`Host` header over `VERCEL_URL`.**

You can override entirely with `MCP_PUBLIC_URL` env var.

### Gotcha 3: `/api/auth/sign-in/social` is NOT a navigable URL

When my MCP authorize route detected "no session", I redirected the
browser to `/api/auth/sign-in/social?provider=google&callbackURL=…`.
That endpoint is the POST-only JSON API used by `signIn.social()`
internally. A browser GET to it returns 404.

**Always bounce through your `/auth` page**, which renders the
sign-in UI that calls `signIn.social({...})` client-side. The `/auth`
page must honour `?callbackURL=` (see A.7).

### Gotcha 4: CSP `form-action 'self'` silently blocks the consent redirect

If your app's CSP includes `form-action 'self'` (a common security
default), any 302 from a POST handler to a cross-origin URL gets
**silently dropped by the browser** (CSP3 §6.1.18 enforces form-action
on redirects, not just initial submissions). The form submit appears
to do nothing.

Workaround: return an HTML page with `<meta http-equiv="refresh">` +
`window.location.replace()` instead of a 302. Document-level
navigations aren't subject to `form-action`.

The "Approve" click symptom was: page loader stuck at ~10% (in mobile
Chrome) or page silently re-rendering the consent screen. Same root
cause.

### Gotcha 5: claude.ai web requires DCR + PKCE, not just a bearer token

There's no UI to paste a static token in claude.ai's connector dialog.
You MUST implement OAuth 2.1 + Dynamic Client Registration. Static
tokens only work for Claude Desktop / Claude Code (mcp.json config).

### Gotcha 6: After Google sign-in, you're on the *originating* URL, not callbackURL

Better Auth's `signIn.social({ callbackURL: "/foo" })` returns the user
to the URL they were on when they clicked the button (with
`?neon_auth_session_verifier=…` appended) — NOT to the callbackURL
value. The callbackURL is for after-sign-in *forwarding*, which your
sign-in page must do explicitly via `useEffect + useSession + window.location.replace`.

Without that auto-forward, the user gets stuck on `/auth` with a valid
session but no idea where to go next.

### Gotcha 7: The MCP endpoint URL is `/api/mcp/mcp` (doubled)

With `mcp-handler`'s `basePath: "/api/mcp"` + a route file at
`/api/mcp/[transport]/route.ts`, the resulting URL is `/api/mcp/mcp`
(transport segment value = `"mcp"`). This looks wrong but is correct.
Alternative: move the route to `/api/[transport]/route.ts` with
`basePath: "/api"` for a cleaner `/api/mcp` URL — but that claims the
whole `/api/[transport]` namespace.

### Gotcha 8: `useSearchParams` needs `<Suspense>` at build time

If your `/auth` page uses `useSearchParams()` (which it must, to read
`callbackURL`), Next.js refuses to statically prerender it and the
production build fails. Wrap the form component in `<Suspense>` in the
page file.

### Gotcha 9: schema-verifier scripts often hard-code table counts

If your repo has a "verify schema after migration" script (e.g.
`scripts/verify-schema.ts`) that asserts a specific table count, the
4 new MCP tables will fail it. Update the expected count + add a
spot-check for one of the MCP tables.

### Gotcha 10: A CDN/firewall in front of Vercel may block claude.ai's probes

If you have Cloudflare in front, "Bot Fight Mode" can 403 claude.ai's
discovery fetches (which look like bots — they ARE bots). Vercel
Firewall's auto "DDoS Mitigation" can also catch them. If discovery
works in a browser but Claude says "Couldn't reach the MCP server",
check both. Allow `/api/mcp/*` and `/.well-known/oauth-*` paths
through.

---

## Verification checklist (end-to-end)

Run this AFTER deploying both phases:

1. **Phase A smoke**
   - [ ] Browse to `/auth`, sign in with Google. Land on `/`. Cookie set.
   - [ ] `/api/auth/get-session` returns your user as JSON.

2. **Phase B discovery**
   - [ ] `/.well-known/oauth-authorization-server` returns JSON whose
         `issuer` is YOUR CUSTOM DOMAIN (not the `*.vercel.app` URL).
   - [ ] `/.well-known/oauth-protected-resource` returns JSON pointing at
         `/api/mcp` with the auth server URL in `authorization_servers`.
   - [ ] `POST /api/mcp/mcp` without a bearer returns 401 with a
         `WWW-Authenticate: Bearer resource_metadata="…"` header.

3. **Phase B connector**
   - [ ] In claude.ai → Settings → Connectors → Add custom connector →
         paste `https://<your-host>/api/mcp/mcp` → Connect.
   - [ ] Browser opens your `/auth` page (or skips to consent if you're
         already signed in to the app).
   - [ ] After Google, you see the consent screen ("Connect to <your app>").
   - [ ] Click Approve. Browser returns to Claude. Connector shows as
         connected with the list of tools.
   - [ ] Open a new chat → ask "what does the connector see?" → Claude
         calls one of your tools and returns real data.

If step 3 stalls on the Approve click, **read gotcha #4 first**.

---

## Recommended phasing

| Step | What | Verify before continuing |
|------|------|--------------------------|
| 1 | Phase A install + envs + `auth.handler()` | Email sign-in works |
| 2 | **Install `auth.middleware()` (A.5)** | Google sign-in lands signed in |
| 3 | `/auth` page with `callbackURL` + Suspense | `/auth?callbackURL=/` after sign-in lands on `/` |
| 4 | Phase B schema + migration | `pnpm db:migrate` clean |
| 5 | Well-known routes + rewrite | Browser JSON works on custom domain |
| 6 | DCR route | `curl -X POST` returns a `client_id` |
| 7 | Authorize route (GET only, render consent) | Visit `/api/mcp/oauth/authorize?…` shows consent |
| 8 | Authorize route (POST, **HTML redirect**) | Approve from a different-origin form roundtrips |
| 9 | Token route with cache headers + tx rotation | `POST /token` returns access + refresh tokens |
| 10 | MCP endpoint with `withMcpAuth` | Bearer tools/list returns the tool list |
| 11 | E2E test in Claude.ai | Connect → approve → tool call returns data |

**Do not skip step 2.** Re-read gotcha #1.

---

## Reference implementation

`intake-tracker` is the working reference. Key files:

- `src/middleware.ts` — neon auth middleware install + matcher
- `src/lib/neon-auth.ts` — server-side auth instance
- `src/lib/auth-client.ts` — client-side auth instance + `useSession`
- `src/app/auth/sign-in-form.tsx` — `callbackURL` honouring + auto-forward
- `src/lib/mcp/origin.ts` — `getPublicOrigin` priority chain
- `src/lib/mcp/oauth.ts` — DCR, code consume, refresh rotation
- `src/lib/mcp/tokens.ts` — opaque token + PKCE verify
- `src/app/api/mcp/oauth/authorize/route.ts` — consent + HTML redirect
- `src/app/api/mcp/oauth/token/route.ts` — token grants + Cache-Control
- `src/app/api/mcp/[transport]/route.ts` — MCP endpoint + `withMcpAuth`
- `next.config.js` — well-known rewrites + CSP
- `docs/mcp-connector.md` — design doc with the full OAuth flow diagram

Tests worth porting:
- `src/lib/mcp/tokens.test.ts` — PKCE byte-length compare
- `src/lib/mcp/oauth-flow.test.ts` — single-use code, rotation
- `src/__tests__/integration/mcp-oauth-integration.test.ts` — real Postgres
- `src/__tests__/integration/mcp-rotation-race.test.ts` — concurrent rotation
- `src/app/api/mcp/oauth/{register,token}/route.fuzz.test.ts` — adversarial inputs
