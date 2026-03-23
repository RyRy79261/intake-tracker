---
phase: 11-push-notifications
plan: 02
subsystem: api
tags: [push-notifications, web-push, vapid, cron, zod, next-api-routes]

requires:
  - phase: 11-01
    provides: push-db.ts, push-sender.ts, auth-middleware.ts, Postgres schema
provides:
  - POST /api/push/subscribe (store push subscription)
  - POST /api/push/unsubscribe (remove push subscription)
  - POST /api/push/sync-schedule (replace dose schedules)
  - POST /api/push/send (cron-triggered notification dispatch)
  - subscribeToPush/unsubscribeFromPush in push-notification-service.ts
affects: [11-push-notifications]

tech-stack:
  added: []
  patterns: [dynamic-import-for-build-time-safety, cron-secret-auth]

key-files:
  created:
    - src/app/api/push/subscribe/route.ts
    - src/app/api/push/unsubscribe/route.ts
    - src/app/api/push/sync-schedule/route.ts
    - src/app/api/push/send/route.ts
  modified:
    - src/lib/push-notification-service.ts

key-decisions:
  - "Dynamic import of push-sender in send route to avoid build-time VAPID initialization failure"
  - "Object.keys() instead of Set iteration to avoid downlevelIteration requirement"
  - "BufferSource cast on Uint8Array for applicationServerKey TypeScript compatibility"

patterns-established:
  - "Dynamic import pattern: use await import() for modules with top-level side effects that fail at build time"

requirements-completed: []

duration: 20min
completed: 2026-03-23
---

# Phase 11 Plan 02: Push API Routes and Client Subscription Summary

**4 push API routes (subscribe/unsubscribe/sync-schedule/cron-send) plus client-side PushManager subscription management**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-23T14:21:42Z
- **Completed:** 2026-03-23T14:41:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Three auth-protected API routes for subscription and schedule management with Zod validation
- Cron-triggered send route that finds due doses, sends push notifications, and handles follow-up reminders
- Client-side subscribeToPush/unsubscribeFromPush that register with PushManager and sync to server
- 410 Gone automatic subscription cleanup in send route

## Task Commits

Each task was committed atomically:

1. **Task 1: Create subscribe, unsubscribe, and sync-schedule API routes** - `2b8c204` (feat)
2. **Task 2: Create send API route (cron) + extend push-notification-service.ts** - `3510a6a` (feat)

## Files Created/Modified
- `src/app/api/push/subscribe/route.ts` - Stores push subscription with Zod validation + withAuth
- `src/app/api/push/unsubscribe/route.ts` - Removes push subscription for authenticated user
- `src/app/api/push/sync-schedule/route.ts` - Replaces all dose schedules with validated data
- `src/app/api/push/send/route.ts` - Cron endpoint: queries due doses, sends push, handles follow-ups and 410 cleanup
- `src/lib/push-notification-service.ts` - Extended with subscribeToPush, unsubscribeFromPush, urlBase64ToUint8Array

## Decisions Made
- Dynamic import of push-sender.ts in send route because webpush.setVapidDetails() runs at module load time and fails during Next.js build when env vars are absent
- Used Object.keys() on a Record instead of Set iteration to comply with downlevelIteration constraint
- Cast Uint8Array as BufferSource for applicationServerKey since TypeScript's lib types don't resolve the assignability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] userId optional in VerificationResult type**
- **Found during:** Task 1
- **Issue:** auth.userId is `string | undefined` from VerificationResult, but push-db functions require `string`
- **Fix:** Added non-null assertion (`auth.userId!`) since withAuth only calls handler on success
- **Files modified:** All three Task 1 route files
- **Committed in:** 2b8c204

**2. [Rule 3 - Blocking] Build-time VAPID initialization failure**
- **Found during:** Task 2
- **Issue:** push-sender.ts calls webpush.setVapidDetails() at module top level, failing during Next.js build
- **Fix:** Changed to dynamic import (`await import("@/lib/push-sender")`) inside the handler
- **Files modified:** src/app/api/push/send/route.ts
- **Committed in:** 3510a6a

**3. [Rule 3 - Blocking] Set iteration without downlevelIteration**
- **Found during:** Task 2
- **Issue:** `for (const userId of userIds)` on a Set fails without --downlevelIteration flag
- **Fix:** Used Record<string, boolean> + Object.keys() instead of Set
- **Files modified:** src/app/api/push/send/route.ts
- **Committed in:** 3510a6a

**4. [Rule 1 - Bug] Uint8Array not assignable to BufferSource**
- **Found during:** Task 2
- **Issue:** TypeScript didn't resolve Uint8Array as BufferSource for applicationServerKey
- **Fix:** Added explicit `as BufferSource` cast
- **Files modified:** src/lib/push-notification-service.ts
- **Committed in:** 3510a6a

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking)
**Impact on plan:** All fixes necessary for build to pass. No scope creep.

## Issues Encountered
- Pre-existing /analytics prerender error unrelated to this plan (out of scope)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 API routes ready for client-side integration in Plan 03
- push-notification-service.ts has subscribeToPush/unsubscribeFromPush ready for settings UI

---
*Phase: 11-push-notifications*
*Completed: 2026-03-23*
