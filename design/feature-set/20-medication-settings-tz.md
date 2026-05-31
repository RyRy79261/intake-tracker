# 20 — Medication Settings & Timezone

**Files covered:**
- `src/components/medications/medication-settings-view.tsx` (Medications page "Settings" tab — the rich settings view)
- `src/components/settings/medication-settings-section.tsx` (compact mirror inside the global Settings accordion)
- `src/components/medications/timezone-change-dialog.tsx` (travel/timezone-change confirmation dialog)
- `src/lib/timezone.ts` (device-timezone detection + UTC↔local minutes conversion)
- `src/hooks/use-timezone-detection.ts` (mount/resume detection + dialog state machine)
- `src/lib/timezone-recalculation-service.ts` (dose-schedule recalculation transaction; invoked by the dialog)
- `src/lib/medication-notification-service.ts` (client-side local dose reminders + refill alerts loop)
- `src/hooks/use-medication-notifications.ts` (starts/stops the local notification loop)
- `src/hooks/use-push-schedule-sync.ts` (`usePushScheduleSync` + `useDoseReminderToggle` — server push subscription + schedule/settings sync)
- Supporting reads: `src/stores/settings-store.ts` (persisted prefs), `src/components/auth-guard.tsx` (`useAuth`, `useAuthGate`), `src/lib/push-notification-service.ts` (notification support/permission), `src/lib/db.ts` (`PhaseSchedule`, `MedicationPhase`), `src/app/providers.tsx` + `src/app/medications/page.tsx` + `src/app/settings/page.tsx` (mount points)

**Purpose:** Lets the single user configure medication-related preferences — dose-reminder push notifications (with follow-up nudges), display time format, and AI-search regions — and transparently handles travel: when the device timezone changes, a dialog offers to recalculate all active dose schedules so wall-clock dose times are preserved. Local + server push reminders fire when doses are due and refill alerts when stock runs low.

---

## Features

### A. Medication Settings View (Medications → Settings tab)
This is the primary, full-fidelity surface. It is organized into up to three bordered "card" sections, each with a teal icon + heading:

1. **Dose Reminders** (icon: `Bell`, teal) — *gated*: the entire card is hidden unless `useAuthGate()` returns true (i.e. auth state is still loading OR the user is signed in). Contains:
   - **Enable Reminders** toggle (`Switch`) bound to `doseRemindersEnabled`.
   - A contextual helper sentence under the label that changes by capability/auth state (see States).
   - **Follow-up reminders** select (only rendered when reminders are enabled): how many additional nudges to send if the dose is not confirmed. Helper text: "Additional reminders if dose not confirmed" (no trailing period).
   - **Reminder interval** select (only rendered when reminders enabled AND follow-up count > 0): minutes between follow-up nudges.
   - Toggling on triggers a real browser notification-permission request and a push subscription; toggling off unsubscribes. The toggle shows a disabled/busy state while this resolves.

2. **Display** (icon: `Clock`, teal):
   - **Time Format** select — "24-hour (14:00)" vs "12-hour (2:00 PM)", bound to `timeFormat`. Governs how dose/schedule times render across the medication UI.

3. **Localization** (icon: `Globe`, teal):
   - **Primary Region** — searchable country combobox (194 ISO 3166-1 countries + a "Not Specified (Global Search)" sentinel = 195 rows). Used by AI to find local brand names/alternatives when adding a medication. Helper text reads "This is used by the AI to search for local brand names and alternatives when adding a new medication."
   - **Secondary Region (Optional)** — same combobox, used as an AI fallback for alternatives. Helper text reads "Used as a fallback for finding medication alternatives."

The view header reads "Medication Settings" with subtitle "Configure preferences that apply to your prescriptions and search results." Bottom padding `pb-24` clears the medication tab bar.

### B. Medication Settings Section (global Settings → Medication accordion)
A compact duplicate of the Localization controls only (no reminders, no display format). Icon: `Pill`, teal, heading "Medication". Two `Select` dropdowns (not comboboxes):
- **Primary Region** — small fixed country list, defaults display to "US" when unset. Helper text: "Used to find local medication alternatives in search results."
- **Secondary Region (Optional)** — same list prefixed with a "None" option; displays "None" when unset. Helper text: "Used as a fallback for finding medication alternatives."
Both write the same `primaryRegion`/`secondaryRegion` store values as the rich view (the two surfaces are intentionally redundant but use different option sets — see Edge cases).

### C. Timezone Change Detection & Dialog (app-wide)
- `useTimezoneDetection()` runs inside `TimezoneGuard` in the provider stack, so the dialog is global (not tied to the medications page).
- On app mount and on every `visibilitychange` to `visible` (app resume from background), it busts the cached device timezone and re-reads `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- It loads all `phaseSchedules`, keeps only `enabled === true`, collects the unique set of `anchorTimezone` values, and if any differ from the current device timezone, opens the **Timezone Changed** dialog.
- The dialog frames the change as travel ("It looks like you've traveled from {OldCity} to {NewCity}.") using only the city portion of the IANA name (last `/` segment, underscores → spaces).
- A muted reassurance panel: "Your dose times will stay at the same wall-clock times (e.g. 08:00 stays 08:00) in your new timezone."
- **Adjust Schedules** → recalculates every active schedule's `scheduleTimeUTC` to preserve wall-clock time in the new timezone, rewrites `anchorTimezone` + `time`, writes one audit log, enqueues sync, then shows a success toast "Schedules adjusted to {City}".
- **Not Now** → dismisses for the rest of the session (no re-prompt until reload/restart).

### D. Local Dose Reminders & Refill Alerts (`medication-notification-service`)
- Started/stopped by `useMedicationNotifications()` which is mounted on the medications page. Runs a `setInterval` every 60 s.
- **Dose reminders:** every minute, for each enabled schedule whose `daysOfWeek` includes today's weekday, if the current local time is within `[0, 5]` minutes after the schedule time and not already notified today, it fires a "Time for your {HH:MM} medications" notification listing the medication name + dose, `requireInteraction: true`, deduped per `date-time-prescription` key (cleaned daily).
- **Refill alerts:** on start, for each active prescription with an active phase + active (non-archived) inventory item, computes daily dosage (weighted by days-of-week / 7), daily pills, and `daysLeft = floor(stock / dailyPills)`. Fires a "Refill needed: {brand}" notification (body `"{stock} pills left (~{daysLeft} days). Time to refill {brand} {strength}{unit}."`, where the strength substring comes from the inventory `strength`+`unit` or `formatCompoundShort` for combos — not the schedule dosage) if `daysLeft <= refillAlertDays` OR `stock <= refillAlertPills`. Throttled to once per 12 h; deduped per prescription id.
- Compound (combo) meds render dose text via `formatCompoundShort(splitDose(...))`; single meds render `{dosage}{unit}`.
- **Inventory-selection asymmetry:** the dose-reminder path picks the active non-archived inventory but **falls back to `activeInv[0]`** (first inventory found) for the med *name* if none is active; the refill path has **no such fallback** — it `continue`s (skips the prescription) when there is no active non-archived inventory.

### E. Server Push Sync (`usePushScheduleSync`)
- Mounted via `useMedicationNotifications` (which calls `usePushScheduleSync`). No-ops when signed out.
- When reminders enabled + authenticated + there are dose slots today: builds schedule entries (grouped by local time, expanded across `daysOfWeek`; defaults to all 7 days if none) and POSTs them to `/api/push/sync-schedule` with the current IANA timezone. Debounced by a JSON hash of `{entries, followUpCount, followUpInterval}`.
- Pings `/api/push/check` every 60 s while reminders are enabled (server-side fan-out of due notifications).
- POSTs follow-up settings `{followUpCount, followUpIntervalMinutes}` to `/api/push/settings` whenever they change (debounced by hash).

---

## User actions & interactions

| Action | Where | Result |
|---|---|---|
| Toggle **Enable Reminders** on | Reminders card | Requests browser notification permission; if granted, subscribes to push and sets `doseRemindersEnabled=true`; toggle disabled while pending. If permission denied or subscription fails, the toggle stays off with no error toast (the handler `console.error`s thrown errors and `console.warn`s when the push subscription returns null — so it is UX-silent but not log-silent). |
| Toggle **Enable Reminders** off | Reminders card | Unsubscribes from push, sets `doseRemindersEnabled=false`; the two sub-selects collapse. |
| Select **Follow-up reminders** value | Reminders card | Sets `reminderFollowUpCount` (0/1/2/3). Choosing 0 ("None") hides the interval select. Syncs to `/api/push/settings`. |
| Select **Reminder interval** value | Reminders card | Sets `reminderFollowUpInterval` (5/10/15/20/30 min). Syncs to `/api/push/settings`. |
| Select **Time Format** | Display card | Sets `timeFormat` ("12h"/"24h"); changes time rendering app-wide. |
| Open **Primary/Secondary Region** combobox (rich view) | Localization card | Opens a `Popover` + `Command` with a search input ("Search countries..."), filterable list, check mark on the selected row, "No country found." empty state. |
| Type in country search | Combobox | Filters the country list by label. |
| Select a country | Combobox | Writes `primaryRegion`/`secondaryRegion` (ISO code or "" for global) and closes the popover. |
| Select **Primary/Secondary Region** (Settings accordion) | Settings page | Same store writes via a simple `Select`; secondary offers a "None" option. |
| Travel / change device timezone, reopen app | Anywhere | Detection compares device TZ to schedule anchor TZs; if mismatched, opens the Timezone Changed dialog. |
| Tap **Adjust Schedules** | Timezone dialog | Runs `recalculateScheduleTimezones`; button shows spinner + "Adjusting…"; on success closes + success toast; on failure shows destructive toast "Schedule adjustment failed" / "Your dose times have not changed. Try reopening the app." |
| Tap **Not Now** | Timezone dialog | Sets a session-level dismissal flag and closes; won't re-prompt until reload/app restart. (Both buttons disabled while recalculating.) |
| Receive dose reminder notification | OS | "Time for your {HH:MM} medications" with med list; `requireInteraction` keeps it visible. |
| Receive refill notification | OS | "Refill needed: {brand}" with body "{stock} pills left (~{daysLeft} days). Time to refill {brand} {strength}{unit}." |

---

## States & presentations

### Reminders card
- **Hidden (signed-out + reminders off):** entire card not rendered (`useAuthGate()` false only when ready && unauthenticated).
- **Auth-loading:** `useAuthGate()` returns true while `ready` is false → card shows (optimistic).
- **Unsupported browser:** helper text "Notifications not supported in this browser"; toggle **disabled**.
- **Signed-out, reminders off:** helper "Sign in to enable push reminders across devices".
- **Default/enabled-capable:** helper "Get push notifications when medications are due".
- **Toggling/busy:** `Switch` disabled (`togglingReminders`) during permission request + subscribe/unsubscribe.
- **Enabled:** Follow-up select appears.
- **Enabled + follow-up > 0:** Interval select additionally appears.
- **Enabled + follow-up = 0 (None):** Interval select hidden.

### Time Format / Localization
- Standard select/combobox states; combobox has an explicit **empty** state "No country found." and a selected-row check indicator.
- Combobox handles legacy/normalized values: shows the country code form when a match exists, falls back to placeholder otherwise.

### Timezone dialog
- **Closed:** `open=false`.
- **Open/default:** title "Timezone Changed", travel sentence, reassurance panel, "Not Now" + "Adjust Schedules".
- **Recalculating:** action button shows `Loader2` spinner + "Adjusting…"; both buttons disabled.
- **Success:** dialog closes + non-destructive toast "Schedules adjusted to {City}".
- **Error:** destructive toast; dialog stays (re-attemptable); dose times unchanged.
- **No active schedules:** detection early-returns; dialog never opens.
- **Dismissed-this-session:** detection early-returns on subsequent mounts/resumes.

### Notifications (local)
- **Permission not granted:** all dose/refill checks no-op.
- **Already-notified (today / within 12 h):** deduped, no duplicate notification.
- **Offline:** local notifications still work (client-side timer + Notification API); server push sync calls fail-soft with `console.warn` and no UI error.

---

## Enums, options & configurable values

**Settings store defaults & types** (`settings-store.ts`):
- `primaryRegion: string` — default `""` (empty = global).
- `secondaryRegion: string` — default `""`.
- `timeFormat: "12h" | "24h"` — default `"24h"`.
- `doseRemindersEnabled: boolean` — default `false`.
- `reminderFollowUpCount: number` — default `2`.
- `reminderFollowUpInterval: number` (minutes) — default `10`.

**Follow-up count options:** `0` = "None", `1` = "1 follow-up", `2` = "2 follow-ups", `3` = "3 follow-ups".

**Reminder interval options (minutes):** `5`, `10`, `15`, `20`, `30` ("Every N minutes").

**Time format options:** `"24h"` → "24-hour (14:00)", `"12h"` → "12-hour (2:00 PM)".

**Country list (rich combobox):** sentinel `{ value: "", label: "Not Specified (Global Search)", flag: "🌐" }` followed by 194 ISO 3166-1 alpha-2 entries with flag emoji, alphabetical by label (Afghanistan `AF` … Zimbabwe `ZW`) — 195 rows total. Stored value = ISO code or `""`. Each `CommandItem` is keyed `country.value || "__global__"` and its `value` is the country **label**, so the search input filters on label text.

**Country list (compact Settings section, divergent):** fixed short list — `US` United States, `UK` United Kingdom, `CA` Canada, `AU` Australia, `DE` Germany, `ZA` South Africa, `Other`; secondary adds a `None` option. (Note "UK"/"Other"/"None" don't match the rich view's ISO codes — see Edge cases.)

**Dose-reminder timing windows / thresholds:**
- Local dose-due window: `0 ≤ (now − scheduleTime) ≤ 5` minutes.
- Local check interval: `60 s` (`setInterval`).
- Refill check throttle: `12 h`.
- Server `/api/push/check` ping interval: `60 s`.
- Notification options: dose `requireInteraction: true`, tag `dose-reminder-{time}`; refill tag `refill-{id}`.

**Timezone constants (`timezone.ts`):**
- `MIGRATION_TIMEZONE_CUTOFF` = `2026-02-12T00:00:00Z` (records before → `Africa/Johannesburg`, on/after → `Europe/Berlin`). This constant and its helper `getTimezoneForTimestamp` are a **v11-migration backfill** path only — they are **not used by the settings or timezone-change runtime** described here.
- SSR fallback timezone: `"UTC"`.
- Minutes domain: schedule times stored as minutes-from-midnight-UTC, wrapped to `[0,1439]`.

**Days of week:** `0`–`6` (`Date.getDay()`, Sunday = 0).

**Audit action emitted:** `"timezone_adjusted"` with `{ newTimezone, schedulesUpdated }`.

**Notification permission states:** `"granted" | "denied" | "default"`.

---

## Data model touched

- **Reads/writes `settings-store` (localStorage-persisted Zustand):** `primaryRegion`, `secondaryRegion`, `timeFormat`, `doseRemindersEnabled`, `reminderFollowUpCount`, `reminderFollowUpInterval`.
- **`phaseSchedules` (Dexie, `PhaseSchedule`):** reads `enabled`, `anchorTimezone`, `scheduleTimeUTC`, `time` (deprecated HH:MM), `dosage`, `daysOfWeek`, `unit`, `phaseId`; recalculation **writes** `scheduleTimeUTC`, `anchorTimezone`, `time`, `updatedAt`.
- **`medicationPhases` (`MedicationPhase`):** reads `status` (`"active"`), `unit`, `prescriptionId` for due/refill computation.
- **`prescriptions`:** reads `isActive`, `genericName`, `compounds`, `id`.
- **`inventoryItems`:** reads `currentStock`, `strength`, `unit`, `brandName`, `isActive`, `isArchived`, `refillAlertDays`, `refillAlertPills`, `compounds`.
- **`auditLogs`:** writes one `timezone_adjusted` entry per successful recalc.
- **`_syncQueue`:** `enqueueInsideTx("phaseSchedules"|"auditLogs", id, "upsert")` + `schedulePush()`.
- **localStorage `intake-tracker-med-notifications`:** `{ lastDoseCheck, lastRefillCheck, notifiedDoses[], notifiedRefills[] }`.
- **Server endpoints:** `POST /api/push/sync-schedule`, `POST /api/push/check`, `POST /api/push/settings` (subscription state lives in server Postgres, not Dexie).

---

## Validation, edge cases & business rules

- **Wall-clock preservation (D-01):** travel recalculation keeps the displayed dose time identical (08:00 → 08:00); only the stored UTC offset shifts. Dose logs are never touched (D-03); `anchorTimezone` is rewritten (D-02).
- **Only enabled schedules** are considered for both detection and recalculation; schedules already on the new TZ are skipped (no redundant writes / no audit if `updatedCount === 0`).
- **UTC minutes wrap:** conversions apply `((x % 1440) + 1440) % 1440` so times never go negative or exceed a day.
- **Offset method:** computed via `toLocaleString` UTC-vs-TZ diff (no external TZ library); reflects current DST at the moment of conversion.
- **Session dismissal:** "Not Now" suppresses the dialog only until reload/app restart (module-level flag, not persisted).
- **Detection fails silent:** any DB error during detection is swallowed so app startup never blocks.
- **Reminders require auth + permission:** the card is hidden when signed-out (push needs auth); local timer checks no-op without `Notification` permission `granted`; toggle disabled when notifications unsupported.
- **Permission denial is non-destructive:** if the user denies the browser prompt or push subscription fails, the toggle quietly stays off (no error toast). It is not fully silent at the log level, though — `useDoseReminderToggle` `console.error`s on thrown errors and `console.warn`s when `subscribeToPush()` returns null. (`supported` is computed as `typeof window !== "undefined" && isNotificationSupported()`.)
- **Dose-due dedupe:** one notification per `{date}-{time}-{prescriptionId}`; keys pruned to today's date daily.
- **Refill throttle:** at most once per 12 h; per-prescription dedupe within that window. A prescription with no active non-archived inventory is **skipped entirely** for refill alerts (no fallback to an archived/inactive item), unlike the dose-reminder path which falls back to the first inventory found for the med name.
- **Refill trigger logic:** alerts when `daysLeft <= refillAlertDays` OR `stock <= refillAlertPills` (either threshold, if defined); `daysLeft` is `Infinity` when `dailyPills === 0`.
- **Daily dosage weighting:** `dosage × (daysOfWeek.length / 7)` so non-daily schedules scale correctly.
- **Two divergent region pickers:** the compact Settings section uses non-ISO values (`UK`, `Other`, `None`) while the rich view uses ISO codes + `""`. Editing region in one surface can surface a mismatched display in the other (the rich combobox falls back to its placeholder for unrecognized stored values). An alternative design should unify these on one canonical option set.
- **`scheduleTimeUTC` is canonical; `time` (HH:MM) is deprecated** but kept in sync on recalc for legacy v10 records and the local notification loop (which still reads `schedule.time`).
- **City-name display** strips the IANA region prefix and underscores; falls back to the raw IANA string if there's no `/`.

---

## Sub-components / variants

- `MedicationSettingsView` — full medication settings surface (reminders + display + localization) on the Medications "Settings" tab.
- `CountryCombobox` — searchable country picker (Popover + Command) used twice in the rich view; check-mark selection, flag prefix, "No country found." empty state.
- `MedicationSettingsSection` — compact region-only mirror inside the global Settings → Medication accordion.
- `TimezoneChangeDialog` — `AlertDialog` presenting the travel detection, reassurance, and Adjust/Not-Now actions with a recalculating state.
- `useTimezoneDetection` — hook: mount/resume detection, dialog state machine, confirm/dismiss handlers, success/error toasts.
- `recalculateScheduleTimezones` — service: transactional recalculation of all active schedules + audit + sync enqueue.
- `timezone.ts` helpers — `getDeviceTimezone`, `clearTimezoneCache`, `localTimeToUTCMinutes`, `utcMinutesToLocalTime`, `formatLocalTime`, `localHHMMStringToUTCMinutes`, `getTimezoneForTimestamp`.
- `useMedicationNotifications` — starts/stops the local notification loop and mounts `usePushScheduleSync`.
- `medication-notification-service` — `startMedicationNotifications` / `stopMedicationNotifications` / dose + refill check logic.
- `usePushScheduleSync` — server schedule + settings sync + `/api/push/check` ping loop.
- `useDoseReminderToggle` — encapsulates permission request + subscribe/unsubscribe + `toggling`/`supported` flags for the toggle.
