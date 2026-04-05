---
phase: 11-push-notifications
plan: 01
subsystem: infra
tags: [web-push, neon-postgres, vapid, service-worker, push-notifications]

requires:
  - phase: 05-security
    provides: auth-middleware for protected API routes
provides:
  - push-db.ts with Postgres query functions for subscriptions, schedules, sent log, settings
  - push-sender.ts with web-push VAPID configuration and sendPush wrapper
  - Service worker push/notificationclick event handlers
  - SQL migration for 4 push notification tables
  - VAPID key generation script
affects: [11-02-api-routes, 11-03-client-integration]

tech-stack:
  added: [web-push, "@neondatabase/serverless"]
  patterns: [neon-sql-tagged-templates, vapid-push-auth, sw-push-events]

key-files:
  created:
    - src/lib/push-db.ts
    - src/lib/push-sender.ts
    - scripts/generate-vapid-keys.js
    - scripts/push-migration.sql
  modified:
    - worker/index.js
    - package.json

key-decisions:
  - "neon() SQL tagged template for all Postgres queries (serverless-friendly, no connection pool)"
  - "Non-null assertion on rows[0] after length check (TypeScript strict mode compliance)"
  - "requireInteraction: true on push notifications for persistent display until user action"

patterns-established:
  - "Server-side push infrastructure: push-db.ts for data, push-sender.ts for delivery"
  - "UPSERT pattern for push subscriptions and settings (single subscription per user)"
  - "Follow-up notification chain via sent_log with follow_up_index tracking"

requirements-completed: [NOTF-01]

duration: 9min
completed: 2026-03-23
---

# Phase 11 Plan 01: Push Infrastructure Summary

**Server-side push notification foundation with Neon Postgres data layer, web-push VAPID sender, and service worker push/click handlers**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-23T14:10:08Z
- **Completed:** 2026-03-23T14:19:43Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Postgres data layer (push-db.ts) with 8 exported functions for subscriptions, schedules, sent log, and settings
- Web-push sender (push-sender.ts) with VAPID configuration and 410 Gone error handling
- Service worker extended with push event (showNotification) and notificationclick (navigate to /medications)
- SQL migration defining 4 tables with proper constraints and unique indexes
- VAPID key generation script for environment setup

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies + create push-db.ts, push-sender.ts, VAPID script, SQL migration** - `716a1e7` (feat)
2. **Task 2: Extend service worker with push and notificationclick handlers** - `4fae073` (feat)

## Files Created/Modified
- `src/lib/push-db.ts` - Postgres query functions for push subscriptions, dose schedules, sent log, settings
- `src/lib/push-sender.ts` - web-push VAPID configuration and sendPush wrapper with 410 handling
- `scripts/generate-vapid-keys.js` - CLI script to generate VAPID key pair
- `scripts/push-migration.sql` - DDL for push_subscriptions, push_dose_schedules, push_sent_log, push_settings
- `worker/index.js` - Added push and notificationclick event listeners
- `package.json` - Added web-push, @neondatabase/serverless, @types/web-push

## Decisions Made
- neon() SQL tagged template for all Postgres queries (serverless-friendly, no connection pool needed)
- Non-null assertion on rows[0] after length check for TypeScript strict mode compliance
- requireInteraction: true on push notifications so they persist until user interacts
- Service worker notificationclick focuses existing /medications window if found, otherwise opens new

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict null check on neon query result**
- **Found during:** Task 1 (push-db.ts creation)
- **Issue:** `rows[0]` flagged as possibly undefined by TypeScript despite length guard on line above
- **Fix:** Added non-null assertion (`rows[0]!`) after `rows.length === 0` early return
- **Files modified:** src/lib/push-db.ts
- **Verification:** pnpm build passes with no TypeScript errors
- **Committed in:** 716a1e7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor TypeScript strictness fix. No scope creep.

## Issues Encountered
- Pre-existing analytics page prerender error in `pnpm build` (unrelated to this plan, not caused by our changes)

## User Setup Required
- Run `node scripts/generate-vapid-keys.js` to generate VAPID keys
- Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to `.env.local`
- Add `DATABASE_URL` pointing to Neon Postgres instance
- Run `scripts/push-migration.sql` against the Neon database

## Next Phase Readiness
- push-db.ts and push-sender.ts ready for API route consumption (Plan 02)
- Service worker push handling ready for client subscription (Plan 03)
- SQL migration must be run before API routes can function

## Self-Check: PASSED

All 5 created/modified files verified on disk. Both task commits (716a1e7, 4fae073) verified in git log.

---
*Phase: 11-push-notifications*
*Completed: 2026-03-23*
