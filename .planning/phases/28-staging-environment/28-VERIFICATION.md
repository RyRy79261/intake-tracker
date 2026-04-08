---
status: human_needed
phase: 28-staging-environment
verified: 2026-04-04
---

# Phase 28: Staging Environment — Verification

## Phase Goal
A stable staging environment exists at a known URL with its own isolated backend, where service workers cannot cache stale content and auth works correctly.

## Must-Haves Verification

| # | Must-Have | Plan | Status | Evidence |
|---|-----------|------|--------|----------|
| 1 | next.config.js only loads next-pwa when VERCEL_ENV is NOT 'preview' | 28-01 | PASS | `grep "VERCEL_ENV !== 'preview'" next.config.js` matches |
| 2 | use-service-worker.ts prevents registration on non-production environments | 28-01 | PASS | Two `NEXT_PUBLIC_VERCEL_ENV` references in file |
| 3 | use-service-worker.ts unregisters existing SW on non-production environments | 28-01 | PASS | `getRegistrations().then(regs => regs.forEach(reg => reg.unregister()))` present |
| 4 | staging-db-reset.yml exists with safety guard | 28-02 | PASS | File exists, ABORT guard present |
| 5 | Reset workflow uses neondatabase/reset-branch-action@v1 with parent: true | 28-02 | PASS | Both action reference and parent flag present |
| 6 | Reset triggers on release published AND workflow_dispatch | 28-02 | PASS | Both triggers present in workflow YAML |
| 7 | ci.yml triggers on PRs to main and staging | 28-03 | PASS | `branches: [main, staging]` in ci.yml |
| 8 | docs/staging-setup.md exists with complete guide | 28-04 | PASS | File exists with 8 sections, verification checklist, troubleshooting |
| 9 | ALLOWED_EMAILS security warning documented | 28-04 | PASS | WARNING callout present in setup guide |

## Requirements Traceability

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| STG-01 | Stable staging URL deploys on push to staging | PARTIAL | CI supports staging branch; setup docs cover Vercel domain assignment; **manual setup required** |
| STG-02 | Isolated Neon DB branch for staging | PARTIAL | Reset workflow created; setup docs cover Neon branch creation; **manual setup required** |
| STG-03 | Staging env vars configured in Vercel | PARTIAL | Setup docs detail all required env vars; **manual setup required** |
| STG-04 | Service worker disabled on staging | PASS | Build-time and client-side guards implemented and verified |
| STG-05 | Neon staging branch reset on release | PASS | staging-db-reset.yml with correct triggers and safety guard |
| STG-06 | Privy auth works on staging | PARTIAL | Setup docs cover Privy origin configuration; **manual setup required** |

## Automated Checks

- `pnpm typecheck`: PASS
- `pnpm lint`: PASS (pre-existing warning unrelated to phase)
- `pnpm test`: PASS (396/396 tests)
- `pnpm build`: PASS

## Human Verification Required

The following items require manual verification after the user performs the one-time setup documented in `docs/staging-setup.md`:

1. **Staging URL loads**: Navigate to `staging.intake-tracker.ryanjnoble.dev` after Vercel domain assignment and DNS setup
2. **Service worker not registered**: Open staging URL, check DevTools > Application > Service Workers = empty
3. **Privy login works**: Attempt login on staging URL after adding origin to Privy Dashboard
4. **Staging DB isolation**: Verify push notification data writes to staging Neon branch, not production
5. **Neon reset works**: Trigger staging-db-reset workflow manually and verify staging DB refreshes

## Deviations

1. **Plan 28-02**: Used `reset-branch-action` instead of CONTEXT.md D-05's delete+recreate approach. Rationale: preserves connection string so Vercel DATABASE_URL env var never needs updating after reset. Same end result (clean data from production schema).

## Score

**Automated:** 9/9 must-haves passed
**Requirements:** 2/6 fully automated (STG-04, STG-05), 4/6 require manual platform setup
**Overall:** Code changes complete and verified. Phase completion contingent on manual infrastructure setup.
