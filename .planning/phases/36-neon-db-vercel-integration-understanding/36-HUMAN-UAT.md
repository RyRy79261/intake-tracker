---
status: partial
phase: 36-neon-db-vercel-integration-understanding
source: [36-VERIFICATION.md]
started: 2026-04-06T14:40:00Z
updated: 2026-04-06T14:40:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Neon Console: Main branch exists as default/production
expected: Main branch visible in Neon Console Branches tab, marked as default
result: [pending]

### 2. Neon Console: Staging branch is child of main
expected: Staging branch visible in Branches tab with parent = main
result: [pending]

### 3. Neon Console: Preview branches appear for PRs
expected: preview/* branches appear when PRs are open (may be empty if no active PRs)
result: [pending]

### 4. Neon Console: Push notification tables exist
expected: push_subscriptions, push_dose_schedules, push_sent_log, push_settings visible in SQL Editor/Tables view
result: [pending]

### 5. Vercel Dashboard: DATABASE_URL scoped per environment
expected: DATABASE_URL has different values for Production/Preview/Development in Environment Variables settings
result: [pending]

### 6. Vercel Dashboard: Neon integration listed
expected: Neon integration visible under Settings > Integrations
result: [pending]

### 7. Vercel Dashboard: Preview deployments have unique DATABASE_URL
expected: Recent preview deployment shows DATABASE_URL different from production
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
