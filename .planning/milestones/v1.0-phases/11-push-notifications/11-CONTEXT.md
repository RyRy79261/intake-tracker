# Phase 11: Push Notifications - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement server-sent push notifications for scheduled medication doses on Android/PWA. Notifications fire at dose times even when the app is closed, with configurable follow-up reminders. Tap navigates to the schedule view. Existing notification service layer gets extended, service worker gets push event handling, server gets subscription management and a cron-based push sender.

</domain>

<decisions>
## Implementation Decisions

### Notification scheduling mechanism
- **Web Push API with server-side scheduling**
- Client: registers a push subscription via the Push API, sends subscription to server
- Server: stores push subscriptions and dose schedules
- Server cron/scheduler fires at dose times, sends push via `web-push` npm library
- Service worker receives push event, shows notification
- Works reliably on Android even when app is fully closed
- Requires VAPID key pair (generated once, stored in env)
- Server-side storage: existing Neon Postgres database (already in `.env.local`)

### Notification content & behavior
- **Grouped by time slot**: one notification per scheduled time, listing all meds at that time
- Title: "Time for your 08:30 medications"
- Body: medication names with dosages (e.g., "Venlafaxine 150mg, Spironolactone 25mg")
- Tag: per time slot (prevents duplicate notifications for same slot)
- `requireInteraction: true` — notification stays until dismissed
- Tap action: opens `/medications` with schedule tab focused
- **Follow-up reminders**: if dose not taken, 2 additional reminders at 10-min intervals (configurable)
- No notifications for missed doses from previous days (respects day-start-hour setting)

### Settings & user control
- Global enable/disable toggle in medication settings
- Follow-up reminder count: configurable (default 2)
- Follow-up interval: configurable (default 10 minutes)
- Settings stored in Zustand settings store (already has medication settings section)
- Respects `dayStartHour` — no notifications fired for "yesterday" doses based on user's day boundary

### Claude's Discretion
- VAPID key generation approach (CLI script vs runtime generation)
- Database schema for push subscriptions (new Postgres table vs Dexie)
- Cron implementation: Next.js API route with external cron (e.g., Vercel cron), or standalone scheduler
- Whether follow-up reminders check if dose was actually taken (requires server to query client state, or client to report dose-taken events)
- Notification icon and badge assets
- How to handle subscription expiry/renewal

</decisions>

<canonical_refs>
## Canonical References

### Existing notification infrastructure
- `src/lib/push-notification-service.ts` — Permission handling, `showNotification()`, notification support detection. Extend this.
- `src/lib/medication-notification-service.ts` — `showDoseReminder()`, `showRefillAlert()`, localStorage state tracking. Extend this.
- `worker/index.js` — Custom service worker (merged with next-pwa generated SW). Add push event listener here.

### Server infrastructure
- `src/app/api/` — Existing API routes pattern (withAuth, rate limiting)
- `.env.local` — Neon Postgres connection strings already configured
- `next.config.js` — next-pwa configuration for service worker

### Schedule data
- `src/lib/dose-schedule-service.ts` — `getDoseScheduleForDate()` generates today's dose slots
- `src/hooks/use-medication-queries.ts` — `useDailyDoseSchedule` hook
- Settings store: `dayStartHour` for day boundary calculation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `push-notification-service.ts`: Already handles permission requests, `showNotification()` with service worker fallback, notification support detection
- `medication-notification-service.ts`: Already has `showDoseReminder()` that formats medication names and times, `notifiedDoses` state tracking to prevent duplicates
- `worker/index.js`: Service worker scaffold already exists, just needs push event handler
- `getDoseScheduleForDate()`: Returns all dose slots for a date — can be used server-side to determine what to notify about

### Key Challenges
- **Server-side schedule access**: Dose schedules are in client-side IndexedDB. Server needs its own copy of schedule data to know when to send pushes. Options: client syncs schedule to server, or server queries Dexie Cloud (not available).
- **Dose-taken detection for follow-ups**: To stop reminders after dose is taken, either client reports to server, or reminders fire regardless and client dismisses them locally.
- **next-pwa service worker merging**: `worker/index.js` is merged with generated SW — push event handler goes here.

### Integration Points
- New API routes: `POST /api/push/subscribe`, `POST /api/push/unsubscribe`, `GET/POST /api/push/send` (cron endpoint)
- New Postgres table: `push_subscriptions` (endpoint, keys, user schedule data)
- Settings store: add `doseRemindersEnabled`, `reminderFollowUpCount`, `reminderFollowUpInterval`
- Medication settings UI: add reminder settings section

</code_context>

<specifics>
## Specific Ideas

- User mentioned wanting 2 extra notifications with 10-minute gaps after the initial reminder
- After the last follow-up, if still not taken, it becomes a "missed" dose on the schedule view (no more notifications)
- The 30-minute late-dose threshold (from dose-row.tsx) should align with the notification window

</specifics>

<deferred>
## Deferred Ideas

- Per-prescription notification opt-out — keep for future if needed
- iOS support — Web Push on iOS requires different handling (Safari push)
- Rich notification actions (Take/Skip buttons on the notification itself) — possible future enhancement

</deferred>

---

*Phase: 11-push-notifications*
*Context gathered: 2026-03-23*
