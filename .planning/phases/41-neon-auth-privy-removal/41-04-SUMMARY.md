---
phase: 41-neon-auth-privy-removal
plan: 04
subsystem: auth-cleanup
tags: [neon-auth, privy-removal, pin-gate-removal, csp, env-scrub]

requires:
  - phase: 41-neon-auth-privy-removal
    plan: 02
    provides: "Neon Auth client + withAuth() server middleware (compile contract for the new auth surface)"
  - phase: 41-neon-auth-privy-removal
    plan: 03
    provides: "Push client uses cookie session — no Authorization header anywhere in the push subsystem"
provides:
  - "Auth-free parseIntakeWithAI(input) and runSubstanceEnrichment(...) helpers"
  - "All 6 AI consumer sites send no Authorization header to /api/ai/*"
  - "PIN gate fully deleted (use-pin-gate, pin-dialog, pin-service, privacy-security-section)"
  - "src/lib/privy-server.ts deleted; @privy-io/* packages uninstalled"
  - "next.config.js CSP allows Neon Auth (https://*.neon.tech) instead of Privy + WalletConnect"
  - ".env.template, README.md, SECURITY.md, CLAUDE.md, ci.yml, playwright.config.ts scrubbed of Privy env vars and prose"
affects: [41-05]

tech-stack:
  removed:
    - "@privy-io/react-auth (-1 dep, ~233 transitive packages)"
    - "@privy-io/server-auth (-1 dep, ~234 transitive packages)"
  patterns:
    - "AI client helpers take only payload args — auth is the cookie session, attached automatically by the browser to same-origin fetch calls"
    - "PIN gate is gone — server-side Neon Auth is the only access control layer"

key-files:
  deleted:
    - src/hooks/use-pin-gate.tsx
    - src/components/pin-dialog.tsx
    - src/lib/pin-service.ts
    - src/components/settings/privacy-security-section.tsx
    - src/lib/privy-server.ts
  modified:
    - src/lib/ai-client.ts
    - src/lib/substance-enrich.ts
    - src/components/food-salt/food-section.tsx
    - src/components/substance/substance-type-picker.tsx
    - src/components/liquids/preset-tab.tsx
    - src/components/medications/titrations-view.tsx
    - src/hooks/use-medicine-search.ts
    - src/hooks/use-interaction-check.ts
    - src/components/history-drawer.tsx
    - src/app/settings/page.tsx
    - src/app/api/ai/status/route.ts
    - src/app/api/ai/parse/route.ts
    - src/app/api/ai/substance-enrich/route.ts
    - next.config.js
    - playwright.config.ts
    - .github/workflows/ci.yml
    - .env.template
    - README.md
    - SECURITY.md
    - CLAUDE.md
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Drop Task 1, Task 2, Task 3 into three separate atomic commits (4a0ba45, 72fe5cb, a3ce0ea) so the bisect-friendly story is: refactor consumers -> delete PIN gate -> delete Privy. The pre-commit hook runs the full vitest suite, so each commit must leave the tree green; this slicing makes that possible without folding everything into one mega-commit."
  - "Delete privacy-security-section.tsx entirely instead of rendering null. The file's only purpose was the PIN gate UI, and 41-04 has no other consumer for it. Settings page now goes Account -> Permissions inside the Privacy & Security accordion."
  - "src/app/api/ai/status/route.ts now reports authConfigured = !!process.env.DATABASE_URL instead of isPrivyConfigured(). The endpoint is purely diagnostic; consumers want to know whether the auth backend is wired."
  - "Bundle security test (src/__tests__/bundle-security.test.ts) keeps the assertion that PRIVY_APP_SECRET does not appear in the client bundle as a regression guard. The string literal is harmless and protects against accidental reintroduction."
  - "playwright.config.ts gets the minimal change of replacing the NEXT_PUBLIC_PRIVY_APP_ID stub with an empty env block. Plan 41-05 owns the full Playwright globalSetup rewrite; this commit only stops referencing the dead env var."
  - "Stale doc comments in src/lib/auth-middleware.ts (multiple references to 'pre-Phase-41 Privy contract') were intentionally left in place. They explain the historical contract preserved by withAuth() and are accurate as historical context. They will be revisited in plan 41-06 if the human UAT calls them out."

verification:
  build:
    command: "pnpm build"
    result: "PASS — clean compile, lint, type-check, and static gen"
  unit_tests:
    command: "vitest run (via pre-commit hook)"
    result: "PASS — 41 files / 451 tests, all green on each of the three commits"
  type_check:
    command: "pnpm exec tsc --noEmit"
    result: "PASS — zero diagnostics"
  lint:
    command: "pnpm lint"
    result: "PASS — only the pre-existing schedule-view.tsx warning unrelated to this plan"
  grep_audits:
    - "grep -rn 'getAuthHeader|authHeaders' src/ -> 1 hit (doc comment in auth-guard.tsx that explains the hook intentionally no longer exposes them)"
    - "grep -rn 'use-pin-gate|pin-dialog|pin-service|usePinGate|usePinProtected|PinGateProvider|PrivacySecuritySection' src/ -> 1 hit (auth-guard test assertion that providers.tsx never imports PinGateProvider)"
    - "grep -rn 'privy|Privy|PRIVY' src/ -> only doc comments in auth-middleware.ts and route.ts files describing the historical contract; assertions in bundle-security.test.ts and auth-guard.test.ts that ensure the symbols never reappear"

requirements-completed:
  - AUTH-02
  - AUTH-04

commits:
  - sha: 4a0ba45
    title: "refactor(41-04): drop authHeaders plumbing from AI clients and consumers"
    summary: "Task 1 — strip authHeaders/getAuthHeader plumbing from ai-client, substance-enrich, and the 6 consumer files (food-section, substance-type-picker, preset-tab, titrations-view, use-medicine-search, use-interaction-check)"
  - sha: 72fe5cb
    title: "refactor(41-04): delete PIN gate (use-pin-gate, pin-dialog, pin-service)"
    summary: "Task 2 — delete the four PIN gate files and update history-drawer + settings page consumers"
  - sha: a3ce0ea
    title: "refactor(41-04): delete privy-server, drop @privy-io deps, update CSP"
    summary: "Task 3 — delete privy-server, uninstall @privy-io/* packages, update CSP/playwright/ci, scrub env vars from .env.template/README/SECURITY/CLAUDE"

---

# Plan 41-04 — Privy & PIN Gate Sweep — Complete

## Outcome

Phase 41 Wave 3 lands. The intake-tracker source tree is now Privy-free
and PIN-gate-free. All client-side AI helpers send only payload data;
authentication is handled by the same-origin Neon Auth session cookie
plus `withAuth()` middleware on the server. The CSP, env templates,
docs, and CI workflow all describe Neon Auth instead of Privy.

The plan landed in three atomic commits, each leaving the tree green
under `pnpm build`, `pnpm lint`, `pnpm exec tsc --noEmit`, and the full
451-test vitest suite (the pre-commit hook ran on every commit).

## What changed

### Task 1 — `4a0ba45` Drop authHeaders plumbing

- `src/lib/ai-client.ts`: `parseIntakeWithAI(input)` lost its options
  param entirely. JSDoc rewritten to describe Neon Auth cookie session.
- `src/lib/substance-enrich.ts`: `runSubstanceEnrichment(...)` lost its
  `authHeaders` param.
- 6 consumers cleaned up: removed `import { useAuth }`, removed the
  `getAuthHeader` destructure, removed the `await getAuthHeader()` call,
  removed `...authHeaders` from fetch headers, and pruned dependency
  arrays:
  - `src/components/food-salt/food-section.tsx`
  - `src/components/substance/substance-type-picker.tsx`
  - `src/components/liquids/preset-tab.tsx`
  - `src/components/medications/titrations-view.tsx`
  - `src/hooks/use-medicine-search.ts`
  - `src/hooks/use-interaction-check.ts` (both `useInteractionCheck`
    and `useRefreshInteractions`)

### Task 2 — `72fe5cb` Delete PIN gate

- Deleted `src/hooks/use-pin-gate.tsx`,
  `src/components/pin-dialog.tsx`, `src/lib/pin-service.ts`, and
  `src/components/settings/privacy-security-section.tsx`.
- Updated `src/components/history-drawer.tsx`: dropped the
  `usePinProtected` import and simplified `handleOpenChange` to a
  pass-through.
- Updated `src/app/settings/page.tsx`: dropped the
  `PrivacySecuritySection` import and the `<PrivacySecuritySection />`
  render — the Privacy & Security accordion now contains only Account
  and Permissions sections.

### Task 3 — `a3ce0ea` Delete Privy

- Deleted `src/lib/privy-server.ts`.
- `src/app/api/ai/status/route.ts`: removed the `isPrivyConfigured`
  import, replaced `privyConfigured` field with `authConfigured =
  !!DATABASE_URL`.
- Removed both Privy npm packages: `pnpm remove @privy-io/react-auth
  @privy-io/server-auth` (-467 packages from the lockfile).
- `next.config.js` CSP: replaced `https://*.privy.io
  https://*.walletconnect.com https://*.walletconnect.org
  wss://*.walletconnect.org` in `connect-src` with
  `https://*.neon.tech`. Tightened `frame-src` from
  `'self' https://auth.privy.io` to just `'self'`.
- `playwright.config.ts`: removed the `NEXT_PUBLIC_PRIVY_APP_ID: ''`
  stub from both webServer env blocks. Plan 41-05 will rewrite this
  config in full to add the Neon Auth globalSetup wiring.
- `.github/workflows/ci.yml`: updated the e2e job header comment to
  describe Neon Auth globalSetup (the underlying Playwright setup
  rewrite is in plan 41-05).
- `.env.template`: rewrote the env-var policy header and the variable
  list to remove Privy entries, add Neon Auth entries
  (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), and replace
  `PRIVY_TEST_EMAIL`/`PRIVY_TEST_OTP` with `E2E_TEST_EMAIL`/
  `E2E_TEST_PASSWORD`.
- `README.md`: updated tech stack, env vars, setup instructions,
  authentication-architecture diagram, security feature table, AI
  features section, and the data-storage table.
- `SECURITY.md`: rewrote Access Control Model section, updated the
  secret list, the auth middleware description, the CSP table, the
  sync-readiness section, and the env var table.
- `CLAUDE.md`: updated the test command docstring, the State Management
  bullet (no more "React Context — Privy auth + PIN gate"), the
  Provider Stack section, and the Auth section.
- Doc comment cleanups in
  `src/app/api/ai/{parse,substance-enrich}/route.ts` (replaced "Privy
  verification" with "Neon Auth cookie verification").

## Verification Gates

| Gate                                  | Result |
| ------------------------------------- | ------ |
| `pnpm build` (production build + lint + tsc + static gen) | PASS |
| `pnpm exec tsc --noEmit`              | PASS — zero diagnostics |
| `pnpm lint`                           | PASS — only pre-existing warning in `schedule-view.tsx` |
| `vitest run` (full 451-test suite, executed by the pre-commit hook on each of the three commits) | PASS |
| `grep -rn "getAuthHeader\|authHeaders" src/` | 1 hit (the explanatory doc comment in `auth-guard.tsx`) |
| `grep -rn "use-pin-gate\|pin-dialog\|pin-service\|usePinGate\|usePinProtected\|PinGateProvider\|PrivacySecuritySection" src/` | 1 hit (assertion in `auth-guard.test.ts`) |
| `grep -rn "@privy-io" src/`           | 0 hits in code; only test assertions guarding against reintroduction |

## Notes for plan 41-05

- `playwright.config.ts` still needs the full globalSetup wiring
  (per the 41-05 plan). This plan only removed the dead env stub.
- `.github/workflows/ci.yml` still references the old env variables in
  CI secrets (none touched here). 41-05 will add the new
  `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` secrets to the e2e job env.
- `e2e/auth.setup.ts` (Privy OTP login flow) still exists and will be
  replaced by `e2e/global-setup.ts` in plan 41-05.

## Notes for plan 41-06 (Human UAT)

- Stale doc comments in `src/lib/auth-middleware.ts` reference the
  "pre-Phase-41 Privy contract" — left as historical documentation
  describing why withAuth() preserves its current shape. If the
  reviewer wants them gone, they can be cleaned up trivially.
- The doc comment "no Bearer token plumbing" appears in the
  push-client signature test as part of the regression guards. This
  is intentional and explains *why* the test exists.
