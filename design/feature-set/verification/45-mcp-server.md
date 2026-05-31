# Verification — 45-mcp-server

**Verdict:** minor-gaps · checked ~120 claims, verified ~117.

The document is an unusually faithful, code-accurate description of the in-app
MCP server / OAuth-2.1 authorization server. Nearly every enum, default,
threshold, TTL, byte-size, label, error string, CORS header, and DB column was
confirmed digit-for-digit against the source. The one real defect is a
recurring **tool-count error**: the prose says "7 tools" but the code registers
and the doc itself describes **8** tools. A handful of low-severity
imprecisions round out the list.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "read-only MCP tool registry (**7 tools**)" / "Registers **7 read-only tools**" / "Exposes a Streamable HTTP… 7 tools" / section header "### The 7 tools" | The registry registers **8** tools (`get_today_summary`, `query_intake_history`, `query_weight_history`, `query_blood_pressure_history`, `query_eating_history`, `list_medications`, `list_recent_doses`, `get_inventory_status`). The doc's own numbered list runs 1–8, contradicting its own "7" count. | `src/lib/mcp/tools.ts:122-268` (8 `server.registerTool` calls); doc lines 4, 31, 33, 37 |
| low | "**Preflight** (`OPTIONS` on **every endpoint** → 204 with CORS headers)." | True for `[transport]`, token, register, and both well-known routes. The **authorize** route exports only `GET`/`POST` — it has no `OPTIONS` handler (it is browser-navigated, not a cross-origin fetch target). "Every endpoint" overstates by one. | `src/app/api/mcp/oauth/authorize/route.ts:186,263` (only GET/POST) |
| low | Token endpoint docstring summarized as `refresh_token` grant — the doc correctly says refresh tokens are **NOT** rotated (line 246). | Doc is correct; flagged only because the *source* docstring (`token/route.ts:6` "rotates the refresh token on every use" and `oauth.ts` function name `rotateRefreshToken`) is itself misleading — the implementation deliberately keeps the same refresh token. No doc inaccuracy, noted for design fidelity. | `src/lib/mcp/oauth.ts:268-345`; `src/app/api/mcp/oauth/token/route.ts:6` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `query_intake_history` is the only history tool whose audit args are explicitly redacted to `{type, start_ms, end_ms}`; the weight/BP/eating tools pass their full `args` as audit args (harmless — those args contain only the date range). The doc's general PII-redaction claim (line 65) is accurate but doesn't note this per-tool asymmetry. | `src/lib/mcp/tools.ts:155` vs `175,193,211` |
| low | `getInventoryStatus` / `listRecentDoses` use a `leftJoin` (not inner join) on `prescriptions`; a dose/inventory row whose prescription is soft-deleted or mismatched still returns with `genericName: null` rather than being dropped. The doc describes the user-scoped join predicate (line 254) but not the left-join null-fill behavior. | `src/lib/mcp/queries.ts:412-419, 441-448` |
| low | `mcp_oauth_clients.last_used_at` column exists but is never written by any code path (`registerClient` doesn't set it; nothing updates it). Doc lists the column (line 217) without noting it is currently inert. | `src/db/schema.ts:985`; `src/lib/mcp/oauth.ts:88-97` |
| low | `getTodaySummary` returns a fixed object shape `{day_started_at, now, intake:{water_ml, salt_mg, sugar_g, potassium_mg}, latest_blood_pressure, latest_weight, doses[]}`; the unit-suffixed intake keys (`water_ml`, `salt_mg`, `sugar_g`, `potassium_mg`) are not enumerated in the doc. | `src/lib/mcp/queries.ts:132-153` |
| low | `lookupAccessToken` performs a best-effort `last_used_at` touch on `mcp_access_tokens` on every successful bearer lookup (doc mentions the touch at line 247 but not that it runs on the read path, fire-and-forget). | `src/lib/mcp/oauth.ts:368-372` |

## Spot-confirmed

A representative sample of key claims confirmed against code:

- **8 tool titles / descriptions** match doc items 1–8 verbatim. `src/lib/mcp/tools.ts:122-268`.
- `serverInfo: { name: "intake-tracker", version: "1.0.0" }`, `disableSse: true`, `basePath: "/api/mcp"`, `maxDuration = 60`. `src/app/api/mcp/[transport]/route.ts:30,37,40-41`.
- `query_intake_history.type` enum `["water","salt","sugar","potassium","all"]`. `src/lib/mcp/tools.ts:145`.
- `list_recent_doses.limit` int 1–500 default 50; query clamps `Math.min(Math.max(limit,1),500)`. `src/lib/mcp/tools.ts:241-247`; `src/lib/mcp/queries.ts:394`.
- `MAX_ROWS = 5000`, fetches `MAX_ROWS + 1`, `capRows` slices to 5000 + `truncated:true`. `src/lib/mcp/queries.ts:30,188,461-466`.
- `ONE_YEAR_MS = 365*24*60*60_000`; range errors "end_ms must be >= start_ms" / "Range must be <= 1 year". `src/lib/mcp/tools.ts:29,44-51`.
- `DEFAULT_DAY_START_HOUR = 2`; `push_settings.day_start_hour` default 2; future-timestamp subtract-24h logic. `src/lib/mcp/queries.ts:31,51-56`; `src/db/schema.ts:856`.
- `SUPPORTED_SCOPES = ["intake-tracker:read"]`, `DEFAULT_SCOPE = "intake-tracker:read"`, future-write comment. `src/lib/mcp/scopes.ts:5-10`.
- TTLs: auth code `10*60_000`, access `24*60*60_000`, refresh `30*24*60*60_000`. `src/lib/mcp/tokens.ts:52-56`.
- Token byte-sizes: auth code 24, access 32, refresh 32, secret 32, client_id 16. `src/lib/mcp/oauth.ts:82-85,158,248-249,302`.
- `TOKEN_PREFIX`: `mcp_at` / `mcp_rt` / `mcp_ac` / `mcp_client` / `mcp_secret`; format `<prefix>_<base64url(randomBytes)>`. `src/lib/mcp/tokens.ts:11-13,43-49`.
- Redirect-URI allowlist: https-only public hosts claude.ai/*.claude.ai/anthropic.com/*.anthropic.com, loopback localhost/127.0.0.1/[::1] http|https. `src/lib/mcp/oauth.ts:47-71`.
- `getPublicOrigin` priority MCP_PUBLIC_URL → fwd-host/proto → host → VERCEL_URL → localhost:3000. `src/lib/mcp/origin.ts:32-67`.
- CORS constants (origin `*`, methods `GET, POST, DELETE, OPTIONS`, headers `Content-Type, Authorization, mcp-protocol-version, mcp-session-id`, expose `WWW-Authenticate`, max-age 86400). `src/lib/mcp/cors.ts:11-26`.
- OAuth metadata sets: `response_types_supported ["code"]`, `grant_types_supported ["authorization_code","refresh_token"]`, `token_endpoint_auth_methods_supported ["none","client_secret_basic","client_secret_post"]`, `code_challenge_methods_supported ["S256"]`, `bearer_methods_supported ["header"]`. `well-known/oauth-authorization-server/route.ts:29-36`; `oauth-protected-resource/route.ts:24-31`.
- `service_documentation`/`resource_documentation` GitHub URL. `well-known/*:40-41,29-30`.
- DCR schema: `client_name` 1–200 default "claude.ai", `redirect_uris` 1–10, auth method enum default `none`; success 201; `invalid_client_metadata`/`invalid_redirect_uri`/`server_error`. `src/app/api/mcp/oauth/register/route.ts:16-25,36-105`.
- Authorize Zod: `response_type` literal "code", `code_challenge` 43–128, `code_challenge_method` `z.literal("S256")`, `state` 1–512. `src/app/api/mcp/oauth/authorize/route.ts:40-48`.
- Token Zod: `code_verifier` 43–128; grant literals; `invalid_request`/`invalid_client (401)`/`invalid_grant`/`unsupported_grant_type`; `no-store`+`Pragma: no-cache` on every response. `src/app/api/mcp/oauth/token/route.ts:24-65,200`.
- Atomic single-use code consume with PKCE-after-consume semantics. `src/lib/mcp/oauth.ts:181-231`.
- 403 whitelist denial JSON `{error:"forbidden", error_description:"Your account is no longer on the access list for this connector."}` vs 401 for bad bearer; WeakMap bearer memo. `src/app/api/mcp/[transport]/route.ts:53-137`.
- Consent screen labels: card "Connect to intake-tracker", 4 scope bullets verbatim, "Signed in as … Scope: …", green `#22c55e` Approve / red `#ef4444` Deny; dark theme `#0f172a`/`#1e293b`/`#e2e8f0`. `src/app/api/mcp/oauth/authorize/route.ts:219-255`.
- Error page heading red `#fca5a5`, `<pre>` escaped message, status 400. `authorize/route.ts:50-66`.
- `htmlRedirect` 200 HTML page (meta-refresh + `window.location.replace` + anchor) instead of 302 because of CSP `form-action 'self'`. `authorize/route.ts:78-110`; `next.config.mjs:28`.
- Not-signed-in → 302 `/auth?callbackURL=…`. `authorize/route.ts:199-203`.
- access_denied descriptions: "Email not on allow-list", "Session expired or email not on allow-list", "User declined consent". `authorize/route.ts:206-297`.
- `safeCallbackUrl` rejects non-`/`, `//`, absolute; `window.location.replace` hard nav. `src/app/auth/sign-in-form.tsx:18-23,46`.
- Middleware routes `/auth` + `/auth/*` for verifier exchange; matcher `["/api/:path*","/auth","/auth/:path*"]`. `src/middleware.ts:55-57,84`.
- `next.config.mjs` rewrites `/.well-known/oauth-*` → `/api/mcp/well-known/*`; CSP `form-action 'self'`. `next.config.mjs:53-62,28`.
- 4 MCP tables + columns/indexes/CHECK constraints; `mcp_auth_codes.code_challenge_method IN ('S256','plain')`, `mcp_audit_log.status IN ('success','error')`, `mcp_oauth_clients.token_endpoint_auth_method IN (...)`. `src/db/schema.ts:975-1071`.
- Domain-table field lists (intake/weight/BP/eating/substance/prescription/phase/schedule/inventory/dose) all match the selected columns. `src/db/schema.ts:64-857`; `src/lib/mcp/queries.ts:*`.
- `purgeExpired` deletes auth codes by `expiresAt` and tokens by `refreshExpiresAt` (not access `expiresAt`); not cron-wired. `src/lib/mcp/oauth.ts:388-394`.
- `ensureUserInSync` upsert with `COALESCE` email preserve. `authorize/route.ts:176-184`.

## Low-confidence / could-not-verify

- **401 `WWW-Authenticate: Bearer resource_metadata=...` header format** (doc line 124): the value is produced inside the `mcp-handler` / `@modelcontextprotocol/sdk` library via `withMcpAuth(..., { resourceMetadataPath })`, not in repo code. The configuration (`resourceMetadataPath: "/.well-known/oauth-protected-resource"`, `required: true`) is confirmed at `src/app/api/mcp/[transport]/route.ts:97-100`; the exact emitted header string is library-internal and not directly inspected here.
- **DELETE session-termination semantics** (doc lines 88, 253): the route exports `DELETE = handle` and CORS allows DELETE, but the actual Streamable-HTTP session-termination behavior is implemented inside `mcp-handler`; confirmed only at the routing/CORS layer (`[transport]/route.ts:155`; `cors.ts:17`).
