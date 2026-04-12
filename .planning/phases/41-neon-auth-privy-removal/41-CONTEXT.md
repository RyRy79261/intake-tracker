# Phase 41: Neon Auth + Privy Removal - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace Privy authentication with Neon Auth (`@neondatabase/auth` v0.1.0-beta.20, email/password + Google OAuth). Remove the PIN gate entirely. Update all 9 API routes and 14 client files that consume Privy. Migrate push subscription identity from Privy user IDs to Neon Auth user IDs by truncating push tables. Update Playwright E2E tests to authenticate via a seeded Neon Auth test user.

</domain>

<decisions>
## Implementation Decisions

### Auth UI & Login Flow
- **D-01:** Login methods: email/password + Google OAuth (preserve current Privy method parity)
- **D-02:** Single `/auth` route with shadcn `Tabs` for Sign In / Sign Up (mobile-first, max-w-lg, no extra navigation)
- **D-03:** Hard gate at root — Next.js middleware redirects unauthenticated requests to `/auth`. App shell never renders without a session. Replaces the soft `AuthGuard` card pattern.
- **D-04:** Sign-up restricted via `ALLOWED_EMAILS` whitelist. Unauthorized emails get a friendly "contact admin" error (preserves current Privy whitelist behavior).
- **D-05:** Build all auth forms with existing shadcn/ui (`Input`, `Button`, `Form`, `Tabs`) — `@neondatabase/auth-ui` (alpha) explicitly out of scope per REQUIREMENTS.

### Session & Route Protection
- **D-06:** API routes use cookie-based sessions via `auth.getSession()` inside the existing `withAuth()` HOF. Replaces Bearer-token plumbing — client no longer attaches `Authorization` headers. AI client (`src/lib/ai-client.ts`) drops `authToken`/`authHeaders` parameters.
- **D-07:** Whitelist enforcement stays inside `withAuth()` after session resolves. Single centralized check, minimal change to existing pattern.
- **D-08:** `middleware.ts` at project root uses Neon Auth's `auth.middleware({ loginUrl: '/auth' })` for page-level protection.
- **D-09:** Catch-all auth handler at `app/api/auth/[...path]/route.ts` proxies to Neon Auth service per STACK.md integration pattern.

### Push Identity Migration
- **D-10:** Wipe `push_subscriptions` table during phase 41. Existing `subscribeToPush()` flow re-registers under the new Neon Auth `userId` on first login. Single-user app, only one device (user's phone) is affected — one notification gap is acceptable.
- **D-11:** Truncate `push_schedules` and `push_sent_log` alongside `push_subscriptions` (atomic). Schedule re-syncs from client via existing `use-push-schedule-sync` hook on next login.
- **D-12:** Push DB layer (`src/lib/push-db.ts`) `user_id` column type stays as `text` — Neon Auth user IDs are string IDs, no schema change needed in this phase. Drizzle migration happens in Phase 42.

### E2E Test Authentication
- **D-13:** Pre-seed a test user in the Neon Auth instance. Playwright `globalSetup` signs in once via the `/auth` page, saves `storageState` (cookies). All specs load via `use({ storageState: 'auth.json' })`. Standard Playwright auth pattern.
- **D-14:** Replace `PRIVY_TEST_EMAIL`/`PRIVY_TEST_OTP` env vars with `NEON_AUTH_TEST_EMAIL` / `NEON_AUTH_TEST_PASSWORD`. Update `playwright.config.ts` and `e2e/settings.spec.ts` Privy skip comments.
- **D-15:** CI runs E2E against a dedicated Neon test branch — created from main on each run, deleted after. Phase 36 architecture doc already documents the Neon branch lifecycle pattern.

### Files to Delete (Privy)
- **D-16:** `src/lib/privy-server.ts` — entire file replaced by Neon Auth session helper
- **D-17:** `@privy-io/react-auth` and `@privy-io/server-auth` packages removed from `package.json`
- **D-18:** `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_PRIVY_CLIENT_ID`, `PRIVY_APP_SECRET`, `ALLOW_DEV_FALLBACK` env vars removed (env files, CI secrets, vercel.json, README)
- **D-19:** CSP rules for `*.privy.io`, `auth.privy.io` removed and replaced with Neon Auth base URL domain (per `bundle-security.test.ts`)

### Files to Delete (PIN gate)
- **D-20:** `src/hooks/use-pin-gate.tsx`, `src/components/pin-dialog.tsx`, `src/lib/pin-service.ts` deleted entirely
- **D-21:** Consumers cleaned up: `src/components/history-drawer.tsx`, `src/components/settings-drawer.tsx` (if still present), `src/app/providers.tsx`, `src/components/settings/privacy-security-section.tsx`
- **D-22:** Phase 40's "Privacy & Security" accordion group keeps the Account section (rewritten for Neon Auth) but the PIN setup UI inside `privacy-security-section.tsx` is removed entirely

### Files to Rewrite (Privy → Neon Auth)
- **D-23:** `src/lib/auth-middleware.ts` — `withAuth()` HOF rewritten to use `auth.getSession()` + whitelist check
- **D-24:** `src/components/auth-guard.tsx` — `useAuth` hook rewritten around `createAuthClient()`; `AuthGuard` simplified since middleware now handles redirect
- **D-25:** `src/components/auth-button.tsx` — `signOut` from Neon Auth client
- **D-26:** `src/components/settings/account-section.tsx` — display email + sign out via Neon Auth client
- **D-27:** `src/app/providers.tsx` — `PrivyProvider` and `PrivyProviderWithTheme` removed; `PinGateProvider` removed; provider stack simplified to ErrorBoundary → QueryClient → Theme → TimezoneGuard

### Claude's Discretion
- Exact form layout/validation messages for sign-in / sign-up
- Password strength rules (Neon Auth defaults are fine)
- Forgot-password flow (use Neon Auth's built-in if available, or defer with a placeholder)
- Loading/error UI states during sign-in
- Specific Neon Auth env var names (follow STACK.md: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`)
- How to seed the E2E test user (script vs manual; document in test README)
- CSP allowlist domain for Neon Auth (resolve from base URL)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Architecture
- `.planning/research/STACK.md` §"Authentication: Neon Auth (replacing Privy)" — exact integration pattern, env vars, what to install/uninstall, why @neondatabase/auth-ui is excluded
- `.planning/research/ARCHITECTURE.md` §"Current Architecture (Baseline)" — current Privy + PinGate provider stack, withAuth pattern, push table layout

### Requirements
- `.planning/REQUIREMENTS.md` §"Authentication" — AUTH-01 through AUTH-05 acceptance criteria
- `.planning/REQUIREMENTS.md` §"Push Notifications" — PUSH-02 (push subscriptions use Neon Auth user identity)
- `.planning/REQUIREMENTS.md` §"Out of Scope" — `@neondatabase/auth-ui` (alpha) explicitly excluded

### Roadmap
- `.planning/ROADMAP.md` §"Phase 41" — goal, dependencies (Phase 40), success criteria

### Prior Phase
- `.planning/phases/40-settings-accordion-restructure/40-CONTEXT.md` §"Privacy & Security" — Phase 40 accordion group containing Account section (Phase 41 rewrites Account contents)

### Existing Code (must be read before modifying)
- `src/app/providers.tsx` — current provider stack with PrivyProvider + PinGateProvider
- `src/lib/privy-server.ts` — current Privy verification + whitelist logic to be replaced
- `src/lib/auth-middleware.ts` — withAuth HOF wrapping all 9 API routes
- `src/components/auth-guard.tsx` — current useAuth hook + AuthGuard component
- `src/components/auth-button.tsx` — current login/logout button
- `src/components/settings/account-section.tsx` — Privy-coupled account display
- `src/hooks/use-pin-gate.tsx` — PIN gate provider to delete
- `src/components/pin-dialog.tsx`, `src/lib/pin-service.ts` — PIN UI + service to delete
- `src/lib/push-db.ts` — push subscription DB layer (user_id is string, no schema change in P41)
- `src/lib/ai-client.ts` — drops authToken/authHeaders params
- `src/__tests__/bundle-security.test.ts` — CSP rules to update
- `playwright.config.ts`, `e2e/settings.spec.ts` — Privy test account references

### API Routes (all use withAuth)
- `src/app/api/ai/parse/route.ts`, `medicine-search/route.ts`, `interaction-check/route.ts`, `substance-enrich/route.ts`, `substance-lookup/route.ts`, `titration-warnings/route.ts`, `status/route.ts`
- `src/app/api/push/subscribe/route.ts`, `unsubscribe/route.ts`, `sync-schedule/route.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `withAuth()` HOF pattern in `src/lib/auth-middleware.ts` — keep the wrapper signature, swap internals from Privy verification to Neon Auth `getSession()`. All 9 API routes need zero changes.
- shadcn/ui `Form`, `Input`, `Button`, `Tabs`, `Card` components — sufficient for custom auth forms, no new UI deps needed
- `next-themes` provider — already wired, Neon Auth forms inherit theme automatically
- Existing `subscribeToPush()` / `useEffect`-driven re-subscribe in `use-push-schedule-sync` — handles re-registration on first login automatically after table truncation

### Established Patterns
- All API routes wrapped via `withAuth(async ({ request, auth }) => ...)` — `auth.userId!` available in handler
- Provider stack in `src/app/providers.tsx`: `ErrorBoundary > QueryClient > Theme > Privy > PinGate > Timezone > children`
- Env-var-driven dev fallback (`!appId` skips Privy) — replicate pattern for `!process.env.NEON_AUTH_BASE_URL` if needed for local dev without Neon
- CSP allowlist defined in `src/__tests__/bundle-security.test.ts` — single source of truth for external auth domain

### Integration Points
- Provider stack collapse: `src/app/providers.tsx` (remove PrivyProvider + PinGateProvider, add nothing — Neon Auth uses cookie sessions read by middleware/server)
- New middleware: `middleware.ts` at project root using `auth.middleware({ loginUrl: '/auth' })`
- New routes: `app/auth/page.tsx` (sign-in/sign-up tabs), `app/api/auth/[...path]/route.ts` (catch-all handler)
- Phase 40's Privacy & Security accordion group — Account section gets new email + sign-out content; PIN setup card removed

</code_context>

<specifics>
## Specific Ideas

- Cookie session check is single source of auth truth — no Bearer token shuttling between client and API calls (drops `getAuthHeader` complexity from `useAuth` hook)
- Auth flow stays "single-user friendly": ALLOWED_EMAILS env var preserved as the gate, even though Neon Auth has its own user table
- Push table truncation is intentional — single-user, single-device app means one notification gap during migration is acceptable
- E2E auth follows Playwright's standard `globalSetup + storageState` pattern, replacing the bespoke Privy OTP iframe approach

</specifics>

<deferred>
## Deferred Ideas

### Cross-Phase Concern: Auth Migration Data Safety (carried from Phase 40)
User's IndexedDB data is NOT tied to Privy user IDs — auth swap in Phase 41 is safe for local data. The real risk point is **Phase 45 (Data Migration)** when local data uploads to NeonDB under the new Neon Auth identity. Phase 45 must address: (a) ensure backup-before-upload, (b) verify the user understands the new Neon Auth identity is the canonical "owner" of all uploaded data, (c) row count verification step.

### Future Enhancements (out of P41 scope)
- Forgot-password flow refinement (use Neon Auth defaults in P41, polish later if needed)
- Multi-device session management (single-device app — defer indefinitely)
- Account deletion UI (no requirement currently)

</deferred>

---

*Phase: 41-neon-auth-privy-removal*
*Context gathered: 2026-04-12*
