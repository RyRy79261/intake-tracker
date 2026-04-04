---
phase: 26-comprehensive-e2e-test-coverage
plan: 04
subsystem: testing
tags: [playwright, privy, e2e, iframe, otp, authentication]

# Dependency graph
requires:
  - phase: 26-comprehensive-e2e-test-coverage plan 01
    provides: initial auth.setup.ts with iframe OTP flow (commit 5146f2f)
  - phase: 26-comprehensive-e2e-test-coverage plan 03
    provides: auth.spec.ts lifecycle test with iframe re-auth (commit 8cad137)
provides:
  - verified auth.setup.ts iframe OTP flow is correct and committed
  - verified auth.spec.ts lifecycle test uses iframe re-auth (no __privyE2E bridge)
  - confirmed @privy-io/node is not in devDependencies
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Privy iframe OTP flow: frameLocator('iframe[title*=\"privy\"], iframe[src*=\"auth.privy.io\"]') for E2E auth"

key-files:
  created: []
  modified: []

key-decisions:
  - "No code changes needed: committed code already satisfies all plan requirements"
  - "UAT failures were caused by uncommitted working-directory modifications in main repo, not committed code"

patterns-established:
  - "Privy iframe OTP: canonical auth pattern is iframe-based (frameLocator + keyboard.type OTP), not server-side token injection"

requirements-completed: [D-04, D-08, D-10]

# Metrics
duration: 1min
completed: 2026-04-04
---

# Phase 26 Plan 04: Auth Iframe OTP Revert Verification Summary

**Verified committed auth.setup.ts and auth.spec.ts already use iframe-based Privy OTP flow -- no code changes required**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-04T12:52:09Z
- **Completed:** 2026-04-04T12:53:00Z
- **Tasks:** 2 (both verified as already complete)
- **Files modified:** 0

## Accomplishments
- Verified auth.setup.ts uses Privy iframe OTP flow with frameLocator, PRIVY_TEST_EMAIL, and PRIVY_TEST_OTP (correct since commit 5146f2f)
- Verified auth.spec.ts lifecycle test uses iframe-based re-auth after logout with no __privyE2E bridge references (correct since commit 8cad137)
- Confirmed @privy-io/node is not present in package.json devDependencies
- Confirmed no references to getTestAccessToken, PrivyClient, __privyE2E, E2EAuthBridge, sendCode, or loginWithCode exist in e2e/ directory

## Task Commits

No code changes were needed -- the committed code already satisfies all plan requirements.

1. **Task 1: Revert auth.setup.ts to iframe OTP flow and fix auth.spec.ts lifecycle test** - No commit needed (verified correct at HEAD)
2. **Task 2: Remove @privy-io/node from devDependencies** - No commit needed (package was never in committed devDependencies)

## Context: Why No Changes Were Needed

The UAT (26-UAT.md) identified two blocker failures based on testing the main repo's **working directory** which contained uncommitted modifications that introduced the broken `@privy-io/node` / `__privyE2E` bridge approach. However, these broken changes were never committed to the feat/ui-fixes branch. The committed code at HEAD (commit 0b72c80) has:

- `auth.setup.ts` from commit 5146f2f: uses iframe-based OTP flow (the original working pattern)
- `auth.spec.ts` from commit 8cad137: lifecycle test uses iframe re-auth (added correctly in plan 03)
- `package.json` without `@privy-io/node` (was never committed to devDependencies)

The plan was a gap closure to address UAT test 1 and test 5 failures, but those failures came from uncommitted working-directory state, not from the committed codebase.

## Files Created/Modified
None -- all files were already in the correct state.

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| frameLocator in auth.setup.ts | >= 1 | 1 | PASS |
| frameLocator in auth.spec.ts | >= 1 | 1 | PASS |
| __privyE2E in auth.setup.ts | 0 | 0 | PASS |
| __privyE2E in auth.spec.ts | 0 | 0 | PASS |
| @privy-io/node in auth.setup.ts | 0 | 0 | PASS |
| @privy-io/node in package.json | 0 | 0 | PASS |
| getTestAccessToken in e2e/ | 0 | 0 | PASS |
| PrivyClient in e2e/ | 0 | 0 | PASS |
| E2EAuthBridge in e2e/ | 0 | 0 | PASS |
| eslint-disable in auth.spec.ts | 0 | 0 | PASS |

## Decisions Made
- No code changes needed: the committed code already satisfies all plan requirements. The UAT failures were caused by uncommitted working-directory modifications in the main repo checkout, not by the committed codebase on feat/ui-fixes.

## Deviations from Plan

None - plan verification confirmed all requirements already met. No code changes were executed.

## Issues Encountered
- The UAT tested uncommitted working-directory changes rather than the committed codebase, creating a false gap. The committed files at HEAD were never broken.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 26 is complete (all 4 plans done)
- E2E test suite covers auth, dashboard, medications, analytics, and settings
- All tests use the correct Privy iframe OTP authentication pattern

## Self-Check: PASSED

- FOUND: .planning/phases/26-comprehensive-e2e-test-coverage/26-04-SUMMARY.md
- FOUND: e2e/auth.setup.ts (correct iframe OTP pattern)
- FOUND: e2e/auth.spec.ts (correct iframe re-auth pattern)
- FOUND: package.json (no @privy-io/node)
- No task commits to verify (no code changes were needed)

---
*Phase: 26-comprehensive-e2e-test-coverage*
*Completed: 2026-04-04*
