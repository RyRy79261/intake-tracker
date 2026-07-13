# MCP Connector (claude.ai → intake-tracker)

## Goal

Connect the user's claude.ai web account (Pro/Max/Team/Enterprise) to their
intake-tracker data as a **read-only** custom connector, so they can ask
Claude questions like "what was my average BP last week?" or "how many doses
of X did I take this month?".

Authentication reuses the existing **Neon Auth + Google social** login — no
new credentials, no second account, no static tokens.

## Non-goals

- **No writes.** No `log_*`, `delete_*`, or mutation tools in this iteration.
  The MCP server will not register any handler that mutates state. Writes are
  a separate, future iteration.
- **No new identity provider.** Identity stays in Neon Auth. We are not
  adding Better Auth or any second auth library.
- **No Claude Desktop / Claude Code path.** This iteration targets
  claude.ai web only. (A bearer-token-only path for Claude Code is trivially
  addable later — same MCP server, alternative auth — but is out of scope.)

## Why this design (the constraint)

claude.ai's Custom Connectors UI only accepts a remote MCP server that
speaks **OAuth 2.1 with Dynamic Client Registration (RFC 7591)** plus PKCE.
There is no field to paste a Google token, an API key, or a long-lived
bearer. The MCP server **must act as the OAuth Authorization Server** from
claude.ai's perspective.

That does *not* mean we re-implement user identity — Neon Auth still owns
that. The MCP server is a thin OAuth AS that delegates "who is this user?"
to the existing Neon Auth Google sign-in flow.

## Two-layer auth model

1. **claude.ai ↔ MCP server** — OAuth 2.1 + DCR. claude.ai is the OAuth
   *client*. Our app is the OAuth *AS + resource server*. Tokens minted
   here are our tokens, scoped to one `userId`.
2. **User ↔ MCP server** — when claude.ai redirects the user to
   `/api/mcp/oauth/authorize`, our server checks the Neon Auth session
   cookie. If absent or invalid, it bounces through the existing
   `/api/auth/sign-in/social?provider=google` flow with a `callbackURL`
   pointing back to `/authorize`. After Google sign-in returns, the server
   has a verified `{ userId, email }`, runs the `ALLOWED_EMAILS` whitelist
   check, then mints a short-lived authorization code bound to that
   `userId` and redirects back to claude.ai.

User-visible result: click "Connect" in claude.ai → Google sign-in popup
(if not already signed in to intake-tracker in that browser) → consent
screen showing the requested scopes → done.

## End-to-end flow

```
┌──────────┐                                                    ┌────────────┐
│ claude.ai│                                                    │ User (web) │
└────┬─────┘                                                    └─────┬──────┘
     │                                                                │
     │ 1. User adds connector URL: https://intake.../api/mcp          │
     │ 2. GET /.well-known/oauth-protected-resource ──────────────────┐
     │ 3. GET /.well-known/oauth-authorization-server ────────────────┤
     │ 4. POST /api/mcp/oauth/register  (DCR)                         │
     │    ← { client_id, client_secret? }                             │
     │                                                                │
     │ 5. Redirect user → /api/mcp/oauth/authorize?                   │
     │       client_id=…&response_type=code&code_challenge=…&         │
     │       state=…&redirect_uri=https://claude.ai/api/...           │
     │                                                                │
     │                            ┌─── No Neon Auth session? ─────┐   │
     │                            ▼                               │   │
     │                  /api/auth/sign-in/social?                 │   │
     │                  provider=google&                          │   │
     │                  callbackURL=/api/mcp/oauth/authorize?...  │   │
     │                            │                               │   │
     │                            └─→ Google → Neon Auth ─────────┘   │
     │                                                                │
     │                  Session OK → check ALLOWED_EMAILS             │
     │                            → mint auth_code (10 min TTL)       │
     │                            → 302 redirect_uri?code=…&state=…   │
     │                                                                │
     │ 6. POST /api/mcp/oauth/token                                   │
     │      grant_type=authorization_code&code=…&code_verifier=…      │
     │    ← { access_token, token_type: "Bearer", expires_in,         │
     │        refresh_token }                                         │
     │                                                                │
     │ 7. POST /api/mcp                                               │
     │    Authorization: Bearer <access_token>                        │
     │    body: JSON-RPC (initialize, tools/list, tools/call, …)      │
     │                                                                │
```

## Components to build

### 1. Drizzle schema additions (`src/db/schema.ts`)

Three new tables. All keyed on the existing `usersSync.id`.

```ts
// Dynamically-registered OAuth clients (one row per claude.ai install).
export const mcpOauthClients = pgTable("mcp_oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientSecretHash: text("client_secret_hash"), // null for public clients
  clientName: text("client_name").notNull(),
  redirectUris: text("redirect_uris").array().notNull(), // JSON-encoded list
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull(),
  scope: text("scope"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// Short-lived authorization codes.
export const mcpAuthCodes = pgTable("mcp_auth_codes", {
  code: text("code").primaryKey(),                       // opaque random
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull()
    .references(() => usersSync.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull(),
  scope: text("scope").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(), // now + 10m
  consumed: boolean("consumed").notNull().default(false),
});

// Access + refresh tokens (hashed at rest).
export const mcpAccessTokens = pgTable("mcp_access_tokens", {
  tokenHash: text("token_hash").primaryKey(),           // sha256(token)
  refreshTokenHash: text("refresh_token_hash").unique(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull()
    .references(() => usersSync.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),   // now + 1h
  refreshExpiresAt: bigint("refresh_expires_at", { mode: "number" }), // now + 30d
  revokedAt: bigint("revoked_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
```

Tokens are stored as SHA-256 hashes; the plaintext token is only ever in
the response body to claude.ai and in subsequent `Authorization` headers.

**Migration timestamp footgun** (per `CLAUDE.md`): today is before
2026-05-31, so the generated `_journal.json` entry's `when` may need a
hand-bump above `1780200000000` to actually apply. Confirm at generate time.

These tables do **not** participate in Dexie sync — they are server-only.
The `schema-parity` test ignores them automatically because there are no
matching Dexie interfaces.

### 2. Routes

```
src/app/api/mcp/
├── [transport]/
│   └── route.ts                              # main MCP endpoint (POST + GET-SSE)
├── .well-known/
│   ├── oauth-authorization-server/route.ts   # GET → AS metadata
│   └── oauth-protected-resource/route.ts     # GET → resource metadata
└── oauth/
    ├── register/route.ts                     # POST DCR
    ├── authorize/route.ts                    # GET (interactive)
    └── token/route.ts                        # POST (token exchange + refresh)
```

Next.js routes the well-known files via the `.well-known` segment. Note that
Next won't serve `.well-known` from the file system root by default — the
filename above puts it under `/api/mcp/.well-known/...`, which is what the
authorization-server-metadata URL in our protected-resource response will
point to.

#### `[transport]/route.ts` — MCP server

Uses `mcp-handler` (Vercel Labs adapter) for the JSON-RPC plumbing:

```ts
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { requireMcpAuth } from "@/lib/mcp/auth";
// ... read-only query helpers from src/lib/mcp/queries.ts

const handler = createMcpHandler(
  (server) => {
    server.tool("get_today_summary", "...", {}, async (_, ctx) => {
      const { userId } = await requireMcpAuth(ctx.request);
      return { content: [{ type: "text", text: JSON.stringify(await getTodaySummary(userId)) }] };
    });
    // ... other read-only tools
  },
  { serverInfo: { name: "intake-tracker", version: "1.0.0" } },
);

export { handler as GET, handler as POST };
```

`requireMcpAuth` parses the `Authorization: Bearer` header, hashes the
token, looks it up in `mcpAccessTokens`, verifies `expiresAt > now()` and
`revokedAt IS NULL`, and returns `{ userId, scope }`. On failure it throws
a 401 with `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"`
so claude.ai knows where to discover OAuth metadata.

#### `oauth/register/route.ts` — DCR

Accepts the [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591)
client metadata POST, generates `client_id` (random 24 bytes, base64url)
and — for confidential clients only — `client_secret`. Stores in
`mcpOauthClients`. Returns the standard DCR response. No prior
authentication required (this is how DCR is supposed to work for public
MCP servers).

Hardening: rate-limit by IP, cap stored clients per IP per day (e.g. 10),
and reject `redirect_uris` that don't match the known claude.ai pattern
(`https://claude.ai/api/organizations/*/mcp/callback`) — defense in depth
against a rogue actor harvesting auth codes.

#### `oauth/authorize/route.ts` — interactive

Validates query params (client_id exists, redirect_uri ∈ registered set,
response_type=code, PKCE present, scope ⊆ supported set). Then:

```ts
const session = await auth.getSession({ request });
if (!session?.user) {
  const callbackURL = `/api/mcp/oauth/authorize?${request.nextUrl.searchParams}`;
  return NextResponse.redirect(
    `${origin}/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(callbackURL)}`,
  );
}

if (!getAllowedEmails().includes(session.user.email.toLowerCase())) {
  return renderError("access_denied", "Email not on whitelist");
}

const code = randomBytes(24).toString("base64url");
await db.insert(mcpAuthCodes).values({
  code, clientId, userId: session.user.id, redirectUri,
  codeChallenge, codeChallengeMethod, scope,
  expiresAt: Date.now() + 10 * 60_000, consumed: false,
});

return NextResponse.redirect(
  `${redirectUri}?code=${code}&state=${encodeURIComponent(state)}`,
);
```

A minimal consent screen (one HTML render) is shown before the redirect so
the user sees "claude.ai is requesting read access to your intake-tracker
data" with an Approve / Deny button. Skip-with-cookie if the user already
approved this `client_id` in the last 30 days.

#### `oauth/token/route.ts`

Two grants:
- `authorization_code` — verify code is valid, unconsumed, not expired,
  client matches, redirect_uri matches, PKCE verifier hashes to the stored
  challenge. Mark consumed (atomic update with `WHERE consumed = false`
  guard against replay). Mint access + refresh tokens.
- `refresh_token` — verify refresh token hash, not revoked, not expired.
  Mint new access token; optionally rotate refresh token (recommended —
  on rotation, revoke the old one).

### 3. Read-only tools

All live in `src/lib/mcp/tools/` as plain async functions that take a
`userId` and return JSON-serialisable objects. The Postgres queries reuse
the existing patterns from `src/lib/analytics-service.ts` and
`src/app/api/sync/pull/route.ts` — same user-scoping, same indexes.

| Tool | Description | Backing query |
|------|-------------|---------------|
| `get_today_summary` | Water + salt totals, latest BP/weight, doses today | aggregate across 5 tables for current day-start-hour window |
| `query_intake_history` | water/salt by day or hour over [start, end] | `intakeRecords` |
| `query_weight_history` | weight points + 7-day avg over [start, end] | `weightRecords` |
| `query_blood_pressure_history` | systolic/diastolic/HR points + 7-day avg | `bloodPressureRecords` |
| `query_eating_history` | food log entries; `groupId` links to substances (query separately) | `eatingRecords` |
| `query_substance_history` | caffeine/alcohol records (mg, standard drinks, ABV%) over [start, end], filterable by type | `substanceRecords` |
| `list_medications` | active prescriptions + current phase + schedule | `prescriptions` + `medicationPhases` + `phaseSchedules` |
| `list_recent_doses` | last N dose log entries with prescription names | `doseLogs` |
| `get_inventory_status` | pill counts + days-of-supply per prescription | `inventoryItems` |

Each tool's Zod input schema enforces date-range sanity (`end >= start`,
range ≤ 1 year, etc.) so a malformed claude.ai call can't run an unbounded
scan.

### 4. Audit logging

Every successful `tools/call` writes a server-side audit row (a new
`mcpAuditLogs` table or extension of the existing `auditLogs` schema with
`source='mcp'`). Captured: `userId`, `clientId`, tool name, input args
(redacted of any PII fields), timestamp, success/error.

This is the user's only window into "what did Claude actually look at?",
so it should be queryable from a settings page in a follow-up PR.

### 5. Settings UI affordance (follow-up, not blocking)

A small section in `/settings` showing connected MCP clients (rows from
`mcpOauthClients`) with a "Revoke" button that nukes their tokens. Out of
scope for the first PR; OAuth revocation flow is enough to land first.

## Token lifetimes

| Token | TTL | Notes |
|-------|-----|-------|
| Auth code | 10 min | single-use, atomic consume |
| Access token | 1 hour | hash-stored, no rotation |
| Refresh token | 30 days | hash-stored, **rotated on every use** |

If the refresh token is stolen and used, the legitimate client's next
refresh fails — surfacing the compromise immediately. The user can then
revoke from settings.

## Scopes (single value for now)

- `intake-tracker:read` — read access to all user-scoped tables listed
  above.

Single scope keeps the consent screen simple. Future write tools would add
`intake-tracker:write` and the consent screen would surface both.

## Failure modes & edge cases

- **User signs in to Google with a non-whitelisted email.** Authorize
  endpoint shows `access_denied`. Don't leak whether the email is in
  Neon Auth at all — same error either way.
- **claude.ai retries DCR.** Each retry creates a new `client_id` row.
  Acceptable (small table, can be GC'd by a daily cron after 30 days of
  inactivity).
- **Refresh token rotation race** (two parallel calls from claude.ai).
  Use a single atomic UPDATE that returns the row only if `revokedAt IS
  NULL`; the loser sees null and returns `invalid_grant`.
- **Connector still installed in claude.ai after user is removed from
  `ALLOWED_EMAILS`.** Bearer auth check should also re-validate the
  whitelist on every request — not just at authorize time. Cheap query
  against `usersSync.email`.
- **Tool returns a huge dataset.** Every history query caps at 5000 rows
  and returns a `truncated: true` flag so the model knows to narrow the
  range.

## What "done" looks like

1. `pnpm typecheck && pnpm lint && pnpm test` — green.
2. `pnpm test:e2e` — green (existing E2E session-seeding still works;
   MCP routes are additive).
3. Manual: add `https://intake-tracker.vercel.app/api/mcp` as a custom
   connector in claude.ai → Google sign-in flow completes → claude.ai
   lists 9 tools → `get_today_summary` returns sensible JSON.
4. Manual: revoke connector in claude.ai → next request returns 401.
5. Audit log shows every tool invocation with redacted args.

## Phased delivery on the current branch

| Phase | Scope | Tests |
|-------|-------|-------|
| 1 | Drizzle migration + token validation helper + read-only tool functions + MCP endpoint with **hardcoded test token** | unit tests on each tool function against a seeded test DB |
| 2 | OAuth metadata endpoints + DCR + authorize (with Google sign-in bounce) + token grant | integration tests on the full code-exchange flow |
| 3 | Refresh-token rotation + revocation + audit logging | integration tests on rotation race + 401 after revoke |
| 4 | End-to-end manual test with real claude.ai | screenshots in the PR |

Each phase is independently mergeable. Phase 1 alone is useful for Claude
Code / Claude Desktop validation; phases 2–4 are what unlock claude.ai web.

## Open questions

- `mcp-handler` version pin: need to use ≥ the version that depends on
  `@modelcontextprotocol/sdk@>=1.26.0` to avoid the known CVE. Confirm
  latest on npm at implementation time.
- Whether to namespace the OAuth metadata under `/api/mcp/.well-known/`
  (default) or surface it at the root `/.well-known/...` for stricter
  RFC 8414 compliance. Both work with claude.ai; the namespaced version
  is simpler. Default to namespaced; revisit if discovery breaks.
- Whether to gate Phase 4 behind a feature flag in production until the
  audit-log UI lands. Recommend: yes, env-var-gated (`MCP_CONNECTOR_ENABLED`).
