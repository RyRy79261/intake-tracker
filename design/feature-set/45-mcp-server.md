# 45 — In-app MCP Server (Claude.ai Custom Connector)

**Files covered:**
- `src/lib/mcp/tools.ts` — read-only MCP tool registry (7 tools)
- `src/lib/mcp/queries.ts` — Drizzle read queries backing the tools
- `src/lib/mcp/scopes.ts` — OAuth scope set + parsing
- `src/lib/mcp/oauth.ts` — OAuth 2.1 + DCR + PKCE primitives (client/code/token lifecycle)
- `src/lib/mcp/tokens.ts` — opaque-token generation, SHA-256 hashing, PKCE S256, prefixes, TTLs
- `src/lib/mcp/audit.ts` — fire-and-forget audit logging of tool invocations
- `src/lib/mcp/cors.ts` — CORS header set for all MCP endpoints
- `src/lib/mcp/origin.ts` — public-origin resolution + OAuth URL builder
- `src/lib/mcp/whitelist.ts` — `ALLOWED_EMAILS` gate
- `src/app/api/mcp/[transport]/route.ts` — Streamable-HTTP MCP JSON-RPC endpoint (GET/POST/DELETE/OPTIONS) with bearer auth + whitelist re-check
- `src/app/api/mcp/oauth/authorize/route.ts` — interactive authorize endpoint + consent screen (GET/POST)
- `src/app/api/mcp/oauth/token/route.ts` — RFC 6749 token endpoint
- `src/app/api/mcp/oauth/register/route.ts` — RFC 7591 Dynamic Client Registration
- `src/app/api/mcp/well-known/oauth-authorization-server/route.ts` — RFC 8414 metadata
- `src/app/api/mcp/well-known/oauth-protected-resource/route.ts` — RFC 9728 metadata
- `src/db/schema.ts` (lines ~965–1071) — 4 server-only MCP tables
- `src/middleware.ts` — routes Neon Auth verifier-exchange for `/auth` return trip
- `src/app/auth/sign-in-form.tsx` — consumes `callbackURL` to return user to authorize endpoint
- `next.config.*` — rewrites `/.well-known/*` → `/api/mcp/well-known/*`; CSP `form-action 'self'`

**Purpose:** A self-hosted OAuth-2.1 authorization server + Model Context Protocol (MCP) server baked into the PWA. It lets claude.ai's "Custom Connectors" feature read (never write) the single user's health data through 7 read-only tools, after the user signs in via the existing Neon Auth (Google/email) flow and approves a consent screen. The only user-facing surfaces are an HTML **consent screen** and an HTML **authorization-error / redirect page**; everything else is machine-to-machine JSON.

---

## Features

### MCP server (the connector itself)
- Exposes a **Streamable HTTP** MCP transport at `/api/mcp/mcp` (SSE transport `/api/mcp/sse` is **disabled**, `disableSse: true`).
- Server identity advertised as `serverInfo: { name: "intake-tracker", version: "1.0.0" }`.
- Registers **7 read-only tools** (no write/update/delete tools exist — the model cannot mutate state even if it tries).
- Every tool: validates input with Zod, extracts `userId` from the verified bearer token, runs a user-scoped Drizzle query, writes a fire-and-forget audit row, and returns an MCP `content: [{ type: "text", text: <JSON> }]` response.
- Hard `maxDuration = 60` seconds per request.

### The 7 tools
1. **`get_today_summary`** (title "Today's summary", no input) — totals for water/salt/sugar/potassium since the user's day-start hour, latest blood-pressure reading, latest weight, and counts of doses logged today grouped by status.
2. **`query_intake_history`** (title "Intake history") — individual intake records in a time range, filterable by `type` or `'all'`. Returns `id, type, amount, timestamp, source, note`.
3. **`query_weight_history`** (title "Weight history") — weight readings (kg) in range, oldest first, capped at 5000. Returns `id, weight, timestamp, note`.
4. **`query_blood_pressure_history`** (title "Blood pressure history") — BP readings in range, oldest first, capped 5000. Returns `id, systolic, diastolic, heartRate, irregularHeartbeat, position, arm, timestamp, note`.
5. **`query_eating_history`** (title "Eating history") — food-log entries in range with linked caffeine/alcohol substances (joined by `groupId`), capped 5000. Returns food rows `{id, grams, note, originalInputText, timestamp, groupId}` plus a `substances[]` array.
6. **`list_medications`** (title "List active medications") — all active prescriptions with their currently-active phase and enabled schedules.
7. **`list_recent_doses`** (title "Recent doses") — most recent dose logs (taken/skipped/rescheduled/pending) joined with prescription generic names, `limit` 1–500 (default 50).
8. **`get_inventory_status`** (title "Inventory status") — per-prescription pill stock + refill thresholds for active inventory items.

### OAuth 2.1 authorization server (self-hosted)
- **Dynamic Client Registration** (RFC 7591) at `POST /api/mcp/oauth/register` — no prior auth; returns `client_id` (+ `client_secret` if confidential).
- **Authorize endpoint** (`GET`/`POST /api/mcp/oauth/authorize`) — validates params, enforces session + whitelist, renders consent screen, mints authorization code, redirects back to client.
- **Token endpoint** (`POST /api/mcp/oauth/token`) — `authorization_code` (PKCE) + `refresh_token` grants.
- **PKCE S256 only** — `code_challenge_method` locked to `S256` everywhere (Zod literal, DB issuance, advertised metadata).
- **Discovery metadata** at `/.well-known/oauth-authorization-server` (RFC 8414) and `/.well-known/oauth-protected-resource` (RFC 9728), rewritten in `next.config` from the app-root well-known paths.
- Identity is **delegated to Neon Auth** (Google + email/password); the OAuth server only mints/validates tokens scoped to a verified `userId`.

### Security / hardening features
- **Read-only by design** — no mutating tools registered.
- **User-scoped queries** — every WHERE clause includes `eq(table.userId, userId)`; cross-user reads impossible.
- **Tombstone filtering** — every query filters `deletedAt IS NULL`; soft-deleted rows never reach the model.
- **Row cap (5000)** on every range scan; returns a `truncated` flag so the model knows to narrow the window.
- **Generic error replies** — internal errors return `"An internal error occurred while processing your request."` with `isError: true`; the real message goes only to the audit log (no SQL shapes / stack frames / field names leaked).
- **Whitelist enforced on every request** (`ALLOWED_EMAILS`) — removing a user revokes access immediately, without waiting for token expiry. Whitelist denial returns an explicit **403** (vs. 401 for missing/invalid bearer).
- **Opaque, hashed tokens** — only SHA-256 hashes persisted; plaintext lives only in HTTP responses/headers.
- **Constant-time comparison** (`timingSafeEqual`) for client-secret and PKCE checks.
- **Redirect-URI allowlist** for DCR — only claude.ai / *.claude.ai / anthropic.com / *.anthropic.com over HTTPS, or loopback (localhost/127.0.0.1/[::1]) over http/https for dev.
- **PII redaction in audit** — free-form fields (notes, food descriptions) are never logged; only safe primitives via `argsForAudit`.
- **Per-request bearer memoization** (WeakMap) — whitelist pre-flight and `verifyToken` share one DB lookup.

---

## User actions & interactions

The only human-facing surfaces are inside the OAuth authorize flow. Everything else is claude.ai (machine) calling endpoints.

### Authorize / consent flow (browser)
- **Open connector in claude.ai** → claude.ai redirects the browser to `GET /api/mcp/oauth/authorize?...`.
- **If not signed in:** user is redirected to `/auth?callbackURL=<the authorize URL>` — the app's normal sign-in UI (email/password + "Continue with Google"). On success the user is hard-navigated (`window.location.replace`) back to the authorize URL.
- **Consent screen** is rendered (HTML). User can:
  - **Approve** (green button, `action=approve`) → mints an auth code and HTML-redirects to the client `redirect_uri` with `?code=&state=`.
  - **Deny** (red button, `action=deny`) → redirects to `redirect_uri` with `?error=access_denied&error_description=User+declined+consent&state=`.
- **Sign in with Google** (on the bounce `/auth` page) → returns through Neon Auth's hosted callback; middleware exchanges the `neon_auth_session_verifier` for a session cookie, then user lands back on the authorize URL.
- The consent form carries all original query params as **hidden inputs** and re-POSTs to the same authorize URL with `action`.

### Machine interactions (claude.ai → endpoints)
- **Register a client** (`POST /oauth/register`).
- **Exchange auth code for tokens** (`POST /oauth/token`, `authorization_code` grant + `code_verifier`).
- **Refresh access token** (`POST /oauth/token`, `refresh_token` grant).
- **Call a tool** (`POST /api/mcp/mcp` JSON-RPC with `Authorization: Bearer <token>`).
- **Terminate session** (`DELETE /api/mcp/mcp` — part of Streamable HTTP spec).
- **Preflight** (`OPTIONS` on every endpoint → 204 with CORS headers).
- **Discover metadata** (`GET /.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`).

---

## States & presentations

Two HTML pages and several machine-readable response states.

### Consent screen (success path)
- Dark theme (hard-coded inline CSS: bg `#0f172a`, card `#1e293b`, text `#e2e8f0`).
- Card titled **"Connect to intake-tracker"**.
- Body: "**<client_name>** is requesting read-only access to your intake-tracker data:" followed by a bulleted scope summary:
  - "Today's intake totals and latest BP/weight"
  - "Intake, weight, blood-pressure, and food history"
  - "Active medications and recent dose logs"
  - "Inventory status"
- Meta line: "Signed in as <email or userId>. Scope: <scope>."
- Two buttons: **Approve** (green `#22c55e`) and **Deny** (red `#ef4444`).

### Authorization-error page
- Same dark theme; heading "Authorization failed" in red `#fca5a5`; the error message inside a `<pre>` block (HTML-escaped). Status 400 (or supplied status). Triggered by: invalid query params, unknown `client_id`, unregistered `redirect_uri`.

### "Redirecting…" page (cross-origin redirect)
- Plain HTML with `<meta http-equiv="refresh">`, a JS `window.location.replace`, and an anchor fallback ("Continue if not redirected"). Used **instead of a 302** because the global CSP `form-action 'self'` would silently block a server 302 to claude.ai after the consent POST. Status 200.

### Not-signed-in state
- 302 redirect to `/auth?callbackURL=...` (no consent screen shown yet).

### Whitelisted-out / access-denied states
- Authorize endpoint: email not on allow-list → redirect to client with `error=access_denied&error_description=Email+not+on+allow-list`.
- Session expired at POST → `error=access_denied&error_description=Session+expired+or+email+not+on+allow-list`.
- MCP endpoint: valid bearer but email no longer allowed → JSON **403** `{ error: "forbidden", error_description: "Your account is no longer on the access list for this connector." }`.

### MCP endpoint auth states
- **No / invalid bearer** → **401** with `WWW-Authenticate: Bearer resource_metadata=...` header (lets claude.ai re-discover OAuth metadata and prompt reconnect).
- **Valid bearer, allowed** → tool executes.
- **Tool success** → MCP `content[].text` JSON.
- **Tool error** → generic text + `isError: true`.

### Token endpoint states
- `invalid_request` (400) — unparseable body / Zod failure.
- `invalid_client` (401) — client auth failed.
- `invalid_grant` (400) — bad/expired/consumed code, PKCE mismatch, bad/revoked/expired refresh token, client/redirect mismatch.
- `unsupported_grant_type` (400) — grant other than the two supported.
- Success → `{ access_token, token_type: "Bearer", expires_in, refresh_token, scope }`. Always `Cache-Control: no-store`, `Pragma: no-cache`.

### DCR (register) states
- `invalid_client_metadata` (400) — non-JSON body or Zod failure.
- `invalid_redirect_uri` (400) — URI not on allowlist.
- `server_error` (500) — unexpected.
- Success → **201** with the registered client document.

### Offline / sync
- This is a server-side feature backed by **Neon Postgres** (not Dexie). The 4 MCP tables are server-only and do **not** participate in Dexie offline sync. If the device is offline, the connector simply cannot be reached; there is no client-side offline state for it. The user's underlying health data is mirrored server-side by the sync engine, which is what the tools read.

### CORS / preflight
- All MCP endpoints answer `OPTIONS` with 204 and wildcard-origin CORS headers (tokens travel via `Authorization` header, not cookies, so `*` is safe).

---

## Enums, options & configurable values

### Tool inputs
- `query_intake_history.type` enum: **`water` | `salt` | `sugar` | `potassium` | `all`**.
- `list_recent_doses.limit`: int **1–500**, default **50**.
- Date-range inputs (`start_ms`, `end_ms`): non-negative integers, unix **milliseconds**.

### Scopes
- `SUPPORTED_SCOPES = ["intake-tracker:read"]` (single scope today).
- `DEFAULT_SCOPE = "intake-tracker:read"`.
- (Doc note in code: a future write scope would be `intake-tracker:write`, surfaced separately on consent.)

### OAuth grant / response / auth-method sets
- `grant_types_supported`: `["authorization_code", "refresh_token"]`.
- `response_types_supported`: `["code"]`.
- `token_endpoint_auth_methods_supported`: `["none", "client_secret_basic", "client_secret_post"]`.
- `code_challenge_methods_supported`: `["S256"]`.
- `bearer_methods_supported`: `["header"]`.
- DCR `token_endpoint_auth_method` enum: `none` (default) | `client_secret_basic` | `client_secret_post`.

### Token prefixes (`TOKEN_PREFIX`)
- Access: `mcp_at`, Refresh: `mcp_rt`, Auth code: `mcp_ac`, Client ID: `mcp_client`, Client secret: `mcp_secret`. Format: `<prefix>_<base64url(randomBytes)>`.

### Token TTLs (`TOKEN_TTL`)
- Auth code: **10 minutes** (`10 * 60_000`).
- Access token: **24 hours** (`24 * 60 * 60_000`).
- Refresh token: **30 days** (`30 * 24 * 60 * 60_000`).
- Token-byte sizes: auth code 24, access/refresh/secret 32, client_id 16.

### Limits / thresholds
- `MAX_ROWS = 5000` (range-query cap; query fetches `MAX_ROWS + 1` to detect truncation).
- `ONE_YEAR_MS` — max range span for history tools (`end - start <= 1 year`).
- `DEFAULT_DAY_START_HOUR = 2` (used if user has no `pushSettings.dayStartHour`).
- DCR limits: `client_name` 1–200 chars (default `"claude.ai"`), `redirect_uris` 1–10 entries, all must be valid URLs.
- Authorize PKCE `code_challenge` length 43–128; `state` length 1–512.
- Token endpoint `code_verifier` length 43–128.
- `maxDuration = 60` s per MCP request.

### Allowed redirect-URI hosts (DCR + authorize)
- Public: HTTPS only, host ∈ {`claude.ai`, `*.claude.ai`, `anthropic.com`, `*.anthropic.com`}.
- Loopback: `localhost`, `127.0.0.1`, `[::1]` over http or https (dev only).

### Origin-resolution priority (`getPublicOrigin`)
1. `MCP_PUBLIC_URL` env override → 2. `x-forwarded-host`+`x-forwarded-proto` → 3. `host` header → 4. `VERCEL_URL` → 5. `http://localhost:3000`.

### CORS header constants
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, mcp-protocol-version, mcp-session-id`
- `Access-Control-Expose-Headers: WWW-Authenticate`
- `Access-Control-Max-Age: 86400`

### Audit status enum
- `status ∈ {"success", "error"}` (DB CHECK constraint).

### DB CHECK enums
- `mcp_oauth_clients.token_endpoint_auth_method IN ('none','client_secret_basic','client_secret_post')`.
- `mcp_auth_codes.code_challenge_method IN ('S256','plain')` (issuance is S256-only; 'plain' kept only for backward DB compat).

### Service-documentation URLs (in metadata)
- `service_documentation` / `resource_documentation`: `https://github.com/RyRy79261/intake-tracker/blob/main/docs/mcp-connector.md`.

---

## Data model touched

### Server-only MCP tables (`src/db/schema.ts`, Neon Postgres, NOT in Dexie sync)
- **`mcp_oauth_clients`** — `client_id` (PK), `client_secret_hash`, `client_name`, `redirect_uris[]`, `token_endpoint_auth_method`, `scope`, `created_at`, `last_used_at`.
- **`mcp_auth_codes`** — `code` (PK), `client_id` (FK→clients, cascade), `user_id` (FK→users_sync, cascade), `redirect_uri`, `code_challenge`, `code_challenge_method`, `scope`, `expires_at`, `consumed_at`, `created_at`. Indexed on client + expires.
- **`mcp_access_tokens`** — `token_hash` (PK), `refresh_token_hash` (unique), `client_id` (FK), `user_id` (FK), `scope`, `expires_at`, `refresh_expires_at`, `revoked_at`, `created_at`, `last_used_at`. Indexed on user + expires.
- **`mcp_audit_log`** — `id` (serial PK), `timestamp` (tz, default now), `user_id` (FK), `client_id`, `tool`, `args_json`, `status`, `error_message`, `duration_ms`. Indexed on (user, timestamp).
- **`neon_auth.users_sync`** (`usersSync`) — read for whitelist email lookup; upserted (`ensureUserInSync`) so it can serve as the FK target for auth codes/tokens.
- **`push_settings.dayStartHour`** — read to compute "today" boundary for `get_today_summary`.

### Domain tables read by tool queries (server mirror of Dexie tables)
- `intakeRecords` (`type, amount, timestamp, source, note`)
- `weightRecords` (`weight, timestamp, note`)
- `bloodPressureRecords` (`systolic, diastolic, heartRate, irregularHeartbeat, position, arm, timestamp, note`)
- `eatingRecords` (`grams, note, originalInputText, timestamp, groupId`)
- `substanceRecords` (`groupId, type, amountMg, amountStandardDrinks, abvPercent, volumeMl, description, timestamp`)
- `prescriptions` (`genericName, indication, notes, isActive`)
- `medicationPhases` (`type, unit, startDate, endDate, foodInstruction, status`)
- `phaseSchedules` (`time, dosage, unit, daysOfWeek, enabled`)
- `inventoryItems` (`brandName, currentStock, strength, unit, refillAlertPills, refillAlertDays, isActive`)
- `doseLogs` (`prescriptionId, scheduledDate, scheduledTime, status, actionTimestamp, skipReason, note`)

All reads are **SELECT-only**; the only writes the feature performs are to its own 4 OAuth/audit tables and the `users_sync` upsert.

---

## Validation, edge cases & business rules

- **Range validation:** `end_ms >= start_ms` (else "end_ms must be >= start_ms") and span `<= 1 year` (else "Range must be <= 1 year").
- **Day boundary:** "today" = most recent occurrence of `dayStartHour` (default 2). If the computed timestamp is in the future, subtract 24h (`todayStartTimestamp`). This matches the app's day-start-hour semantics.
- **Truncation:** queries fetch `MAX_ROWS + 1`; if over 5000, slice to 5000 and return `truncated: true`.
- **Auth-code consumption is atomic & single-use:** the row is marked `consumed_at` only if code present, unconsumed, correct client, correct `redirect_uri`, and not expired — so a wrong-client/expired attempt does **not** burn the code (legit client can retry). **PKCE is checked AFTER consume**: a PKCE mismatch burns the code (an attacker likely intercepted it, so no retry path).
- **Refresh tokens are NOT rotated** (deliberate): the same refresh token stays valid for the full 30-day window; only the access token is re-minted in place. Rationale in code: strict single-use rotation locked out the single legitimate client on parallel/lost refreshes. Residual race: concurrent refresh → last-writer-wins on `token_hash`; the "loser" gets a 401 on its next call and self-heals by refreshing again. Never locks the user out.
- **Access-token lookup:** rejects revoked or expired tokens; best-effort `last_used_at` touch (failures ignored).
- **`purgeExpired()`** helper deletes expired auth codes and tokens whose **refresh** has expired (not by access-token `expiresAt`, since the row still carries a usable refresh token). Not wired to a cron yet.
- **Whitelist:** empty `ALLOWED_EMAILS` ⇒ everyone allowed; otherwise case-insensitive membership; missing email ⇒ denied. Re-checked on every MCP request (403 if newly removed).
- **Origin correctness:** request forwarded-headers WIN over `VERCEL_URL` — the deployment-hash URL is gated by Vercel SSO and would 403 the OAuth redirect; the custom domain (forwarded host) is the correct issuer.
- **CSP workaround:** consent POST cannot 302 cross-origin (`form-action 'self'` blocks redirect targets per CSP3); the route returns an HTML page with meta-refresh + JS replace + anchor fallback instead.
- **Sign-in callbackURL safety:** `safeCallbackUrl` only accepts same-origin relative paths (must start with `/`, reject `//` protocol-relative and absolute URLs) — prevents open-redirect.
- **DELETE in CORS preflight:** explicitly allowed because the Streamable HTTP spec uses DELETE for session termination; omitting it would make browsers block it.
- **Defence-in-depth joins:** `list_recent_doses` and `get_inventory_status` scope the prescription join by `user_id` + `deletedAt IS NULL` even though FKs already prevent cross-user references.
- **Error opacity:** MCP clients never see internal exception text; only the audit log captures it.
- **PKCE S256 only:** authorize Zod is `z.literal("S256")`; metadata advertises only S256; the `plain` branch in `consumeAuthCode` is dead for new codes (kept for legacy DB rows).
- **Substance attachment:** eating history collects distinct non-null `groupId`s from the capped food rows, then fetches matching (non-deleted, user-scoped) substance rows in one `inArray` query.

---

## Sub-components / variants

- **`tools.ts`** — registers the 7 read-only tools; `runTool` wrapper (auth extract + audit + error envelope); `validateRange`; `getAuth` (pulls `userId`/`clientId` from `authInfo.extra`).
- **`queries.ts`** — `getTodaySummary`, `queryIntakeHistory`, `queryWeightHistory`, `queryBloodPressureHistory`, `queryEatingHistory`, `listMedications`, `listRecentDoses`, `getInventoryStatus`; helpers `getDayStartHour`, `todayStartTimestamp`, `capRows`.
- **`scopes.ts`** — `SUPPORTED_SCOPES`, `DEFAULT_SCOPE`, `parseScopeString`, `serialiseScopes`, `hasScope`.
- **`oauth.ts`** — `isAllowedRedirectUri`, `registerClient`, `getClient`, `verifyClientCredentials`, `issueAuthCode`, `consumeAuthCode`, `issueAccessToken`, `rotateRefreshToken`, `lookupAccessToken`, `purgeExpired`.
- **`tokens.ts`** — `generateOpaqueToken`, `hashToken`, `hashesEqual`, `verifyPkceS256`, `TOKEN_PREFIX`, `TOKEN_TTL`.
- **`audit.ts`** — `writeMcpAudit` (fire-and-forget, swallows errors).
- **`cors.ts`** — `MCP_CORS_HEADERS`, `withCors`, `corsPreflight`.
- **`origin.ts`** — `getPublicOrigin`, `buildOAuthUrls`, `MCP_BASE_PATH`.
- **`whitelist.ts`** — `getAllowedEmails`, `isEmailAllowed`.
- **`[transport]/route.ts`** — `createMcpHandler` + `withMcpAuth`; `resolveBearer` (WeakMap memo), `verifyToken`, `checkWhitelist`, `handle` (GET/POST/DELETE), `OPTIONS`.
- **`oauth/authorize/route.ts`** — `GET`/`POST`; `renderError`, `escapeHtml`, `htmlRedirect`, `redirectClientWithError`, `getSignedInUser`, `validateRequest`, `ensureUserInSync`; renders consent + error + redirect HTML.
- **`oauth/token/route.ts`** — `POST`/`OPTIONS`; `readBody` (JSON or form), `readClientCredsFromHeader` (Basic), `err`, `applyNoStore`; handles both grants.
- **`oauth/register/route.ts`** — `POST`/`OPTIONS`; DCR with redirect-URI allowlist enforcement.
- **`well-known/oauth-authorization-server/route.ts`** — RFC 8414 metadata `GET`/`OPTIONS`.
- **`well-known/oauth-protected-resource/route.ts`** — RFC 9728 metadata `GET`/`OPTIONS`.
- **`middleware.ts`** — routes `/auth` + `/auth/*` through Neon Auth's verifier-exchange so the post-Google return trip sets the session cookie; preserves capacitor CORS for `/api/*`.
- **`auth/sign-in-form.tsx`** — reads `callbackURL`, enforces same-origin, hard-navigates back to the authorize URL after sign-in.
