---
status: complete
phase: 26-comprehensive-e2e-test-coverage
source: [26-01-SUMMARY.md, 26-02-SUMMARY.md, 26-03-SUMMARY.md]
started: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Full E2E Suite Passes
expected: Run `pnpm test:e2e`. All spec files execute: auth.spec.ts, dashboard.spec.ts, medications.spec.ts, history.spec.ts, settings.spec.ts. All tests pass with no failures or timeouts.
result: issue
reported: "Failed at Privy auth. Phase 26 replaced working iframe-based OTP login (PRIVY_TEST_EMAIL/PRIVY_TEST_OTP) with getTestAccessToken + cookie injection approach. getTestAccessToken throws when allowed origins are enabled. Cookie injection doesn't match Privy SDK internal session management."
severity: blocker

### 2. Route-Mirrored Spec File Naming
expected: Spec files are named to mirror app routes: auth.spec.ts, dashboard.spec.ts (for /), medications.spec.ts (for /medications), history.spec.ts (for /history aka /analytics), settings.spec.ts (for /settings). Old names (auth-bypass, intake-logs, medication-wizard) no longer exist.
result: pass

### 3. Dashboard Below-Fold Card Tests
expected: dashboard.spec.ts includes tests for blood pressure recording, weight recording, urination quick-log, and defecation quick-log. Each test scrolls to the card (scrollIntoViewIfNeeded), interacts with it, and verifies a success toast. Total dashboard tests: 7 covering all 6 card types.
result: pass

### 4. Analytics Data Pipeline Test (D-12)
expected: history.spec.ts includes a test that creates a BP reading via the dashboard UI, navigates to /analytics, and verifies the record appears in the Records tab. This validates the full data pipeline from input to analytics display.
result: pass

### 5. Auth Logout/Re-Login Lifecycle (D-08)
expected: auth.spec.ts includes a test that logs out, sees "Sign in Required", clicks Sign In, re-authenticates via the Privy iframe, and returns to the dashboard. Full round-trip auth lifecycle.
result: issue
reported: "Its trash, doesnt pass"
severity: blocker

### 6. Whitelist Rejection Handling (D-09)
expected: auth.spec.ts includes a test that mocks API routes to return 403, verifying the app handles whitelist rejection gracefully without crashing.
result: pass

### 7. Medication Schedule Tab Navigation
expected: medications.spec.ts includes a test that navigates to the Schedule tab, verifies the empty state message, then switches to the Rx tab and back. Tab navigation works correctly with actual MedTabBar labels (Schedule, Rx).
result: pass

### 8. Settings Backup Export
expected: settings.spec.ts includes a test that triggers the backup/export function and verifies a file download occurs (via page.waitForEvent('download')).
result: pass

## Summary

total: 8
passed: 6
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "E2E suite runs with all tests passing"
  status: failed
  reason: "User reported: Failed at Privy auth. Phase 26 replaced working iframe-based OTP login with getTestAccessToken + cookie injection. getTestAccessToken throws when allowed origins enabled; cookie injection not recognized by Privy React SDK."
  severity: blocker
  test: 1
  root_cause: "auth.setup.ts replaced iframe OTP flow with PrivyClient.getTestAccessToken() server-side approach. Two problems: (1) getTestAccessToken throws if allowed origins/base domain are enabled in Privy Dashboard, (2) manually setting privy-token cookie is not how Privy React SDK manages session state. Additionally, auth.spec.ts lifecycle test uses non-existent __privyE2E bridge instead of iframe re-auth."
  artifacts:
    - path: "e2e/auth.setup.ts"
      issue: "Uses @privy-io/node getTestAccessToken instead of iframe OTP flow"
    - path: "e2e/auth.spec.ts"
      issue: "Lifecycle test references non-existent __privyE2E bridge (lines 27-54)"
  missing:
    - "Revert auth.setup.ts to iframe-based OTP flow using PRIVY_TEST_EMAIL/PRIVY_TEST_OTP"
    - "Fix auth.spec.ts lifecycle test to use iframe re-auth pattern instead of __privyE2E"
    - "Remove @privy-io/node devDependency if no longer needed"
- truth: "Auth lifecycle test logs out, re-authenticates via Privy iframe, and returns to dashboard"
  status: failed
  reason: "User reported: Its trash, doesnt pass"
  severity: blocker
  test: 5
  root_cause: "Lifecycle test uses non-existent __privyE2E bridge (window.__privyE2E.sendCode, loginWithCode). No E2EAuthBridge component exists. Should use iframe-based Privy re-auth pattern (same as auth.setup.ts original approach)."
  artifacts:
    - path: "e2e/auth.spec.ts"
      issue: "Lines 27-54 reference __privyE2E bridge that does not exist in the codebase"
  missing:
    - "Rewrite lifecycle test to use Privy iframe re-auth (click Sign In → interact with iframe → fill email → type OTP)"
