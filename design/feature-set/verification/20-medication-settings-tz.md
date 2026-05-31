# Verification — 20-medication-settings-tz

**Verdict:** accurate · checked 78 claims, verified 75.

All "Files covered" source files were read in full (medication-settings-view.tsx,
medication-settings-section.tsx, timezone-change-dialog.tsx, timezone.ts,
use-timezone-detection.ts, timezone-recalculation-service.ts,
medication-notification-service.ts, use-medication-notifications.ts,
use-push-schedule-sync.ts) plus the supporting reads (settings-store.ts,
auth-guard.tsx, push-notification-service.ts, db.ts types, providers.tsx,
medications/page.tsx, settings/page.tsx, audit-service.ts). The document is
highly accurate; the few deviations are cosmetic count/labeling nits.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | Rich combobox has "~195 ISO 3166-1 countries" / "~195 ISO 3166-1 alpha-2 entries" (lines 35, 139). | There are exactly **194** ISO entries plus 1 global sentinel (195 total `{ value: ... }` rows). Doc uses "~" so it is approximate, but the precise ISO count is 194, not 195. | medication-settings-view.tsx:34-229 |
| low | Refill notification text described only as "{brand}" with pills-left and days-left (line 58, 86). The body also embeds a dosage strength which the doc never mentions for refills. | Body is `${currentStock} pills left (~${daysLeft} days). Time to refill ${brandName} ${dosageStrength}.` — uses inventory `strength`+`unit` (or compound short), not the schedule dosage. Minor omission of the strength substring, not a contradiction. | medication-notification-service.ts:50-57, 175-183 |
| low | Helper text (line 27) quoted as "Additional reminders if dose not confirmed." with trailing period. | Code string has **no trailing period**: `Additional reminders if dose not confirmed`. | medication-settings-view.tsx:352-354 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The rich-view "Primary/Secondary Region" helper texts are specific strings the doc paraphrases but does not quote: primary = "This is used by the AI to search for local brand names and alternatives when adding a new medication."; secondary = "Used as a fallback for finding medication alternatives." | medication-settings-view.tsx:424-426, 432-434 |
| low | Compact Settings-section helper text differs from the rich view: primary helper there is "Used to find local medication alternatives in search results." (doc lumps both as "muted helper text about finding/falling-back"). | medication-settings-section.tsx:41-43, 59-61 |
| low | `CountryCombobox` is keyed `country.value || "__global__"` and `CommandItem value={country.label}` (search filters on label) — doc says "Filters the country list by label" (correct) but the `__global__` key detail / label-as-value wiring is unstated. Cosmetic. | medication-settings-view.tsx:271-272 |
| low | `useDoseReminderToggle` returns `supported` computed as `typeof window !== "undefined" && isNotificationSupported()`; the toggle handler `console.error`s on thrown errors and `console.warn`s when push subscription returns null. Doc says "silently reverts" (true for UX) but there is console logging. | use-push-schedule-sync.ts:179, 191, 200 |
| low | `MIGRATION_TIMEZONE_CUTOFF` / `getTimezoneForTimestamp` are v11-migration backfill helpers (doc lists the cutoff value correctly) — the doc does not state these are unused by the settings/timezone-change runtime path (only by migration). Context-only. | timezone.ts:128-140 |
| low | Refill alert: when there is no `i.isActive && !i.isArchived` inventory, the dose-reminder path falls back to `activeInv[0]` for the *name*, but the refill path `continue`s (no fallback). Doc treats "active (non-archived) inventory item" uniformly. | medication-notification-service.ts:106 vs 159-162 |

## Spot-confirmed

- Reminders card gated by `useAuthGate()` (hidden only when `ready && !authenticated`); `useAuthGate` returns `!ready || authenticated`. medication-settings-view.tsx:310,322; auth-guard.tsx:65-68.
- Helper-text 3-way branch: unsupported → "Notifications not supported in this browser"; signed-out & off → "Sign in to enable push reminders across devices"; else → "Get push notifications when medications are due". medication-settings-view.tsx:332-338. (Confirms States lines 95-97.)
- Switch disabled when `!notificationsSupported || togglingReminders`. medication-settings-view.tsx:344.
- Follow-up select renders only when `doseRemindersEnabled`; interval select only when also `reminderFollowUpCount > 0`. medication-settings-view.tsx:348-390.
- Follow-up options 0=None,1=1 follow-up,2=2 follow-ups,3=3 follow-ups. medication-settings-view.tsx:363-366.
- Interval options Every 5/10/15/20/30 minutes. medication-settings-view.tsx:382-386.
- Time-format options "24h"→"24-hour (14:00)", "12h"→"12-hour (2:00 PM)". medication-settings-view.tsx:409-410.
- Header "Medication Settings" + subtitle, `pb-24`. medication-settings-view.tsx:313-318.
- Compact section icon `Pill`, heading "Medication"; primary defaults display "US" (`primaryRegion || "US"`), secondary "None" (`secondaryRegion || "None"`); fixed list US/UK/CA/AU/DE/ZA/Other + None. medication-settings-section.tsx:8-16,24-25,31,48,53.
- Settings store defaults digit-for-digit: primaryRegion `""`, secondaryRegion `""`, timeFormat `"24h"`, doseRemindersEnabled `false`, reminderFollowUpCount `2`, reminderFollowUpInterval `10`. settings-store.ts:221-226.
- Timezone dialog: title "Timezone Changed", travel sentence via `formatTimezoneCityName` (last `/` segment, `_`→space, fallback to raw), reassurance panel "Your dose times will stay at the same wall-clock times (e.g. 08:00 stays 08:00) in your new timezone.", `Loader2` + "Adjusting..." while recalculating, both buttons disabled. timezone-change-dialog.tsx:19-21,53-77.
- Detection: bust cache + re-read `Intl...timeZone`, load `phaseSchedules`, keep `enabled === true`, unique `anchorTimezone` set, prompt if any differs; early-return on `_dismissedThisSession`, empty active set, or DB error (silent catch). use-timezone-detection.ts:60-92. Runs on mount + `visibilitychange`→visible. use-timezone-detection.ts:121-136.
- Detection mounted globally via `TimezoneGuard` in providers (not the medications page). providers.tsx:27-50,90.
- handleConfirm success toast `Schedules adjusted to ${cityName}`; failure destructive toast "Schedule adjustment failed" / "Your dose times have not changed. Try reopening the app." use-timezone-detection.ts:98-109.
- Recalc: transaction over `[phaseSchedules, auditLogs, _syncQueue]`, only `enabled === true && anchorTimezone !== newTimezone`, writes scheduleTimeUTC/anchorTimezone/time/updatedAt + `enqueueInsideTx("phaseSchedules",…,"upsert")`; audit only if `updatedCount > 0` with `buildAuditEntry("timezone_adjusted", { newTimezone, schedulesUpdated })`; `schedulePush()` after tx if updated. timezone-recalculation-service.ts:30-71; audit-service.ts:22.
- UTC-minutes wrap `((x % 1440) + 1440) % 1440`. timezone.ts:76,88.
- Offset via `toLocaleString` UTC-vs-TZ diff, no external lib. timezone.ts:47-55.
- SSR fallback timezone `"UTC"`. timezone.ts:20.
- `MIGRATION_TIMEZONE_CUTOFF` = `2026-02-12T00:00:00Z`; before→`Africa/Johannesburg`, on/after→`Europe/Berlin`. timezone.ts:128-140.
- Local notifications: interval `60 * 1000`; dose-due window `diff >= 0 && diff <= 5` minutes; dedupe key `${todayKey}-${schedule.time}-${prescription.id}`, pruned to today; `requireInteraction: true`, tag `dose-reminder-${time}`; title "Time for your {time} medications". medication-notification-service.ts:43-47,102-103,121-126,202-204.
- Refill: throttle `12 * 60 * 60 * 1000`; `dailyDosage = Σ dosage*(daysOfWeek.length/7)`; `dailyPills = dailyDosage/strength` (0 if strength≤0); `daysLeft = dailyPills>0 ? floor(stock/dailyPills) : Infinity`; alert when `daysLeft <= refillAlertDays` OR `stock <= refillAlertPills` (each guarded by `!== undefined`); per-prescription dedupe; tag `refill-${id}`. medication-notification-service.ts:135,165-185.
- Combo dose text via `formatCompoundShort(splitDose(...))`, single via `${schedule.dosage}${phase.unit}`. medication-notification-service.ts:109-111.
- Push sync no-ops unless `authenticated && doseRemindersEnabled && slots.length`; entries grouped by `localTime`, days expanded, default `[0..6]` when none; POST `/api/push/sync-schedule` with `Intl...timeZone`; debounced by JSON hash of `{entries, followUpCount, followUpInterval}`. use-push-schedule-sync.ts:78,120-133.
- `/api/push/check` ping every `60_000` ms while enabled. use-push-schedule-sync.ts:136-148.
- `/api/push/settings` POST `{followUpCount, followUpIntervalMinutes}` on change, debounced by hash. use-push-schedule-sync.ts:151-168.
- Failures in sync/ping/settings are `console.warn` only (fail-soft). use-push-schedule-sync.ts:113-114,140-142,165-167.
- `NotificationPermissionState = "granted" | "denied" | "default"`. push-notification-service.ts:10.
- localStorage key `intake-tracker-med-notifications` with `{lastDoseCheck,lastRefillCheck,notifiedDoses[],notifiedRefills[]}`. medication-notification-service.ts:6-13.
- `PhaseSchedule` carries `scheduleTimeUTC` (canonical), `time` (`@deprecated`, v10 compat), `anchorTimezone`, `enabled`, `dosage`, `daysOfWeek`, `unit?`. db.ts:209-224.
- `useMedicationNotifications` mounts `usePushScheduleSync` and start/stop the loop; mounted on medications page. use-medication-notifications.ts:15-23; medications/page.tsx:25.
- `useDoseReminderToggle` toggle-on path: request permission → must be "granted" → `subscribeToPush()` non-null → set enabled; off path unsubscribes; `toggling` busy flag. use-push-schedule-sync.ts:176-207.

## Low-confidence / could-not-verify

- "~195 countries" — the alphabetical span "Afghanistan AF … Zimbabwe ZW" is confirmed and the count is precisely 194 ISO + 1 sentinel; flagged as low-severity since the doc hedges with "~".
- The server-side behavior of `/api/push/sync-schedule`, `/api/push/check`, `/api/push/settings` (Postgres subscription state) was not inspected — out of scope for the listed client files; doc's client-side description of these calls is confirmed.
- "Governs how dose/schedule times render across the medication UI" (timeFormat, line 32) — confirmed the store value/setter exist; the downstream rendering consumers were not exhaustively traced, but this is a reasonable functional statement.
- D-codes (D-01/D-02/D-03 wall-clock/anchor/dose-log rules) are confirmed against the recalc service comments and behavior; the broader "D-07 session dismissal" code comment matches `_dismissedThisSession`. use-timezone-detection.ts:9-22; timezone-recalculation-service.ts:18-23.
