# Verification — 41-push-notifications

**Verdict:** minor-gaps  ·  checked 78 claims, verified 71.

All "Files covered" were read in full (`push-notification-service.ts`, `medication-notification-service.ts`,
`local-notifications.ts`, `push-sender.ts`, `push-db.ts`, the 6 API routes, `sw.ts`, the 4 UI/diagnostics
components, the 4 hooks, `schema.ts` push tables, `settings-store.ts`), plus `auth-middleware.ts`,
`auth-guard.tsx`, `api-fetch.ts`, and `use-medication-queries.ts` to chase related behavior. The document is
substantially accurate on defaults, enums, zod ranges, schema shapes, server dispatch logic, and timezone math.
The gaps are concentrated in the in-app polling fallback (Feature B): the doc conflates the in-app notification
tags with the push tags, and overstates how often the refill check actually runs.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | Feature B implies the 60 s `setInterval` loop drives both dose AND refill checks; "Refill check: runs at most once per **12 hours**" reads as a recurring throttle inside the loop. | The `setInterval` callback calls **only `checkDoseReminders()`**. `checkRefillAlerts()` is invoked **once**, at `startMedicationNotifications()` time. The 12 h throttle therefore only matters across separate app sessions — within one open session the refill check never re-fires. | `medication-notification-service.ts:199-204` (refill only at :200, interval only re-runs :203) |
| medium | "Notification payload fields … `tag` (`dose-{HH:MM}` / `expiry-reminder` / `test-notification`)" presented as the full tag set; line 122 says same-`tag` dose pushes collapse via `dose-{HH:MM}`. | The **push** path uses `dose-{HH:MM}` (correct), but the **in-app** dose reminder uses a *different* tag `dose-reminder-{HH:MM}`, and the in-app refill alert uses `refill-{id}`. Neither in-app tag is listed. So in-app and push dose notifications do NOT collapse together (different tags). | in-app dose tag `dose-reminder-${time}` `medication-notification-service.ts:45`; refill tag `refill-${id}` `:55`; push tag `dose-${row.time_slot}` `send/route.ts:69` & `check/route.ts:57` |
| low | "all push subscription/schedule/settings/check routes run under `withAuth()` (Neon-Auth cookie session, **no Bearer token**)." | `withAuth()` accepts EITHER a Bearer token OR a cookie session, and `apiFetch` **does** attach `Authorization: Bearer {token}` in Capacitor/native mode. The "no Bearer token" framing is true only for the web path. | `auth-middleware.ts:115-152` (bearer branch); `api-fetch.ts:75-76` |
| low | "Timezone capture: the client's IANA timezone is sent with each schedule sync and stored on the subscription" — Feature A (line 29) also frames subscribe as the sync-to-server step. | The `/api/push/subscribe` body carries **only** `endpoint` + `keys` (no timezone). Timezone is written exclusively by `/api/push/sync-schedule` → `updateTimezone`. A user who subscribes but never syncs a schedule keeps `timezone='UTC'`. Doc line 31 states it correctly; the data-model/subscribe framing is mildly misleading. | subscribe body `push-notification-service.ts:295-301`; tz only via sync `sync-schedule/route.ts:30-32`, `use-push-schedule-sync.ts:111` |
| low | "(searchable country picker, **~195 countries** + 'Not Specified (Global Search)')" | The `COUNTRIES` array has 197 entries total = 1 global + **196** country rows. Off by one from "~195" (within the "~" tolerance, but the digit is 196). | `medication-settings-view.tsx:34-229` (197 `value:` entries) |
| low | "the entire Dose Reminders card is hidden when the auth gate is closed (push needs auth)." | `useAuthGate()` returns `!ready || authenticated`, so the card is also **shown while auth is still loading** (`ready === false`), not only when authenticated. Hidden strictly when ready AND not authenticated. | `auth-guard.tsx:65-68`; `medication-settings-view.tsx:310,322` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | In-app **refill alert notification text** is never given: title `Refill needed: {brandName}`, body `{stock} pills left (~{daysLeft} days). Time to refill {brandName} {strength}.` (only the push dose-reminder titles are documented). | `medication-notification-service.ts:50-57` |
| low | In-app dose-reminder **does NOT use `requireInteraction` consistently with the push path's description split** — actually the in-app dose reminder IS `requireInteraction: true` (matches push), but the in-app **refill alert** sets no `requireInteraction` (defaults false). Doc's "requireInteraction: dose pushes are sticky; expiry/test are not" omits the refill case. | in-app dose `:46` (true); refill `:53-56` (omitted → false) |
| low | `getPermissionLabel()` maps `prompt → "Not set"` (not surfaced by PermissionBadge, which shows an "Enable" button for prompt). Doc's permission-state table lists prompt → "Enable" button only. Minor extra label exists. | `use-permissions.ts:243-254` |
| low | Native sync (`syncMedicationNotifications`) filters phases/prescriptions by `deletedAt === null` AND `status==="active"`/`isActive` AND schedule `enabled && deletedAt === null` — the soft-delete (`deletedAt`) filtering is an extra rule the doc's Feature C does not mention. | `local-notifications.ts:27,36,46` |
| low | `push-db.ts` exposes `getDueNotifications(currentTime,dayOfWeek,today)` — a **global, all-user** due query (distinct from `getDueNotificationsForUser`). It is defined but appears unused by the current routes (both routes use the per-user variant). Doc's sub-components list mentions "due/follow-up queries" generically but not this dead/legacy export. | `push-db.ts:38-66` |
| low | Notification **icon path** appears in three places (`push-notification-service.ts:60`, `sw.ts:57`) all `/icons/icon-192.svg`; doc states it (line 171/212). Confirmed, no gap — listed only for completeness. | `push-notification-service.ts:60`, `sw.ts:57` |
| low | `/api/push/check` logs errors under the tag `[push/check]` and returns the same shape as documented; no functional omission, noted for completeness. | `check/route.ts:115` |

## Spot-confirmed

- Web Push send options `TTL: 600`, `urgency: "high"`, VAPID contact `mailto:notifications@intake-tracker.app`. — `push-sender.ts:4,29-30`
- `410 Gone` → `deletePushSubscription` (expired-sub cleanup) in both dispatch routes. — `send/route.ts:76-77`, `check/route.ts:65-66`, `push-sender.ts:39-41`
- Push dose payload: initial title `Time for your {HH:MM} medications`, follow-up `Reminder: your {HH:MM} medications`, body = `medications_json`, tag `dose-{HH:MM}`, url `/medications?tab=schedule`. — `send/route.ts:55-58,92-95`
- `/api/push/send` cron gate: `Bearer {CRON_SECRET}`, 401 on missing/mismatch. — `send/route.ts:18-26`
- `/api/push/check` per-user dispatch under `withAuth`, returns `{ nothingDue: true }` or `{ sent, followUps }`. — `check/route.ts:17,109-113`
- Timezone math: `toLocaleTimeString("en-GB",{hour12:false})`, `toLocaleString("en-US")` → `getDay()`, `toLocaleDateString("en-CA")`; default tz `"UTC"`. — `send/route.ts:38-47`, `check/route.ts:24-33`, `push-db.ts:219-221`
- Follow-up SQL: prev index `followUpIndex-1` sent `<= NOW() - interval`, current not yet logged, `enabled=true`. — `push-db.ts:93-104`; loop `for i=1..followUpCount` — `send/route.ts:84`, `check/route.ts:73`.
- Initial-send idempotency: `NOT EXISTS` on `push_sent_log` with `follow_up_index=0` + unique index + `ON CONFLICT DO NOTHING`. — `push-db.ts:58-64,119`, `schema.ts:838-844`
- In-app dose window `diff >= 0 && diff <= 5` minutes; dedupe key `{date}-{time}-{rxId}`, pruned to today. — `medication-notification-service.ts:101-103,116,125`
- Refill math: `dailyDosage = Σ(dosage × daysOfWeek.length/7)`, `dailyPills = dailyDosage/strength`, `daysLeft = floor(stock/dailyPills)` (Infinity if no usage); alert if `daysLeft ≤ refillAlertDays` OR `stock ≤ refillAlertPills`. — `medication-notification-service.ts:165-172`
- Native Capacitor: `weekday = dow + 1`, `allowWhileIdle: true`, title `Time for {genericName}`, body `Take {dose} of {genericName}`, cancel-all-then-reschedule. — `local-notifications.ts:21-24,83,87-91`
- Expiry notify body `"{N} records will be deleted in {days} days. Export your data to save them."`, tag `expiry-reminder`, `requireInteraction: false`, default `warningDays = 7`. — `push-notification-service.ts:99,148-152`
- Test notification body `"Notifications are working correctly!"`, tag `test-notification`. — `push-notification-service.ts:160-164`
- Settings defaults (server): `enabled` true, `followUpCount` 2, `followUpIntervalMinutes` 10, `dayStartHour` 2; `/api/push/settings` hard-codes `enabled:true`, `dayStartHour:2`. — `push-db.ts:157-162`, `settings/route.ts:25-27`, `schema.ts:851-856`
- Client store defaults: `doseRemindersEnabled` false, `reminderFollowUpCount` 2, `reminderFollowUpInterval` 10, `timeFormat` "24h", regions "", `dataRetentionDays` 90 (sanitized 0–365). — `settings-store.ts:221-226,198,379`
- Expiry settings (localStorage `intake-tracker-notifications`): `enabled` false, `lastCheck` null, `checkIntervalHours` 24. — `push-notification-service.ts:168,176-180`
- zod: subscribe endpoint `.url()`, keys `.min(1)`; sync timeSlot `^\d{2}:\d{2}$`, dayOfWeek 0–6, medicationsJson `.min(1)`, timezone optional; settings followUpCount 0–10, interval 1–60. — `subscribe/route.ts:7-13`, `sync-schedule/route.ts:7-16`, `settings/route.ts:6-9`
- UI selects: follow-up None/1/2/3; interval 5/10/15/20/30; time format 24h/12h; interval select gated on `reminderFollowUpCount > 0`. — `medication-settings-view.tsx:363-366,382-386,409-410,371`
- Schema FKs all `onDelete:"cascade"` → `usersSync.id`; `push_subscriptions.userId` unique; `push_subscriptions.timezone` default "UTC"; unique indexes on schedules `(userId,timeSlot,dayOfWeek)` and sent_log `(userId,timeSlot,sentDate,followUpIndex)`; `push_settings.userId` is PK. — `schema.ts:791-857`
- SW `push` handler: `requireInteraction:true`, icon `/icons/icon-192.svg`, stores `data.url`; `notificationclick` focuses an existing `/medications` window then `navigate(url)`, else `openWindow`; `SKIP_WAITING` honored only same-origin. — `sw.ts:43-87`
- Diagnostics: Skip-waiting disabled unless `sw.waitingState`; Clear-caches disabled when 0 caches; test button disabled unless `permission==="granted"`; Refresh spins while busy. — `service-worker-diagnostics.tsx:260,269,299,220`
- `useDoseReminderToggle`: ON requests permission → if not granted, return (toggle stays off); subscribe → if null, return; else set true. OFF unsubscribes + set false. Switch disabled when unsupported or toggling. — `use-push-schedule-sync.ts:181-204`, `medication-settings-view.tsx:344`

## Low-confidence / could-not-verify

- The doc's framing that the foreground `/api/push/check` ping "complements the cron" is plausible but the actual production cron wiring (vercel.json / CRON_SECRET deployment) was not in scope of the listed files; the `send` route's cron gate is confirmed but the schedule that calls it was not verified.
- "VAPID key … converts `NEXT_PUBLIC_VAPID_PUBLIC_KEY` from URL-safe base64" is confirmed in `subscribeToPush` (`urlBase64ToUint8Array`); the env var's actual presence at runtime is environment-dependent and not verifiable from source.
- Whether `getDueNotifications` (global variant, `push-db.ts:38-66`) is truly dead code: confirmed neither `send` nor `check` route imports it, but a repo-wide caller outside the listed files was not exhaustively grepped.
