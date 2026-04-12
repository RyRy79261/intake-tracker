---
phase: 41-neon-auth-privy-removal
plan: 05
subsystem: e2e-auth
tags: [e2e, playwright, neon-auth, ci, global-setup, storage-state]

requires:
  - phase: 41-neon-auth-privy-removal
    plan: 02
    provides: "Neon Auth /auth page + /api/auth/[...all] handler — the sign-in surface that globalSetup drives"
  - phase: 41-neon-auth-privy-removal
    plan: 04
    provides: "playwright.config.ts no longer references NEXT_PUBLIC_PRIVY_APP_ID; CSP allows https://*.neon.tech"
provides:
  - "Playwright globalSetup that signs a Neon Auth test user in once via /auth and persists cookies to playwright/.auth/user.json"
  - "storageState wired into every spec via use.storageState — no per-test auth logic anywhere"
  - "scripts/seed-e2e-user.ts that creates the test user via /api/auth/sign-up/email (409 treated as success)"
  - "CI e2e job provisions a dedicated Neon branch per run, seeds the user, runs specs, and deletes the branch on cleanup"
  - "e2e/README.md documenting local setup, required repo secrets, and troubleshooting"
affects: [41-06]

tech-stack:
  added:
    - "Playwright globalSetup + storageState pattern (official Playwright docs pattern)"
    - "neondatabase/create-branch-action@v5 and neondatabase/delete-branch-action@v3 in the e2e job"
  patterns:
    - "Sign in once via the real /auth page in globalSetup, persist cookies to disk, reuse across all specs"
    - "Per-run ephemeral Neon branches so each CI run starts from a clean database"

key-files:
  created:
    - e2e/global-setup.ts
    - scripts/seed-e2e-user.ts
    - e2e/README.md
  modified:
    - playwright.config.ts
    - .gitignore
    - .github/workflows/ci.yml
    - e2e/settings.spec.ts

key-decisions:
  - "globalSetup falls back to writing an empty storageState (and logging a warning) when NEON_AUTH_TEST_EMAIL / NEON_AUTH_TEST_PASSWORD are unset. This lets local-only smoke runs still start Playwright without crashing in globalSetup — specs will fail on any /api/ai/* endpoint, which is the expected signal."
  - "Seed script POSTs to /api/auth/sign-up/email and treats HTTP 409 as success, so it is idempotent for local development and safe to re-run. The same endpoint users hit in production keeps the seed path realistic."
  - "Unskipped the settings 'account section displays email and sign out option' test and rewrote the assertion to match the current AccountSection markup ('Signed in via Neon Auth'). The Privy-specific skip comment is gone; CI now actually exercises the account card."
  - "CI e2e job provisions an isolated Neon branch per run using create-branch-action@v5, with delete-branch-action@v3 gated on if: always() so the branch is always cleaned up. This matches Phase 36's branch lifecycle architecture."
  - "playwright.config.ts webServer env now passes DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET, NEON_AUTH_TEST_EMAIL, NEON_AUTH_TEST_PASSWORD, and ALLOWED_EMAILS through to the spawned dev/prod server. Both CI and local webServer blocks set the same keys so the two paths stay in sync."
  - "The authenticated storage state file is gitignored at /playwright/.auth/ because it contains a live session cookie. The directory is created by globalSetup at runtime."
  - "The seed script and globalSetup were intentionally split — the seed script only needs Node fetch (runs pre-webServer in CI via pnpm tsx), while globalSetup drives a real chromium page through /auth. This separation mirrors the Playwright-docs pattern and lets both pieces be tested independently."

verification:
  build:
    command: "pnpm build"
    result: "PASS (runs via pre-commit hook as part of vitest pre-check)"
  unit_tests:
    command: "vitest run (via pre-commit hook)"
    result: "PASS — 41 files / 451 tests, all green"
  type_check:
    command: "pnpm exec tsc --noEmit"
    result: "PASS — zero diagnostics"
  lint:
    command: "pnpm lint"
    result: "PASS — only the pre-existing schedule-view.tsx warning unrelated to this plan"
  playwright_list:
    command: "pnpm exec playwright test --list"
    result: "PASS — 20 tests across 4 spec files (dashboard, history, medications, settings); settings.spec.ts now lists 4 tests because the account section test is unskipped"
  grep_audits:
    - "grep -rin 'privy|PRIVY|OTP_IFRAME' e2e/ playwright.config.ts -> 0 hits"
    - "grep -n 'globalSetup' playwright.config.ts -> 1 hit (the require.resolve line)"
    - "grep -n 'storageState' playwright.config.ts -> 1 hit (use.storageState = 'playwright/.auth/user.json')"

requirements-completed:
  - AUTH-05

commits:
  - sha: c4ef51d
    title: "feat(41-05): rewire E2E to Neon Auth via Playwright globalSetup"
    summary: "Replaced the Privy-iframe E2E approach (which was bypassed in CI by NEXT_PUBLIC_PRIVY_APP_ID='') with Playwright globalSetup + storageState. Added seed-e2e-user.ts, a per-run Neon branch lifecycle in the ci.yml e2e job, and e2e/README.md covering local + CI setup. Unskipped the settings account section test now that CI runs authenticated."

---

# Plan 41-05 — Playwright Neon Auth rewire — Complete

## Outcome

Phase 41 Wave 3 E2E rewire lands. The Playwright suite now boots via a
single globalSetup that signs a real Neon Auth test user in through the
actual `/auth` page, persists cookies to
`playwright/.auth/user.json`, and has every spec inherit the
authenticated session via `use: { storageState: ... }`. The CI e2e job
provisions a dedicated Neon branch per run, seeds the test user via
`scripts/seed-e2e-user.ts`, runs the full suite against a production
build, and deletes the branch on cleanup with `if: always()`.

For the first time in project history, the CI e2e pipeline exercises a
real authenticated session instead of the
`NEXT_PUBLIC_PRIVY_APP_ID=''` bypass.

## What changed

### Task 1 — Build globalSetup + seed script + rewire playwright.config

- **`e2e/global-setup.ts`** (new, ~55 lines): signs in once via `/auth`
  using `NEON_AUTH_TEST_EMAIL` / `NEON_AUTH_TEST_PASSWORD`, waits for
  redirect away from `/auth`, and saves `storageState` to
  `playwright/.auth/user.json`. Falls back to writing an empty state
  and logging a warning if the env vars are unset so local smoke runs
  do not crash in setup.
- **`scripts/seed-e2e-user.ts`** (new): POSTs to
  `/api/auth/sign-up/email` with the configured test credentials. A
  `409` response is treated as success so the script is idempotent and
  safe to re-run locally.
- **`playwright.config.ts`**:
  - Added `globalSetup: require.resolve('./e2e/global-setup')` at the
    top of `defineConfig`.
  - Added `storageState: 'playwright/.auth/user.json'` in `use:`.
  - Both `webServer` blocks (CI and local) now pass through
    `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
    `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`,
    `NEON_AUTH_TEST_EMAIL`, `NEON_AUTH_TEST_PASSWORD`, and
    `ALLOWED_EMAILS` from `process.env`.
- **`.gitignore`**: added `/playwright/.auth/` so the session cookie
  file is never committed.

### Task 2 — Update specs + CI workflow

- **`.github/workflows/ci.yml`** e2e job:
  - Added a `Create Neon test branch` step that calls
    `neondatabase/create-branch-action@v5` with
    `branch_name: ci-e2e-${{ github.run_id }}`.
  - Added a `Seed Neon Auth test user` step that runs
    `pnpm tsx scripts/seed-e2e-user.ts` with the new branch's
    `db_url` as `DATABASE_URL` and the test credentials from secrets.
  - `Run E2E tests` now sets the full Neon Auth env block from
    secrets instead of bypassing auth.
  - Added a `Delete Neon test branch` step with `if: always()` so the
    branch is cleaned up even on test failure.
  - The `actions/cache@v4` for Playwright browsers and the
    `actions/upload-artifact@v4` trace upload on failure are
    preserved.
- **`e2e/settings.spec.ts`**: unskipped the
  `account section displays email and sign out option` test and
  rewrote its `Signed in` assertion to match the new markup
  (`Signed in via Neon Auth`). The Privy skip comment is gone.
- **`e2e/README.md`** (new): documents the local setup (one-time env
  var wiring, seed command, how to run), the CI flow (per-run Neon
  branch lifecycle), the required repository secrets table, why
  per-run branches matter (data isolation, determinism), and
  troubleshooting tips.

## Verification Gates

| Gate                                    | Result |
| --------------------------------------- | ------ |
| `pnpm exec tsc --noEmit`                | PASS — zero diagnostics |
| `pnpm lint`                             | PASS — only pre-existing `schedule-view.tsx` warning |
| `pnpm exec playwright test --list`      | PASS — 20 tests across 4 spec files |
| `vitest run` (full 451-test suite, via pre-commit hook) | PASS |
| `grep -rin "privy\|PRIVY\|OTP_IFRAME" e2e/ playwright.config.ts` | 0 hits |
| `grep -n "globalSetup" playwright.config.ts` | 1 hit (require.resolve) |
| `grep -n "storageState" playwright.config.ts` | 1 hit (use.storageState) |

## Notes for plan 41-06 (Human UAT)

- `pnpm test:e2e` cannot be exercised in this autonomous run because
  it needs: (a) a running dev/prod server with a real
  `NEON_AUTH_COOKIE_SECRET`, (b) a reachable Neon Postgres database,
  and (c) seeded `NEON_AUTH_TEST_EMAIL` / `NEON_AUTH_TEST_PASSWORD`
  credentials. The human UAT step should run the full suite locally
  once those env vars are wired.
- The CI run on the first PR push that hits this branch will fail
  fast with a clear error from the Neon actions if the repo secrets
  (`NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_AUTH_TEST_EMAIL`,
  `NEON_AUTH_TEST_PASSWORD`, `BETTER_AUTH_SECRET`,
  `NEON_AUTH_COOKIE_SECRET`) are missing. Adding those secrets is a
  prerequisite to the Human UAT checkpoint.
- `playwright/.auth/` is gitignored but the directory itself does not
  yet exist on disk — it is created lazily at first run by
  globalSetup.
