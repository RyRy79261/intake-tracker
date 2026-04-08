---
status: partial
phase: 28-staging-environment
source: [28-VERIFICATION.md]
started: 2026-04-04T20:22:00.000Z
updated: 2026-04-04T20:22:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Staging URL loads at staging.intake-tracker.ryanjnoble.dev
expected: Page loads successfully showing the intake tracker dashboard
result: [pending]

### 2. Service worker not registered on staging
expected: Browser DevTools > Application > Service Workers shows no service workers
result: [pending]

### 3. Privy login works on staging URL
expected: Login via email/Google succeeds without auth errors
result: [pending]

### 4. Push notification data uses staging Neon DB
expected: Push notification subscriptions are stored in the staging Neon branch, not production
result: [pending]

### 5. Neon staging branch reset works
expected: Triggering staging-db-reset workflow resets staging DB to production schema
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
