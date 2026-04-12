---
phase: 41-neon-auth-privy-removal
plan: 01
subsystem: auth
tags: [neon-auth, better-auth, middleware, withAuth, cookies, nextjs]

requires:
  - phase: 36-neon-branch-architecture
    provides: Neon branch + preview env pattern referenced by D-15
provides:
  - "@neondatabase/auth@0.2.0-beta.1 installed and wired into server helper"
  - "src/lib/neon-auth.ts singleton exporting `auth` with handler/middleware/getSession"
  - "Catch-all /api/auth/[...path]/route.ts proxying every Neon Auth endpoint"
  - "Root middleware.ts redirecting unauthenticated page requests to /auth"
  - "Rewritten withAuth() HOF authenticating via Neon Auth cookie sessions"
  - "VerificationResult contract preserved so the 9 existing API routes compile unchanged"
affects: [41-02, 41-03, 41-04, 41-05, 41-06, 42]

tech-stack:
  added:
    - "@neondatabase/auth 0.2.0-beta.1"
  patterns:
    - "Cookie-session auth read via next/headers in withAuth HOF"
    - "Catch-all app-router route for third-party auth handlers"
    - "Module-level env var fallbacks so auth helpers are import-safe in tests"

key-files:
  created:
    - src/lib/neon-auth.ts
    - "src/app/api/auth/[...path]/route.ts"
    - middleware.ts
    - src/__tests__/neon-auth-handler.test.ts
    - src/__tests__/auth-middleware.test.ts
  modified:
    - src/lib/auth-middleware.ts
    - src/app/api/ai/parse/route.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Use createNeonAuth({ baseUrl, cookies: { secret } }) — the real 0.2.0-beta.1 API — instead of the plan's example shape with emailAndPassword/socialProviders. Provider config lives server-side in the Neon Auth instance, not in the client library."
  - "Call auth.getSession() with no arguments. Neon Auth reads the signed cookie from next/headers inside the server request context — the plan's auth.getSession(request) signature does not exist."
  - "Re-export { GET, POST, PUT, DELETE, PATCH } directly from auth.handler() instead of wrapping manually. The handler returns typed route handlers already; the plan's auth.handler(request) signature does not exist."
  - "Ship the VerificationResult interface without the Privy-era wallet field. The only consumer (api/ai/parse/route.ts) was updated to use email ?? 'unknown' instead. Neon Auth has no wallet identity."
  - "Mock @neondatabase/auth/next/server at the vitest level. The package imports next/headers as a bare specifier which Vitest cannot resolve outside a Next.js runtime — mocking the whole module is cleaner than stubbing next/headers."
  - "Install @neondatabase/auth on Next 14.2.35 despite the Next 16+ peer warning. Inspection of the package source confirmed it only uses next/headers (cookies/headers) and next/server (NextRequest/NextResponse) which are stable across Next 13-16. pnpm build succeeds, all routes compile."

patterns-established:
  - "Neon Auth server helper lives at src/lib/neon-auth.ts — never imported on the client"
  - "withAuth() HOF is the single enforcement point for API route auth + whitelist"
  - "Root middleware.ts protects all pages; API routes protect themselves via withAuth"

requirements-completed:
  - AUTH-03

duration: 48 min
completed: 2026-04-12
---

# Phase 41 Plan 01: Server Auth Foundation Summary

**Neon Auth server helper + catch-all handler + root middleware + rewritten withAuth() HOF, all wired against the real @neondatabase/auth 0.2.0-beta.1 API shape while keeping every existing route compiling unchanged**

## Performance

- **Duration:** ~48 min
- **Started:** 2026-04-12T10:40Z
- **Completed:** 2026-04-12T10:50Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments

- @neondatabase/auth installed and proven compatible with Next 14.2.35 (pnpm build passes)
- Single-point server Neon Auth instance at `src/lib/neon-auth.ts` with import-safe fallbacks
- Catch-all `/api/auth/[...path]` route handling every Better Auth endpoint
- Root `middleware.ts` redirecting unauthenticated page traffic to `/auth`
- `withAuth()` HOF rewritten on `auth.getSession()` with the existing `VerificationResult` contract
- `ALLOWED_EMAILS` whitelist logic moved from `privy-server.ts` to the new middleware
- 8 new tests (3 handler smoke tests, 5 HOF behaviour tests) — `pnpm test` now 425/425

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Neon Auth + server helper + catch-all handler** — `1c3ecda` (feat)
2. **Task 2: Rewrite withAuth HOF + root middleware.ts** — `c0d4d92` (feat)

## Files Created/Modified

- `src/lib/neon-auth.ts` — server Neon Auth instance with safe fallbacks
- `src/app/api/auth/[...path]/route.ts` — catch-all Better Auth handler (GET/POST/PUT/DELETE/PATCH)
- `middleware.ts` — root Next.js middleware, `auth.middleware({ loginUrl: '/auth' })`, matcher excludes api/auth/_next/static
- `src/lib/auth-middleware.ts` — `withAuth` rewritten around cookie sessions, whitelist preserved, `VerificationResult.wallet` removed
- `src/__tests__/neon-auth-handler.test.ts` — 3 smoke tests (module surface, import safety, route exports)
- `src/__tests__/auth-middleware.test.ts` — 5 HOF tests covering no-session, whitelist miss, whitelist pass (case insensitive), empty whitelist, and middleware.ts export shape
- `src/app/api/ai/parse/route.ts` — dropped dead `auth.wallet` audit-log branch
- `package.json` / `pnpm-lock.yaml` — `@neondatabase/auth` added

## Decisions Made

- **Adapted to real @neondatabase/auth 0.2.0-beta.1 API** (plan pre-authorized this). The planned signatures (`createNeonAuth({ emailAndPassword, socialProviders })`, `auth.getSession(request)`, `auth.handler(request)`) don't exist. Real shape: `createNeonAuth({ baseUrl, cookies: { secret } })`, `auth.getSession()`, `auth.handler() → { GET, POST, PUT, DELETE, PATCH }`.
- **Kept project on Next 14** despite Neon Auth declaring `next>=16.0.6` as a peer dep. Verified by reading the package source: it only uses `next/headers` (cookies, headers) and `next/server` (NextRequest, NextResponse) which have stable semantics from Next 13 onward. `pnpm build` succeeds.
- **Removed `VerificationResult.wallet`** instead of keeping it as a dead optional field. Only one consumer (`api/ai/parse/route.ts`) referenced it and Neon Auth has no wallet identity.
- **Mocked the whole `@neondatabase/auth/next/server` module in vitest tests**. The package imports `next/headers` as a bare specifier and Node's ESM resolver cannot find it outside a Next.js runtime. Mocking the whole module is cleaner than stubbing next/headers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Neon Auth API surface differs from plan's example**
- **Found during:** Task 1 (pnpm add @neondatabase/auth + first import attempt)
- **Issue:** Plan's `createNeonAuth({ emailAndPassword, socialProviders })` call shape does not exist in 0.2.0-beta.1. Real shape is `createNeonAuth({ baseUrl, cookies: { secret, sessionDataTtl? } })`. `auth.getSession(request)` does not exist either — real API reads cookies from `next/headers` when called with no args. `auth.handler(request)` does not exist — `auth.handler()` returns `{ GET, POST, PUT, DELETE, PATCH }` handler functions.
- **Fix:** Inspected the installed package dist types (`dist/next/server/index.d.mts`) and mjs to derive the real shapes. Wrote `src/lib/neon-auth.ts` against `{ baseUrl, cookies: { secret } }`; wrote the catch-all route as `export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();`; wrote `withAuth` as `const { data: session } = await auth.getSession();`. Plan explicitly pre-authorized this deviation.
- **Files modified:** `src/lib/neon-auth.ts`, `src/app/api/auth/[...path]/route.ts`, `src/lib/auth-middleware.ts`
- **Verification:** `pnpm typecheck` clean, `pnpm build` succeeds, 8 tests pass.
- **Committed in:** `1c3ecda` (Task 1), `c0d4d92` (Task 2)

**2. [Rule 3 — Blocking] Vitest cannot resolve `next/headers` at the Node test runtime**
- **Found during:** Task 1 (first test run failed with ERR_MODULE_NOT_FOUND on `next/headers`)
- **Issue:** `@neondatabase/auth/next/server` imports `next/headers` as a bare specifier. Vitest running on Node ESM cannot find it outside a Next.js runtime.
- **Fix:** Added a `vi.mock("@neondatabase/auth/next/server", ...)` that returns a stub `createNeonAuth` exposing `handler`/`middleware`/`getSession` with matching shapes. Tests validate the *wrapper contract* without booting Better Auth.
- **Files modified:** `src/__tests__/neon-auth-handler.test.ts`, `src/__tests__/auth-middleware.test.ts`
- **Verification:** Both test files pass (3 + 5 tests).
- **Committed in:** `1c3ecda`, `c0d4d92`

**3. [Rule 1 — Bug] Dead `auth.wallet` reference in AI parse route**
- **Found during:** Task 2 (`pnpm typecheck` after dropping `wallet` from `VerificationResult`)
- **Issue:** `src/app/api/ai/parse/route.ts:131` destructured `auth.wallet` in its audit log fallback. The wallet field was a Privy-era artifact; Neon Auth has no wallet identity and Phase 41 is the Privy removal phase.
- **Fix:** Replaced `${auth.email || auth.wallet}` with `${auth.email ?? "unknown"}`.
- **Files modified:** `src/app/api/ai/parse/route.ts`
- **Verification:** `pnpm typecheck` passes, `pnpm build` passes, all 425 tests pass.
- **Committed in:** `c0d4d92` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** All three deviations were necessary to compile and test against the real package. Deviation 1 was pre-authorized in the plan text ("Adapt the createNeonAuth call shape to match actual docs"). Deviation 2 is a test-environment adaptation with no production impact. Deviation 3 is a pre-existing dead code path that would have broken the rewrite. No scope creep — all work stays inside the files `files_modified` of plan 41-01.

## Issues Encountered

- **Next 16+ peer dep warning from `@neondatabase/auth`.** pnpm emits a WARN that `@neondatabase/auth@0.2.0-beta.1` requires `next>=16.0.6` but the project is on `next@14.2.35`. Resolved by reading the package source — it only uses stable `next/headers` + `next/server` APIs. Runtime verification: `pnpm build` succeeds, all routes compile, no runtime errors in static analysis. The warning is documented in the neon-auth.ts header comment.

## User Setup Required

Not yet. Plan 41-01 adds the code path but it will only be exercised once the user provisions a Neon Auth instance and sets `NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET`. That setup is surfaced by plan 41-02 (when the UI can actually attempt a sign-in). Until then the catch-all route and middleware silently fall back to the placeholder secret and will fail on first live auth call.

## Next Phase Readiness

- Plan 41-02 (Wave 2) can now consume `@/lib/neon-auth` as the client's singleton target — it will build the `/auth` page, `useAuth` hook, and providers stack that actually hit the catch-all route.
- Plan 41-03 (Wave 2) is unblocked — the server side of push endpoints already uses `withAuth` and gets Neon Auth cookie sessions automatically.
- Plan 41-04 (Wave 3) can delete `src/lib/privy-server.ts` without orphaning `auth-middleware.ts` — it no longer imports from privy-server.

## Self-Check: PASSED

- `src/lib/neon-auth.ts` exists on disk
- `src/app/api/auth/[...path]/route.ts` exists on disk
- `middleware.ts` exists on disk at project root
- `git log --oneline --all --grep="41-01"` returns 2 commits (`1c3ecda`, `c0d4d92`)
- No `## Self-Check: FAILED` marker

---
*Phase: 41-neon-auth-privy-removal*
*Completed: 2026-04-12*
