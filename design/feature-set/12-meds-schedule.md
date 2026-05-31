# 12 — Medications: Schedule View

**Files covered:**
- `src/components/medications/schedule-view.tsx`
- `src/components/medications/time-slot-group.tsx`
- `src/components/medications/dose-row.tsx`
- `src/components/medications/week-day-selector.tsx`
- `src/components/medications/dose-progress-summary.tsx`
- `src/components/medications/empty-schedule.tsx`
- `src/components/medications/med-footer.tsx` (exports `MedTabBar`)
- `src/components/medications/skip-reason-picker.tsx`
- `src/components/medications/retroactive-time-picker.tsx`
- `src/components/medications/bulk-dose-edit-dialog.tsx`
- `src/components/medications/undo-toast.tsx`
- `src/components/medications/pill-icon.tsx`
- `src/lib/dose-schedule-service.ts`
- `src/lib/medication-schedule-service.ts`
- `src/lib/medication-ui-utils.ts`
- `src/lib/dose-log-service.ts` (input/derivation types)
- `src/hooks/use-medication-queries.ts` (live query + mutation hooks)
- `src/app/medications/page.tsx` (host page + tab routing)
- `src/stores/medication-ui-store.ts` (active tab state)

**Purpose:** The daily medication dosing surface. It derives the full schedule of doses for a chosen day (grouped by clock time), shows each dose's taken/skipped/pending/missed status, and lets the user mark doses taken or skipped — individually or in bulk — with retroactive time-stamping, undo, low-stock warnings, and an N-of-M daily progress meter. A week-day selector scrolls between days; a tab bar switches between Schedule, Rx, Meds, Titrations, and Settings sub-views.

---

## Features

### Day navigation (WeekDaySelector)
- Horizontal 7-day strip (Sun→Sat) for the week containing the selected date.
- Previous/next week chevrons shift the selected date by ±7 days.
- Each day cell shows a 3-letter weekday label and the numeric day-of-month.
- Selected day is highlighted (filled teal). The current real-world "today" gets a teal ring when not the selected day.
- A caption line under the strip shows a friendly label of the form `<dateLabel>, <Mon D, YYYY>`. For today/tomorrow/yesterday `dateLabel` is just "Today"/"Tomorrow"/"Yesterday" (e.g. `Today, Jun 3, 2026`). For any other date `dateLabel` is the full localized `weekday: "long"` + `month: "short"` + `day: "numeric"` string — itself comma-joined — so the rendered caption repeats the month/day, e.g. `Monday, Jun 3, Jun 3, 2026`.

### Tab bar (MedTabBar / med-footer)
- 5 tabs that switch the entire medications page sub-view: Schedule, Rx (prescriptions), Meds (compound list), Titrations, Settings. Each has an icon + label.
- Active tab is teal-colored with a teal underline bar; inactive tabs are muted.
- Holds the active tab in a module-level Zustand store (plain `create`, **no `persist` middleware**) so it survives in-app navigation and component remounts, but is reset on a full page reload — it is not written to localStorage. Default tab is `schedule`.

### Daily progress summary (DoseProgressSummary) — today only
- Computes N-of-M: total scheduled doses for the day, count taken, % handled.
- Renders a teal progress bar reflecting the handled percentage (taken + skipped over total).
- When everything is handled (no pending left and total > 0), collapses into a green "All done for today!" celebration card with check icon and `taken/total doses taken`.
- Surfaces a low-stock line ("Low stock: NameA, NameB") listing prescription generic names that are at/under their refill threshold or in negative stock.
- Only rendered when the selected day is today.

### Dose schedule list (ScheduleView + TimeSlotGroup + DoseRow)
- Reads the derived daily schedule live from IndexedDB (re-renders on any underlying data change).
- Groups dose slots by their local display time ("HH:MM"), sorted ascending; each group is a "time slot group."
- Each time slot group shows a 12-hour heading (e.g. "8:00 AM") and a stacked list of dose rows.
- Each dose row shows: pill icon (shape + color + status badge), generic name, formatted dose amount, food instruction, and status-specific affordances.
- Highlights the next upcoming pending time slot (today only) with a teal left border + tinted background.
- Marks overdue time slots (today, past their scheduled time, still pending) with a red heading.
- Dose amount formatting handles single-compound ("1 tablet of 50mg"), fractional pills (¼/½/¾ Unicode glyphs), and combination drugs ("2 tablets of 49/51mg").

### Dose actions
- Per-dose Take (immediate if on-time today; otherwise opens a retroactive time picker).
- Per-dose Skip (opens a reason picker).
- Per-dose Edit (re-time an already-taken dose).
- Per-time-slot "Mark All" (take all pending/missed doses at that time).
- Per-time-slot "Edit All" (opens a bulk-edit drawer for an already-logged slot).
- Bulk-edit drawer offers Skip All, Un-Take (reverse), and Edit Record (re-time the batch).
- Undo toast after taking (single or batch), auto-dismiss 5s.
- Tapping a non-actionable row (taken/skipped, or any future-date row) opens the dose detail dialog.

### Empty state (EmptySchedule)
- Cat icon + "No medications scheduled for today" + optional "Add a prescription" button.

### Haptics
- `hapticTake()` → single 50 ms vibration on take.
- `hapticSkip()` → pattern `[30, 50, 30]` on skip.

---

## User actions & interactions

| Action | Trigger | Result |
|---|---|---|
| Switch sub-view | Tap a tab in MedTabBar | Active tab changes; Schedule view replaced by Rx/Meds/Titrations/Settings view |
| Previous / next week | Tap chevron in WeekDaySelector | `selectedDate` shifts ±7 days; strip + schedule reload |
| Select a day | Tap a day cell | `selectedDate` set to that day; schedule reloads for that date |
| Take a dose (on-time today) | Tap "Take" on a pending/missed row, within 30 min of scheduled time, today | Logs dose at current time, deducts pills, haptic, shows undo toast |
| Take a dose (late today / past date) | Tap "Take" when >30 min late or on a past day | Opens RetroactiveTimePicker; on confirm logs at chosen time |
| Skip a dose | Tap "Skip" on a pending/missed row | Opens SkipReasonPicker; on select logs skip with reason + haptic |
| Edit a taken dose's time | Tap "Edit" on a taken row | Opens RetroactiveTimePicker prefilled with recorded time; confirm updates the logged time |
| Mark all at a time (on-time) | Tap "Mark All" on a time-slot heading, ≤30 min late today | Takes all pending/missed at that time immediately; undo toast |
| Mark all at a time (late / past) | Tap "Mark All" when >30 min late or on a past day | Opens RetroactiveTimePicker ("all doses"); confirm batch-logs at chosen time |
| Edit all at a logged time | Tap "Edit All" on a fully-handled time-slot heading | Opens BulkDoseEditDialog drawer |
| Skip All (bulk) | Tap "SKIP ALL" in bulk drawer | Skips all not-yet-skipped doses in the slot; toast; closes |
| Un-Take (bulk) | Tap "UN-TAKE" in bulk drawer (enabled only if any taken) | Reverses all taken doses in the slot; toast; closes |
| Edit Record (bulk) | Tap "EDIT RECORD" in bulk drawer (enabled only if any taken) | Opens RetroactiveTimePicker prefilled with batch logged time; confirm re-times all taken doses |
| Undo a take | Tap "Undo" in toast (5s window) | Calls untake for the taken dose(s) |
| Choose preset skip reason | Tap a preset button in SkipReasonPicker | Logs skip with that reason; closes |
| Enter custom skip reason | Type into "Other reason…" + Submit / Enter | Logs skip with trimmed custom reason; Submit disabled while blank |
| Pick retroactive time | Use native time input + "Log Dose" | Confirms chosen "HH:MM"; "Cancel" dismisses |
| Open dose detail | Tap a taken/skipped row, or any row on a future date | Opens DoseDetailDialog for that slot |
| Add a prescription (empty) | Tap "Add a prescription" in EmptySchedule | Opens the medication wizard |

---

## States & presentations

### Schedule view container
- **Empty:** no slots → EmptySchedule (cat icon, message, optional add button).
- **Loading:** `slots` undefined (live query not yet resolved) is treated as empty → EmptySchedule shows until data arrives (no dedicated spinner here; page-level skeletons exist in `page-skeletons.tsx`).
- **Populated, today:** progress summary on top, then time-slot groups.
- **Populated, past day:** no progress summary; rows show historical statuses; "missed" rows for unhandled doses.
- **Populated, future day:** no progress summary; all rows non-actionable (no Take/Skip buttons); rows are tap-to-detail only; time-slot headings show no Mark All / Edit All.

### Time slot group
- **Default:** plain rounded container, 12-hour heading + rows.
- **Next upcoming (today):** teal left border (3px) + faint teal background + left padding.
- **All done (taken/skipped) and not next-upcoming:** dimmed to 80% opacity.
- **Overdue (today, past time, still pending):** heading text turns red.
- **Has pending/missed (not future):** "Mark All" ghost button in heading.
- **Fully handled with at least one taken (not future):** "Edit All" ghost button in heading.

### Dose row (per status)
- **pending:** card background + border; Skip + Take buttons shown (if actionable).
- **missed:** amber tint background/border; rendered with pending-style pill badge; Skip + Take still shown (actionable on today/past).
- **taken:** emerald tint background/border; "Taken at <HH:MM>" line with check; "Edit" button; pill badge shows green check.
- **skipped:** gray tint, 70% opacity, name struck-through, reason (or "Skipped") line; pill badge shows gray X; no action buttons.
- **future date (any status):** never actionable; whole row is tap-to-detail (cursor pointer, hover highlight, button role).
- **non-actionable (taken/skipped/future):** entire card is clickable → detail dialog.

### Progress summary
- **In-progress:** "N/M taken" + "P%" + teal bar; low-stock amber line if applicable.
- **Complete:** green "All done for today!" card.

### Pickers / dialogs
- **SkipReasonPicker:** modal with 5 preset buttons + custom input; "Ran out" preset gets an amber ring when the slot is out of inventory (`negative_stock` / `no_inventory`).
- **RetroactiveTimePicker:** compact modal, centered native time input, Cancel + "Log Dose"; resets to default time each time it opens.
- **BulkDoseEditDialog:** bottom drawer (max 85vh), time heading, scrollable dose list, three circular action buttons (SKIP ALL always enabled; UN-TAKE and EDIT RECORD disabled at 40% opacity unless any dose is taken).
- **DoseDetailDialog:** bottom drawer opened by tapping a non-actionable row (taken/skipped, or any future-date row). Defined outside this unit's "Files covered" but reached from it. Its own circular action buttons are: SKIP (when not already skipped), TAKE or UNTAKE (UNTAKE shown when the dose is taken; TAKE on past dates opens a RetroactiveTimePicker), and — **today only** — RESCHEDULE, which reveals an inline time input and calls `rescheduleDose` to move the dose to a new time.

### Tab bar
- **Active tab:** teal text + teal underline bar.
- **Inactive tab:** muted text, hover → foreground; focus-visible ring.

### Week selector day cell
- **Selected:** filled teal, white text.
- **Today (unselected):** teal ring + teal numeral.
- **Default:** muted label, normal numeral; hover background + active scale-95 press feedback.

### Offline / syncing
- Fully offline-capable: all reads/writes go to IndexedDB; mutations enqueue a sync-queue entry and call `schedulePush()`. No blocking sync UI on this surface; live query reflects local writes immediately.

---

## Enums, options & configurable values

**Dose slot status** (`DoseSlotStatus`, dose-schedule-service.ts):
`"taken" | "skipped" | "pending" | "missed"`

**Dose log status** (`DoseStatus`, db.ts):
`"taken" | "skipped" | "rescheduled" | "pending"`
- `rescheduled` logs derive to slot status `skipped` (shown as handled).

**Pill shapes** (`PillShape`, db.ts): `"round" | "oval" | "capsule" | "diamond" | "tablet"`. Default when no inventory: `round`, color `#ccc`.

**Pill icon badge statuses** (pill-icon.tsx): `taken` (emerald + check), `skipped` (gray + X), `rescheduled` (amber + clock), `pending` (no badge). Badge size = 45% of icon. Default icon size in rows = 36px.

**Food instructions** (`FoodInstruction`, db.ts): `"before" | "after" | "none"`. Rendered as `"-- before eating"` / `"-- after eating"`; `none` hidden.

**Inventory warnings** (string codes set on a slot): `"negative_stock" | "no_inventory" | "odd_fraction"`. At most one survives per slot: `odd_fraction` is assigned first, but is **overwritten by `negative_stock`** if the dose would drive stock below zero (negative_stock wins).

**Skip reason presets** (skip-reason-picker.tsx):
`["Forgot", "Side effects", "Ran out", "Doctor advised", "Don't need this dose"]` + free-text custom.

**Med tabs** (`MedTab`, med-footer.tsx):
- `schedule` — "Schedule" (CalendarDays)
- `prescriptions` — "Rx" (ClipboardList)
- `medications` — "Meds" (Pill)
- `titrations` — "Titrations" (TrendingUp)
- `settings` — "Settings" (Settings)
- Default active tab: `schedule`.

**Weekday labels** (week-day-selector.tsx): `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]`; week starts Sunday (index 0). `daysOfWeek` stored as `number[]`, 0=Sunday.

**Friendly date labels:** "Today", "Tomorrow", "Yesterday", else `weekday, Mon D`.

**Time thresholds:**
- `LATE_THRESHOLD_MINUTES = 30` (dose-row.tsx) — within 30 min of scheduled time = "on time" (immediate take); beyond = retroactive picker.
- Mark-All late threshold: `nowMinutes - schedMinutes > 30` (schedule-view.tsx).
- Overdue (heading red): `now > scheduled` for any pending in the group.

**Undo toast:** duration `5000` ms; action label "Undo".

**Haptic patterns:** take = `50`; skip = `[30, 50, 30]`.

**Clean pill fractions** (dose-log-service.ts): whole numbers plus `[0.25, 0.333, 0.5, 0.667, 0.75]` (0.01 tolerance). Unicode fraction glyphs: ¼ (0.25), ½ (0.5), ¾ (0.75). Pill math rounded to 4 decimals.

**Phase types governing dosing:** `maintenance` and `titration`. An active titration phase with a `titrationPlanId` overrides the maintenance phase.

**Inventory transaction types** (db.ts): `"refill" | "consumed" | "adjusted" | "initial"`.

---

## Data model touched

**Reads (5 tables, derived live):**
- `prescriptions` — active (`isActive === true`); `genericName`, `compounds`, `createdAt`.
- `medicationPhases` — `status === "active"`; `type` (maintenance/titration), `titrationPlanId`, `unit`, `foodInstruction`.
- `phaseSchedules` — `enabled === true`, `deletedAt === null`; `scheduleTimeUTC`, `dosage`, `daysOfWeek`, `time` (deprecated), `anchorTimezone`.
- `doseLogs` — keyed by `scheduledDate`; fields `status`, `actionTimestamp`, `skipReason`, `rescheduledTo`, `scheduledTime`.
- `inventoryItems` — active, non-archived; `strength`, `compounds`, `pillShape`, `pillColor`, `currentStock`, `refillAlertPills`.

**Writes (via dose-log-service mutations):**
- `doseLogs` (take/untake/skip/reschedule/edit-time, single + bulk).
- `inventoryTransactions` (pill deductions of type `consumed` linked by `doseLogId`).
- `auditLogs` + `_syncQueue` (every mutation enqueues a sync upsert).
- `phaseSchedules` (add/update/delete schedule — used by other tabs, defined in medication-schedule-service.ts). That file also exposes read helpers used by the Rx/Settings tabs: `getDailySchedule(dayOfWeek)` (returns a `Map<time, ScheduleWithDetails[]>` of active prescriptions/phases for a weekday) and `getSchedulesForPhase(phaseId)`; both reads additionally filter `deletedAt === null` alongside `enabled === true`.

**Key derived type — `DoseSlot`** (dose-schedule-service.ts): `prescriptionId, phaseId, scheduleId, scheduledDate (YYYY-MM-DD), scheduleTimeUTC (min from UTC midnight), localTime ("HH:MM"), dosageMg, unit, status, existingLog?, prescription, phase, schedule, inventory?, pillsPerDose?, inventoryWarning?`.

**Mutation input types** (dose-log-service.ts): `TakeDoseInput` (with optional `takenAtTime`), `UntakeDoseInput`, `SkipDoseInput` (with `reason`), `RescheduleDoseInput`, `EditDoseTimeInput` (with `newTime`).

---

## Validation, edge cases & business rules

- **Status derivation:** if a log exists → map its status (`rescheduled` → slot `skipped`). No log: today → `pending`, past → `missed`, future → `pending`.
- **Titration overrides maintenance:** for a prescription with both an active maintenance and an active titration phase (with `titrationPlanId`), the titration phase governs dosing for the day.
- **Day-of-week filtering:** a schedule only produces a slot if `daysOfWeek.includes(dayOfWeek)` for the selected date. Day-of-week parsed via `new Date(dateStr + "T12:00:00")` to avoid timezone shift at midnight.
- **Pre-creation cutoff:** no dose slots are shown for dates earlier than the prescription's `createdAt` date.
- **Timezone-aware display:** `localTime` is derived from `scheduleTimeUTC` formatted into the device timezone (`getDeviceTimezone`). Slots are sorted by `localTime`.
- **On-time vs late take:** today + within 30 min of scheduled = immediate log at current wall time; otherwise a retroactive time must be chosen. Past dates always require a chosen time.
- **Pill math:** `pillsPerDose = round(dosageMg / inventory.strength, 4)`. If no inventory → warning `no_inventory` and "Dose logged -- no stock tracked". If the result is not a clean fraction → `odd_fraction`. If `currentStock - pillsPerDose < 0` → `negative_stock`. Only one warning is kept per slot: `odd_fraction` is set first and then overwritten by `negative_stock` if stock would go negative.
- **Low-stock detection:** a prescription is "low stock" if `inventoryWarning === "negative_stock"`, OR `currentStock != null && refillAlertPills != null && currentStock <= refillAlertPills`. Listed by `genericName`.
- **Skip-reason suggestion:** the picker pre-highlights "Ran out" (amber ring) when the slot is `negative_stock` or `no_inventory`.
- **Custom skip reason:** trimmed; Submit disabled if empty/whitespace.
- **Retroactive picker reset:** input resets to `defaultTime` on every open (Radix won't fire onOpenChange for controlled `open` changes, so reset keys off `open`).
- **Bulk un-take / edit-record gating:** disabled unless the slot has at least one `taken` dose.
- **Next-upcoming selection:** first time group (today) whose scheduled minutes ≥ now and that still has a pending dose.
- **Undo:** taking shows a 5s undo toast that reverses via untake; batch take reverses each dose.
- **Edit-time keying:** retroactive/edit always uses the dose's *scheduled* `localTime` as the lookup key; the user-chosen time is stored in `actionTimestamp` (displayed as "Taken at HH:MM").

---

## Sub-components / variants

- **ScheduleView** — orchestrator: derives groups, next-upcoming, low-stock; owns picker/drawer state and all take/skip/edit handlers.
- **TimeSlotGroup** — one clock-time bucket: heading (12h, red if overdue), Mark All / Edit All buttons, highlight for next-upcoming/all-done, renders DoseRows.
- **DoseRow** — single dose: pill icon+badge, name, dose label, food note, status line, Take/Skip/Edit buttons; hosts its own retroactive + edit time pickers.
- **WeekDaySelector** — 7-day strip with week chevrons and a friendly date caption.
- **MedTabBar** (med-footer.tsx) — 5-tab top navigation for the medications page.
- **DoseProgressSummary** — today's N-of-M progress bar / all-done card / low-stock line.
- **EmptySchedule** — cat-icon empty state with optional "Add a prescription".
- **SkipReasonPicker** — preset + custom skip-reason modal.
- **RetroactiveTimePicker** — native time-input modal for retroactive/edit timestamps.
- **BulkDoseEditDialog** — bottom drawer to Skip All / Un-Take / Edit Record a whole logged time slot.
- **PillIcon / PillIconWithBadge** — SVG pill renderer (5 shapes) with status badge overlay.
- **showUndoToast** (undo-toast.tsx) — helper that fires a 5s toast with an Undo action.
- **medication-ui-utils.ts** — `computeProgress`, `formatDoseAmount`, `formatPillCount`, phase-selection helpers, `getCurrentTimeHHMM`, haptics.
- **dose-schedule-service.ts** — `getDailyDoseSchedule` (the live read powering this whole view) + `getDoseScheduleForDateRange`, a range helper that iterates each day in `[startDate, endDate]` (parsing each via `T12:00:00`), calls `getDailyDoseSchedule` per day, and returns a `Map<date, DoseSlot[]>` for history/calendar views (not used by this surface directly).
