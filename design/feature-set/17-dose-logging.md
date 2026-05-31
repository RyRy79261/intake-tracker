# 17 — Dose Logging & Detail

**Files covered:**
- `src/components/medications/dose-detail-dialog.tsx`
- `src/components/medications/bulk-dose-edit-dialog.tsx`
- `src/components/medications/skip-reason-picker.tsx`
- `src/components/medications/retroactive-time-picker.tsx`
- `src/components/medications/undo-toast.tsx`
- `src/lib/dose-log-service.ts`
- `src/hooks/use-medication-queries.ts`
- Supporting (read for context, drive these UIs): `src/components/medications/dose-row.tsx`, `src/components/medications/time-slot-group.tsx`, `src/components/medications/schedule-view.tsx`, `src/lib/dose-schedule-service.ts`, `src/lib/medication-ui-utils.ts`, `src/app/medications/page.tsx`, `src/lib/db.ts`

**Purpose:** The set of UI surfaces and the service layer that let a user record what happened to each scheduled medication dose — mark taken, untake/reverse, skip (with a reason), back-date the time it was actually taken, reschedule, and do the same in bulk across a whole time slot. Every action atomically writes a dose log, decrements/restores pill inventory, and records an audit entry, with an in-toast Undo affordance.

---

## Features

### Dose Detail Dialog (single dose)
- Bottom drawer opened by tapping a non-actionable dose row (a dose that is `taken`, `skipped`, or a future/past slot — actionable today/past `pending`/`missed` rows use inline Take/Skip buttons instead).
- Header shows the pill icon (shape + color from inventory), the brand name + scheduled strength + generic name in parentheses (e.g. `Vymada 100mg (Sacubitril/Valsartan)`), and — if a log exists — a status line: `Taken at {time}` (emerald) or `Skipped at {time}` (muted).
- The header strength is the *scheduled dose split per compound* for a combination drug (via `formatCompoundShort(splitDose(...))`), not the full per-pill content; single-compound shows `{dosage}{unit}`.
- Info section lists:
  - `Scheduled for {localTime}, {weekday, month day}` (calendar icon).
  - `Take {doseAmountLabel}` plus food instruction (`before eating` / `after eating`) and optional `foodNote` (info icon).
  - For combination drugs: `{brandName}: {compound full breakdown} per pill`.
  - For a taken single-compound dose with inventory: `{brandName} {strength}{unit}`.
  - For a skipped dose with a stored reason: `Reason: {skipReason}`.
- Action buttons (circular icon + label) shown contextually:
  - SKIP (teal X) — hidden when already skipped.
  - TAKE (teal check) when not taken, or UNTAKE (red rotate) when already taken.
  - RESCHEDULE (gray clock) — only when the slot is today.
- TAKE behaves differently by day: today → logs immediately at now; a past date → opens the Retroactive Time Picker first to ask what time it was taken.
- RESCHEDULE swaps the action row for an inline time input with Cancel / Confirm; Confirm is disabled until a time is chosen.

### Bulk Dose Edit Dialog (whole time slot)
- Bottom drawer for an entire logged time slot (multiple meds at the same time), opened from the "Edit All" affordance on a time-slot group once all its doses are handled (`!hasPending && hasTaken`).
- Header is the 12-hour formatted time (e.g. `8:00 AM`) with a close (X) button.
- Scrollable list of every dose in the slot, each showing: pill icon w/ status badge, generic name, dose amount, and per-row status line — `Taken at {time, date}` (emerald) or the skip reason / `Skipped` (muted).
- Three bulk actions: SKIP ALL (teal X), UN-TAKE (red rotate), EDIT RECORD (gray clock).
- UN-TAKE and EDIT RECORD are disabled (40% opacity) when no dose in the slot is currently taken.
- SKIP ALL skips only slots not already skipped. UN-TAKE reverses only the taken slots. EDIT RECORD opens the Retroactive Time Picker (labeled "all doses") to rewrite the recorded time on all taken slots, defaulting to the time the batch was logged at.

### Skip Reason Picker
- Modal dialog titled "Why are you skipping?" with 5 preset reason buttons plus a free-text "Other reason…" input + Submit.
- The "Ran out" preset is highlighted (amber ring) when `suggestRanOut` is set — triggered when the dose's inventory warning is `negative_stock` or `no_inventory`.
- Submit is disabled until custom text is non-empty; Enter key also submits the custom reason. Selecting any reason closes the picker and clears the custom field.

### Retroactive Time Picker
- Small modal asking "When did you take {compoundName}?" with a native `<input type="time">` (centered, large) and Cancel / Log Dose buttons.
- Reused for three flows: back-dating a single Take, "Mark All" on a late/past time slot, editing the recorded time of an already-taken dose, and (in Bulk dialog) Edit Record across all doses.
- Resets to its `defaultTime` every time it opens (so a stale value never carries over).

### Undo Toast
- `showUndoToast()` — a plain function (callable outside React render) that fires a toast with a title, optional description, and an Undo action button; auto-dismisses after 5000 ms.
- Used after Take and Mark-All to offer one-tap reversal (calls untake under the hood).

### Service layer (atomic logging + inventory + audit)
- `takeDose` — marks taken; finds active inventory, computes fractional pills consumed, decrements stock (negative allowed), records an inventory transaction, upserts the dose log, writes a `dose_taken` audit (flags `warning: "odd_fraction"` for non-clean fractions). Optional `takenAtTime` ("HH:MM") overrides `actionTimestamp`.
- `untakeDose` — reverses to `pending`; restores stock and records a positive inventory transaction if it had been consumed; `dose_untaken` audit.
- `skipDose` — marks `skipped` with optional reason; reverses stock if previously taken; `dose_skipped` audit.
- `rescheduleDose` — marks old slot `rescheduled` (storing `rescheduledTo`), creates a new `pending` slot at the new time; reverses stock if old slot was taken; `dose_rescheduled` audit.
- `editDoseTime` — rewrites only `actionTimestamp` of an already-taken dose (inventory untouched); validates time; `dose_time_edited` audit. Throws if dose isn't logged as taken.
- `takeAllDoses` / `skipAllDoses` / `editAllDoseTimes` — batch wrappers; each entry runs in its own transaction so one failure doesn't block the rest; aggregate errors are reported.
- Read helpers: `getDoseLogsForDate`, `getDoseLog`, `getDoseLogsWithDetailsForDate` (joins prescription/phase/schedule/active-inventory), and `getDailyDoseSchedule` (derives the day's slots + statuses at read time).
- Exported pill math: `calculatePillsConsumed(doseMg, pillStrengthMg)` and `isCleanFraction(pillsConsumed)`.

---

## User actions & interactions

| Surface | Action | Result |
|---|---|---|
| Dose row (inline, actionable) | Tap **Take** | Today & on-time → log now; today-late or past → open Retroactive Time Picker. Haptic + Undo toast. |
| Dose row (inline) | Tap **Skip** | Opens Skip Reason Picker for that dose. |
| Dose row (taken) | Tap **Edit** | Opens Retroactive Time Picker pre-filled with the recorded taken-time; confirms → `editDoseTime`. |
| Dose row (non-actionable) | Tap row | Opens Dose Detail Dialog. |
| Time-slot group | Tap **Mark All** | Takes all pending/missed in the slot; if late/past, asks time first. Undo toast. |
| Time-slot group | Tap **Edit All** | Opens Bulk Dose Edit Dialog. |
| Dose Detail | Tap **SKIP** | Skips the dose (haptic), closes dialog. (No reason picker in this dialog — skips with no reason.) |
| Dose Detail | Tap **TAKE** | Today → takes now + closes; past → opens Retroactive Time Picker. Haptic. |
| Dose Detail | Tap **UNTAKE** | Reverses the taken dose, toasts "{generic} dose reversed", closes. Haptic. |
| Dose Detail | Tap **RESCHEDULE** | Reveals inline time input + Cancel/Confirm. |
| Dose Detail reschedule | Enter time → **Confirm** | `rescheduleDose`, closes. Confirm disabled until a time entered. |
| Dose Detail reschedule | **Cancel** | Returns to action buttons. |
| Bulk Dialog | Tap **SKIP ALL** | Skips all non-skipped slots, toasts "All {time} doses skipped", closes. Haptic. |
| Bulk Dialog | Tap **UN-TAKE** | Reverses each taken slot (sequential), toasts "All {time} doses reversed", closes. Haptic. (Disabled if none taken.) |
| Bulk Dialog | Tap **EDIT RECORD** | Opens Retroactive Time Picker (default = batch logged time). (Disabled if none taken.) |
| Bulk Dialog | Tap **X** | Closes dialog. |
| Skip Reason Picker | Tap a preset | Selects reason, closes, clears custom. |
| Skip Reason Picker | Type + **Submit** / Enter | Submits trimmed custom reason. Submit disabled if blank. |
| Retroactive Time Picker | Change time | Updates selected time. |
| Retroactive Time Picker | **Log Dose** | Confirms with chosen time, closes. |
| Retroactive Time Picker | **Cancel** | Closes without action. |
| Undo Toast | Tap **Undo** | Reverses the just-logged dose(s). |
| Drawer/dialog | Tap backdrop / drag down | Dismisses (standard drawer/dialog behavior). |

---

## States & presentations

**Dose slot status drives presentation everywhere** (`DoseSlotStatus = "taken" | "skipped" | "pending" | "missed"`; underlying `DoseStatus = "taken" | "skipped" | "rescheduled" | "pending"`, where `rescheduled` slots display as handled/skipped):
- **taken** — emerald tint card, "Taken at {time}" line, pill badge = taken; Detail shows UNTAKE.
- **skipped** — gray tint card, generic name struck-through, reason/`Skipped` line, 70% opacity; SKIP button hidden in Detail.
- **pending** — plain card; inline Take/Skip buttons when actionable.
- **missed** — amber tint card (past-date pending with no log); still actionable inline; pill badge falls back to `pending`.

Other states:
- **Default / actionable** — inline Take + Skip buttons; non-actionable rows are tappable (cursor-pointer, hover) → open Detail.
- **Empty** — when no slots for the day, `EmptySchedule` (Add-medication CTA) replaces the list.
- **Next-upcoming highlight** — the next pending time slot gets a teal left-border + tinted background.
- **Overdue** — time-slot heading turns red when today, past its time, and still has pending doses.
- **Late dose (today)** — Take on a dose >30 min past schedule routes through the time picker instead of logging immediately (`LATE_THRESHOLD_MINUTES = 30`).
- **Disabled** — Bulk UN-TAKE / EDIT RECORD at 40% opacity when no taken doses; Reschedule Confirm and Skip-custom Submit disabled until valid input.
- **Active/selected** — Skip Reason "Ran out" amber ring when stock-suggested.
- **Inline expanded** — Dose Detail reschedule state replaces buttons with a time input.
- **Success** — toasts confirm reverse/skip/time-update; Undo toast (5 s) after take.
- **Future date** — slots shown read-only (no Take/Skip; Reschedule hidden in Detail since `isToday` false).
- **Over-limit / extended (negative stock)** — taking is still allowed; stock goes negative; `inventoryWarning = "negative_stock"` surfaces low-stock warnings and nudges the "Ran out" skip suggestion.
- **No-inventory** — Take description reads "Dose logged — no stock tracked"; no decrement; also nudges "Ran out".
- **Loading** — driven by `useLiveQuery` (Dexie); slots are `undefined` until first read, treated as empty.
- **Offline / syncing** — all writes are local Dexie transactions; each enqueues a sync-queue entry and calls `schedulePush()` (deferred background sync). No explicit offline UI in these components.

---

## Enums, options & configurable values

- **DoseStatus** (`db.ts`): `"taken" | "skipped" | "rescheduled" | "pending"`.
- **DoseSlotStatus** (`dose-schedule-service.ts`): `"taken" | "skipped" | "pending" | "missed"`.
- **Skip reason presets** (`skip-reason-picker.tsx`): `["Forgot", "Side effects", "Ran out", "Doctor advised", "Don't need this dose"]` + custom free-text.
- **Inventory warnings**: `"negative_stock" | "no_inventory" | "odd_fraction"`.
- **Audit actions** (`db.ts`): `"dose_taken"`, `"dose_untaken"`, `"dose_skipped"`, `"dose_rescheduled"`, `"dose_time_edited"`.
- **Inventory transaction type used here**: `"consumed"` (negative amount on take, positive on untake/skip/reschedule).
- **Late threshold**: `LATE_THRESHOLD_MINUTES = 30` (dose-row); Mark-All uses the same `> 30` min check.
- **Undo toast duration**: `5000` ms.
- **Clean fractions** (`isCleanFraction`): whole numbers, `0.25, 0.333, 0.5, 0.667, 0.75` (tolerance `0.01`); anything else flags `odd_fraction`.
- **Pill-math rounding**: 4-decimal (`Math.round(x * 10000) / 10000`).
- **Haptics**: take = `vibrate(50)`; skip = `vibrate([30, 50, 30])`.
- **Pill shapes** (`PillShape`): `"round" | "oval" | "capsule" | "diamond" | "tablet"` (default `"round"`, default color `#ccc`).
- **Food instructions** (`FoodInstruction`): `"before" | "after" | "none"` → rendered as "before eating" / "after eating".
- **Dose unit**: from `MedicationPhase.unit` (typically `"mg"`).
- **Fraction display glyphs** (`formatPillCount`): ¼ ½ ¾ + "tablet"/"tablets".
- **Drawer max height**: `85vh`; bulk dose list scroll area `max-h-[50vh]`.
- **Days of week**: `daysOfWeek: number[]` where `0 = Sunday` (drives whether a slot appears).

---

## Data model touched

- **doseLogs** (`DoseLog`): `id, prescriptionId, phaseId, scheduleId, inventoryItemId?, scheduledDate (YYYY-MM-DD), scheduledTime (HH:MM), status (DoseStatus), actionTimestamp?, rescheduledTo?, skipReason?, note?, timezone, createdAt, updatedAt, deletedAt, deviceId`. Lookup key = `prescriptionId + phaseId + scheduleId + scheduledDate + scheduledTime` (filtered `deletedAt === null`).
- **inventoryItems** (`InventoryItem`): reads/writes `currentStock`; reads `strength` (pill-math denominator), `compounds?`, `pillShape`, `pillColor`, `brandName`, `unit`, `refillAlertPills`, `isActive`, `isArchived`.
- **inventoryTransactions**: appended on take (`amount: -pillsConsumed`), untake/skip/reschedule (`amount: +pillsConsumed`), `type: "consumed"`, `doseLogId` link.
- **auditLogs** (`AuditLog`): one entry per mutation with details `{prescriptionId, date, time, dosageMg, pillsConsumed, inventoryItemId, reason?/newTime?, warning?}`.
- **_syncQueue**: upsert entries enqueued inside each transaction for doseLogs / inventoryItems / inventoryTransactions / auditLogs; `schedulePush()` fires after.
- **prescriptions / medicationPhases / phaseSchedules**: read-only joins for display (genericName, unit, foodInstruction, foodNote, dosage, daysOfWeek, scheduleTimeUTC).
- **DoseSlot** (derived, not persisted): includes `localTime`, `dosageMg`, `status`, `existingLog?`, `pillsPerDose?`, `inventoryWarning?`, plus joined `prescription/phase/schedule/inventory`.
- React Query mutation hooks: `useTakeDose, useUntakeDose, useSkipDose, useRescheduleDose, useTakeAllDoses, useSkipAllDoses, useEditDoseTime, useEditAllDoseTimes`; live reads via `useDailyDoseSchedule, useDoseLogsForDate, useDoseLogsWithDetailsForDate` (Dexie `useLiveQuery`, no manual invalidation).

---

## Validation, edge cases & business rules

- **Idempotent take**: if a slot is already `taken`, re-taking does not re-decrement stock (`wasTaken` guard) — only the upsert refreshes.
- **Stock can go negative** (deliberate user decision); negative stock surfaces a warning but never blocks taking.
- **No inventory** → take logs the dose with no decrement and a "no stock tracked" message.
- **Fractional pills**: `dosageMg / strength`, rounded to 4 decimals; non-clean fractions get an `odd_fraction` audit warning (still logged).
- **Combination drugs**: `strength` (sum of compound strengths) is the math denominator; display splits the dose across compounds (`splitDose` / `formatCompoundShort/Full`); never shows a bare summed mg for a combo.
- **Back-dating**: `takenAtTime` is parsed against `date + "T00:00:00"` then `setHours` → stored as `actionTimestamp`; the *scheduled* time (`localTime`) always remains the lookup key, so re-finding/undo still work.
- **editDoseTime time validation**: regex `^(\d{1,2}):(\d{2})$`, hours 0–23, minutes 0–59; rejects otherwise; only allowed on a `taken` dose (throws "Dose is not logged as taken").
- **Reschedule** creates a *new pending slot* at the new time and marks the old one `rescheduled` (which renders as handled); stock from the old taken slot is restored.
- **Skip/untake/reschedule of a previously-taken dose** all restore stock via a positive `consumed` transaction.
- **Bulk operations are non-atomic across entries** (each its own transaction) — partial success is possible and aggregated into an error string; SKIP ALL only targets non-skipped, UN-TAKE/EDIT only target taken.
- **Day-start / timezone**: slot times are computed from `scheduleTimeUTC` (minutes-from-midnight UTC) into local `localTime` per device timezone; `actionTimestamp`/`timezone` recorded per `getDeviceTimezone()`. Date keys use local-date logic (`toLocalDateKey`).
- **Missed vs pending**: a past date with no log derives `missed`; today/future with no log derives `pending`.
- **Slots hidden before prescription creation date** and only shown for the matching day-of-week + enabled schedules + active phase (titration overrides maintenance).
- **Picker reset rule**: Retroactive Time Picker resets to `defaultTime` on every `open` (Radix doesn't fire onOpenChange for controlled prop changes).
- **Undo window**: 5 s toast; undo simply calls untake (no separate undo stack).

---

## Sub-components / variants

- **DoseDetailDialog** — single-dose bottom drawer; take/untake/skip/reschedule + inline reschedule time input.
- **BulkDoseEditDialog** — whole-time-slot drawer; skip-all / un-take / edit-record across meds.
- **SkipReasonPicker** — modal with 5 presets + custom reason, "Ran out" highlight.
- **RetroactiveTimePicker** — modal time `<input>` reused for back-date take, mark-all-late, single edit, and bulk edit.
- **showUndoToast** — function (not component) firing a 5 s toast with an Undo action.
- **DoseRow** — inline row with Take/Skip (actionable) or Edit (taken) and tap-to-open-detail; hosts its own retroactive/edit pickers.
- **TimeSlotGroup** — groups rows by time; "Mark All" (pending) / "Edit All" (handled) headers; overdue/next-upcoming styling.
- **ScheduleView** — orchestrator: groups slots, wires take/retroactive/skip/mark-all/edit-all/edit-time handlers, mounts SkipReasonPicker, mark-all RetroactiveTimePicker, and BulkDoseEditDialog.
- **dose-log-service.ts** — atomic take/untake/skip/reschedule/edit + batch variants, inventory math (`calculatePillsConsumed`, `isCleanFraction`), audit + sync enqueue.
- **dose-schedule-service.ts** — derives the day's `DoseSlot[]` (status + inventory warnings) from active prescriptions/phases/schedules/logs/inventory.
- **use-medication-queries.ts** — React Query mutation hooks + Dexie live-read hooks exposing the above to components.
