# 41 — Push & Medication Notifications

**Files covered:**
- `src/lib/push-notification-service.ts` (browser Notification API, permission, expiry alerts, push subscribe/unsubscribe)
- `src/lib/medication-notification-service.ts` (in-app dose-reminder + refill-alert polling loop)
- `src/lib/local-notifications.ts` (Capacitor native local notifications for installed app)
- `src/lib/push-sender.ts` (server-side web-push VAPID sender)
- `src/lib/push-db.ts` (Neon Postgres CRUD for subscriptions, schedules, settings, sent-log)
- `src/hooks/use-notification-queries.ts` (thin re-export of expiry settings helpers)
- `src/hooks/use-medication-notifications.ts` (mount/unmount lifecycle for med notifications)
- `src/hooks/use-push-schedule-sync.ts` (`usePushScheduleSync` + `useDoseReminderToggle`)
- `src/app/api/push/subscribe/route.ts`, `unsubscribe/route.ts`, `sync-schedule/route.ts`, `settings/route.ts`, `check/route.ts`, `send/route.ts`
- `src/app/sw.ts` (service-worker `push` / `notificationclick` handlers)
- `src/components/medications/medication-settings-view.tsx` (Dose Reminders settings UI)
- `src/components/settings/permissions-section.tsx` (Notifications permission + Expiry Reminders toggle)
- `src/components/permission-badge.tsx` (permission status badge)
- `src/components/debug/service-worker-diagnostics.tsx` (SW + push diagnostics panel)
- `src/hooks/use-permissions.ts` (notification permission state)
- `src/db/schema.ts` (push_subscriptions, push_schedules, push_sent_log, push_settings)
- `src/stores/settings-store.ts` (dose-reminder preferences)

**Purpose:** Delivers two distinct reminder systems — (1) **medication dose reminders** (server-driven Web Push, plus an in-app polling fallback and a Capacitor native-notification path) and (2) **local data-expiry reminders** (browser Notification API). It covers permission requests, push subscribe/unsubscribe, per-user schedule sync, timezone-aware server dispatch with follow-up nags, and the settings UI to configure all of it.

---

## Features

### A. Medication dose reminders (Web Push, server-driven — the primary path)
- **Subscribe/unsubscribe** to Web Push via the browser `PushManager`, syncing the subscription (endpoint + p256dh + auth keys) to Neon Postgres keyed by Neon-Auth `userId`.
- **Per-user dose schedule sync:** the app computes the day's dose slots (`useDailyDoseSchedule`) and POSTs a flattened schedule (time slot × day-of-week × medication label list) to the server, where it is mirrored into `push_schedules`.
- **Timezone capture:** the client's IANA timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) is sent with each schedule sync and stored on the subscription so server-side dispatch uses the user's local time.
- **Server dispatch** (`/api/push/send`, cron-secret gated): for every subscribed user, computes their current local `HH:MM`, weekday, and date; finds dose slots due *now* that haven't been sent today; sends a Web Push; logs to `push_sent_log` (follow-up index 0).
- **Follow-up "nag" reminders:** after the initial reminder, sends up to N follow-ups at a fixed interval if the previous follow-up was sent ≥ interval minutes ago and this one hasn't been sent yet. Configurable count (0–10) and interval (1–60 min).
- **Per-request self-check** (`/api/push/check`, auth-cookie gated): the foreground app pings every 60 s; the endpoint runs the same due/follow-up dispatch but only for the *calling* user. This is the in-foreground delivery driver (complements the cron).
- **Expired-subscription cleanup:** a `410 Gone` response from the push service deletes that user's subscription row automatically.
- **Notification payload:** title `Time for your {HH:MM} medications` (initial) / `Reminder: your {HH:MM} medications` (follow-up), body = comma-joined medication labels with doses, tag `dose-{HH:MM}`, deep-link URL `/medications?tab=schedule`.
- **Service-worker rendering:** the SW `push` handler shows the notification with the app icon, `requireInteraction: true`, and stores the deep-link URL; `notificationclick` focuses an existing `/medications` window (and navigates it) or opens a new one.

### B. Medication reminders (in-app polling fallback — `medication-notification-service.ts`)
- Runs a **60-second `setInterval` loop** while the app is open; on start it immediately runs once.
- **Dose check:** every minute, finds active prescriptions → active phases → enabled schedules whose `daysOfWeek` includes today and whose scheduled time is within a **0–5 minute window** of now; fires a single grouped local notification listing all due meds. Dedupes per `{date}-{time}-{prescriptionId}` so a dose fires once per day.
- **Refill check:** runs at most once per **12 hours**; for each active prescription with an active inventory, computes days-of-supply remaining and alerts when stock ≤ `refillAlertDays` (in days) or ≤ `refillAlertPills` (in pills). Dedupes per prescription id.
- Dedupe state and last-check timestamps persisted to `localStorage` (`intake-tracker-med-notifications`); the notified-doses list is pruned to today's keys each run.

### C. Native local notifications (Capacitor — installed app only)
- When running as a native (Capacitor) app, requests native local-notification permission and **pre-schedules** repeating weekly notifications (one per schedule × day-of-week) directly on the OS, so reminders fire even when the app is closed and offline.
- Cancels all previously-pending notifications and re-schedules from scratch on each sync. Uses `allowWhileIdle: true`. Weekday is offset (`dow + 1`) to match Capacitor's 1=Sunday convention vs the app's 0=Sunday.
- Title `Time for {genericName}`, body `Take {dose} of {genericName}`.

### D. Data-expiry reminders (local, browser Notification API)
- Computes records approaching deletion: counts intake / weight / blood-pressure records falling inside the warning window (older than `retentionDays − warningDays`, still within retention).
- Fires a single local notification: *"{N} records will be deleted in {days} days. Export your data to save them."* (tag `expiry-reminder`).
- Throttled by a configurable check interval (default 24 h) tracked via `lastCheck` in `localStorage`.
- **Test notification** button sends a "Notifications are working correctly!" sample.

### E. Permissions & diagnostics
- Request/inspect the browser notification permission (`granted` / `denied` / `default`).
- A debug "Service Worker & Push" panel shows SW support/registration/scope/script-URL/active-waiting-installing states, cache names, push support, permission, subscribed status, endpoint, and a "Send test notification" action; plus SW actions (force update, skip waiting, clear caches, unregister).

---

## User actions & interactions

### Medication Settings view (`/medications` → Settings tab)
- **Toggle "Enable Reminders" (Switch):**
  - ON → requests notification permission; if granted, subscribes to push, persists `doseRemindersEnabled = true`. If permission denied or subscribe fails, the toggle silently does not turn on.
  - OFF → unsubscribes from push (browser + server) and persists `doseRemindersEnabled = false`.
  - Disabled when notifications unsupported or while a toggle is in flight.
- **Select "Follow-up reminders"** → options None / 1 / 2 / 3 follow-ups; change syncs to server settings.
- **Select "Reminder interval"** (only when follow-up count > 0) → Every 5 / 10 / 15 / 20 / 30 minutes; syncs to server.
- **Select "Time Format"** → 24-hour (14:00) / 12-hour (2:00 PM) (display preference; affects how times render).
- **Primary / Secondary Region comboboxes** (searchable country picker, ~195 countries + "Not Specified (Global Search)") — used by AI medicine search, co-located in this view.

### Settings → Permissions section
- **"Enable" notification permission** (PermissionBadge) → triggers `requestNotificationPermission`; success toast on grant, error toast on failure.
- **Expiry Reminders On/Off button** (shown only when notifications granted) → toggles `enabled` in expiry settings; success toast; reverts on save failure.
- **"Test" button** (shown only when expiry reminders on) → sends a test notification; success/failure toast.
- Microphone permission row is adjacent (voice input; separate feature).

### Debug panel
- **Refresh** → re-reads SW + push state.
- **Force update check / Skip waiting / Clear caches / Unregister** SW actions.
- **Send test notification** → fires a local test (disabled unless permission granted).

### Implicit / background actions
- On app mount, `useMedicationNotifications` starts the polling loop and `usePushScheduleSync` syncs schedule + pings `/api/push/check` every 60 s while enabled.
- Tapping a delivered push notification opens/focuses `/medications?tab=schedule`.

---

## States & presentations

### Dose-reminders toggle row (Medication Settings)
- **Unsupported browser:** helper text "Notifications not supported in this browser"; Switch disabled.
- **Signed out + not enabled:** helper text "Sign in to enable push reminders across devices"; the entire Dose Reminders card is hidden when the auth gate is closed (push needs auth).
- **Default (supported, signed in, off):** helper "Get push notifications when medications are due".
- **Toggling (in flight):** Switch disabled until subscribe/unsubscribe resolves.
- **Enabled / active:** Switch on; reveals the Follow-up count select.
- **Follow-up > 0:** additionally reveals the Reminder interval select.
- **Follow-up = None:** interval select hidden.
- **Permission denied after prompt:** toggle stays OFF (no error surfaced inline).

### Permissions section
- **PermissionBadge states:** `granted` → green "Enabled" with check icon; `denied` → red "Blocked" + optional "Reset"; `unavailable` → grey "Not available"; `prompt` → "Enable" button.
- **Expiry Reminders:** only visible when notifications granted; button shows "On" (default variant) / "Off" (outline); "Test" ghost button appears only when On.
- **Toasts:** success (enabled/disabled/test sent), destructive (request failed / save failed / test failed).

### Push delivery states (server)
- **Nothing due:** `/api/push/check` returns `{ nothingDue: true }`.
- **Sent:** returns `{ sent, followUps }` counts.
- **Subscription expired (410):** subscription deleted; no error to user.
- **Unauthorized:** `/api/push/send` returns 401 if cron secret missing/mismatched; auth-gated routes 401 via `withAuth`.
- **Validation error:** subscribe/sync/settings return 400 with zod error details on malformed body.
- **Server error:** 500 with generic error message.

### Diagnostics panel
- Per-field rows render "yes/no", state strings, or "none"; SW action buttons disabled contextually (e.g. Skip waiting disabled unless a waiting worker exists; test notification disabled unless permission granted); Refresh button spins while busy.

### Notification visual states (system-rendered)
- **Initial dose reminder** vs **follow-up reminder** differ by title prefix ("Time for…" vs "Reminder:…").
- **requireInteraction:** dose pushes are sticky (`requireInteraction: true`); expiry/test notifications are not.
- Notifications with the same `tag` (`dose-{HH:MM}`) collapse/replace each other.

---

## Enums, options & configurable values

### Notification permission states
`"granted" | "denied" | "default"` (service); UI permission state: `"granted" | "denied" | "prompt" | "unavailable"`.

### Dose-reminder settings (client — `settings-store.ts`)
- `doseRemindersEnabled` — default **false**.
- `reminderFollowUpCount` — default **2**. UI options: **0 (None), 1, 2, 3**. Server zod range **0–10**.
- `reminderFollowUpInterval` (minutes) — default **10**. UI options: **5, 10, 15, 20, 30**. Server zod range **1–60**.
- `timeFormat` — `"12h" | "24h"`, default **"24h"**.
- `primaryRegion` / `secondaryRegion` — ISO-3166 country code or "" (global), default **""**.

### Server push settings (`push_settings` / `PushSettings`)
- `enabled` — default **true**.
- `followUpCount` — default **2**.
- `followUpIntervalMinutes` — default **10**.
- `dayStartHour` — default **2** (hard-coded to 2 on writes from `/api/push/settings`).

### Expiry-notification settings (`NotificationSettings`, localStorage)
- `enabled` — default **false**.
- `lastCheck` — default **null**.
- `checkIntervalHours` — default **24**.
- `warningDays` parameter — default **7**.
- `retentionDays` source: `dataRetentionDays` store default **90** (sanitized 0–365).

### In-app polling constants (`medication-notification-service.ts`)
- Dose-due window: **0 to 5 minutes** past scheduled time.
- Poll interval: **60 s** (`setInterval`).
- Refill re-check throttle: **12 hours**.

### Foreground push-check ping
- Interval: **60 s** (`/api/push/check`).

### Day-of-week encoding
- App / Dexie / `push_schedules`: **0=Sunday … 6=Saturday** (`getDay()`); zod `dayOfWeek` range **0–6**.
- Capacitor native: **1=Sunday … 7=Saturday** (offset `dow + 1`).

### Web Push send options (`push-sender.ts`)
- `TTL: 600` seconds, `urgency: "high"`.
- VAPID contact: `mailto:notifications@intake-tracker.app`.

### Time-slot format
- `HH:MM` 24-hour, zod-validated `^\d{2}:\d{2}$`.

### Notification payload fields
- `title`, `body`, `tag` (`dose-{HH:MM}` / `expiry-reminder` / `test-notification`), `url` (default `/medications?tab=schedule`), `icon` (`/icons/icon-192.svg`), `requireInteraction`.

### Refill-alert thresholds (per inventory item)
- `refillAlertDays` (days-of-supply threshold) and/or `refillAlertPills` (pill-count threshold) — either may trigger.

---

## Data model touched

### Neon Postgres (server, `schema.ts` / `push-db.ts`)
- **`push_subscriptions`** — `id`, `userId` (unique, FK→usersSync, cascade), `endpoint`, `p256dh`, `authKey`, `timezone` (default "UTC"), `createdAt`, `updatedAt`. One row per user (upsert on conflict by userId).
- **`push_schedules`** — `id`, `userId` (FK), `timeSlot`, `dayOfWeek`, `medicationsJson`; unique index on (userId, timeSlot, dayOfWeek). Full replace on sync (delete-all then insert).
- **`push_sent_log`** — `id`, `userId` (FK), `timeSlot`, `sentDate` (date), `followUpIndex` (default 0), `sentAt`; unique index on (userId, timeSlot, sentDate, followUpIndex). Prevents duplicate sends.
- **`push_settings`** — `userId` (PK, FK), `enabled` (default true), `followUpCount` (default 2), `followUpIntervalMinutes` (default 10), `dayStartHour` (default 2).

### IndexedDB / Dexie (read for reminder computation)
- `prescriptions` (read `isActive`, `genericName`, `compounds`, `id`), `medicationPhases` (read `status: "active"`, `unit`, `prescriptionId`), `phaseSchedules` (read `enabled`, `daysOfWeek`, `time`, `scheduleTimeUTC`, `dosage`, `deletedAt`), `inventoryItems` (read `currentStock`, `strength`, `unit`, `brandName`, `isActive`, `isArchived`, `refillAlertDays`, `refillAlertPills`, `compounds`).
- `intakeRecords`, `weightRecords`, `bloodPressureRecords` (read `timestamp` for expiry counting).

### localStorage keys
- `intake-tracker-notifications` (expiry settings), `intake-tracker-med-notifications` (in-app dedupe state), `intake-tracker-mic-permission` (mic only). Dose-reminder prefs live in the persisted Zustand settings store.

### Browser/native APIs
- `Notification`, `ServiceWorkerRegistration.showNotification`, `PushManager` (subscribe/getSubscription/unsubscribe), Capacitor `LocalNotifications`.

---

## Validation, edge cases & business rules

- **Auth requirement:** all push subscription/schedule/settings/check routes run under `withAuth()` (Neon-Auth cookie session, no Bearer token). `/api/push/send` instead requires a `Bearer {CRON_SECRET}` header (cron-only). The Dose Reminders settings card is hidden entirely when signed out.
- **Permission gating:** every notification path no-ops unless `Notification.permission === "granted"`. Subscribe no-ops if `serviceWorker`/`PushManager` unavailable.
- **VAPID key:** subscribe converts `NEXT_PUBLIC_VAPID_PUBLIC_KEY` from URL-safe base64 to `Uint8Array`; `userVisibleOnly: true`.
- **Re-subscribe safety:** subscribe re-sends an existing subscription to the server (covers server-side loss); unsubscribe tolerates a missing subscription.
- **Timezone correctness:** server computes each user's local `HH:MM` / weekday / date from the stored timezone using `toLocaleTimeString("en-GB", hour12:false)`, `toLocaleString("en-US")`, and `toLocaleDateString("en-CA")` (ISO date). Default timezone "UTC" if none stored.
- **Dedupe / idempotency:** initial send keyed by `followUpIndex = 0`; `push_sent_log` unique constraint + `getDueNotifications` `NOT EXISTS` guard prevent duplicate initial sends per day. Follow-up i fires only if i−1 was logged ≥ interval ago and i not yet logged.
- **In-app dose window:** fires only within 0–5 min after the scheduled minute (avoids re-firing late and avoids firing early); per-day dedupe via `{date}-{time}-{rxId}` keys, pruned to today.
- **Refill math:** `dailyDosage = Σ(dosage × daysOfWeek.length/7)`; `dailyPills = dailyDosage / strength`; `daysLeft = floor(stock / dailyPills)` (Infinity when no daily usage). Alerts if `daysLeft ≤ refillAlertDays` OR `stock ≤ refillAlertPills`. Refill check throttled to once / 12 h.
- **Compound (combo) meds:** dose text rendered via `formatCompoundShort(splitDose(...))` when `isCombo`, else `{dosage}{unit}`.
- **Schedule sync debounce:** client hashes `{entries, followUpCount, followUpInterval}` and skips re-sync when unchanged; if no `daysOfWeek` specified, defaults to all 7 days; multiple meds at the same time slot are grouped into one comma-joined label.
- **Expiry window:** counts records with `timestamp < (now − (retentionDays − warningDays))` and `≥ (now − retentionDays)`; days-until-expiry derived from oldest expiring record; no notification when zero expiring. Throttled by `checkIntervalHours` via `lastCheck`.
- **Expired subscription (410):** removed server-side; no user-facing error.
- **Icons:** PNG preferred; badge deliberately omitted (Android needs a monochrome PNG; SVG badges render as white circles). Default icon `/icons/icon-192.svg`.
- **SW message origin check:** `SKIP_WAITING` honoured only from same-origin clients.
- **Validation (zod):** subscribe — endpoint must be a URL, p256dh/auth non-empty; sync-schedule — timeSlot `HH:MM`, dayOfWeek 0–6, medicationsJson non-empty, timezone optional; settings — followUpCount 0–10, followUpIntervalMinutes 1–60.

---

## Sub-components / variants

- **`push-notification-service.ts`** — browser Notification API wrapper: support check, permission, `showNotification` (SW-first w/ direct fallback), expiry check/notify, expiry settings persistence, push subscribe/unsubscribe.
- **`medication-notification-service.ts`** — in-app 60 s polling loop for dose reminders + 12 h refill alerts (start/stop lifecycle).
- **`local-notifications.ts`** — Capacitor native pre-scheduled weekly local notifications (installed-app path).
- **`push-sender.ts`** — server `web-push` VAPID sender; returns `{success, statusCode}`, flags 410.
- **`push-db.ts`** — Neon SQL CRUD: save/delete subscription, sync schedules, get/save settings, due/follow-up queries, sent-log, timezone get/update, all-subscribed-user-ids.
- **`use-push-schedule-sync.ts`** — `usePushScheduleSync` (schedule + settings sync, 60 s `/check` ping) and `useDoseReminderToggle` (`{handleToggle, toggling, supported}`).
- **`use-medication-notifications.ts`** — mounts/unmounts the polling loop + schedule sync.
- **`use-notification-queries.ts`** — `useNotificationSettings` re-export (`getSettings`, `saveSettings`, `sendTest`) for the expiry UI.
- **`use-permissions.ts`** — notification + microphone permission state machine.
- **API routes:** `subscribe` (save sub), `unsubscribe` (delete sub), `sync-schedule` (replace schedules + timezone), `settings` (save follow-up settings), `check` (per-user foreground dispatch), `send` (cron-secret all-user dispatch).
- **`sw.ts`** — service-worker `push` (render) + `notificationclick` (focus/open `/medications`) + `SKIP_WAITING` handlers.
- **`medication-settings-view.tsx`** — Dose Reminders card (toggle, follow-up count, interval) + Display + Localization sections; `CountryCombobox` sub-component.
- **`permissions-section.tsx`** — notification permission row + Expiry Reminders On/Off + Test.
- **`permission-badge.tsx`** — Enabled / Blocked+Reset / Not available / Enable badge variants.
- **`service-worker-diagnostics.tsx`** — SW + push debug panel with test-notification action.
