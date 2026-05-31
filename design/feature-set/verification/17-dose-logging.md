# Verification — 17-dose-logging

**Verdict:** minor-gaps  ·  checked 96 claims, verified 90.

All "Files covered" were read in full (dose-log-service.ts, dose-detail-dialog.tsx,
bulk-dose-edit-dialog.tsx, skip-reason-picker.tsx, retroactive-time-picker.tsx,
undo-toast.tsx, use-medication-queries.ts) plus the supporting set
(dose-row.tsx, time-slot-group.tsx, schedule-view.tsx, dose-schedule-service.ts,
medication-ui-utils.ts, compound-utils.ts, app/medications/page.tsx, db.ts,
inventory-service.ts, audit-service.ts). The document is substantially accurate;
the issues found are example/label nuances and one mis-attributed inventory-warning
enum member, not behavioral errors.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | Header example "`Vymada 100mg (Sacubitril/Valsartan)`" — implies a combo header shows the summed strength `100mg`. | For a combo, `headerStrength = formatCompoundShort(splitDose(schedule.dosage, compounds))`, which renders the **split per-compound** form (e.g. `49/51mg`), never a bare `100mg`. The example contradicts the doc's own correct statement on line 22. The summed `{dosage}{unit}` form is only used for **single-compound** drugs. | dose-detail-dialog.tsx:132-134; compound-utils.ts:57-63 |
| low | Header "generic name in parentheses" shown as "`(Sacubitril/Valsartan)`", implying the slash-joined compound names are computed. | The parenthetical is literally `prescription.genericName` — a stored string, not derived via `formatCompoundNames`. It renders as "(Sacubitril/Valsartan)" only if that exact string was stored as the generic name; the code does no compound-name composition here. | dose-detail-dialog.tsx:151 |
| low | "Inventory warnings: `negative_stock \| no_inventory \| odd_fraction`" listed as one set of "inventory warnings". | `inventoryWarning` (the DoseSlot field set in dose-schedule-service) only ever takes `no_inventory`, `odd_fraction`, or `negative_stock`. `odd_fraction` is *also* used as an **audit** `warning` value in takeDose, but the doc conflates the audit warning and the slot warning under one bullet. Minor: the three strings are real, but they are not a single shared enum (no TS union type exists — all are bare `string`). | dose-schedule-service.ts:198-213; dose-log-service.ts:323-324 |
| low | "DoseDetail … Tap **UNTAKE** … Haptic." and table row implies a distinct take-haptic. | UNTAKE and SKIP in the detail dialog both call `hapticSkip()` (the `[30,50,30]` pattern), not the take haptic. The doc's haptic table (vibrate(50) take / [30,50,30] skip) is correct, but the per-action rows don't make clear untake uses the *skip* haptic. Non-material. | dose-detail-dialog.tsx:78 (handleUntake → hapticSkip), :92 (handleSkip → hapticSkip) |
| low | Service-layer read-helper bullet lists `getDailyDoseSchedule` among `dose-log-service.ts` "Read helpers". | `getDailyDoseSchedule` lives in **dose-schedule-service.ts**, not dose-log-service.ts. The other read helpers (`getDoseLogsForDate`, `getDoseLog`, `getDoseLogsWithDetailsForDate`) are correctly in dose-log-service.ts. Mild file mis-grouping. | dose-schedule-service.ts:93 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | DoseDetailDialog is mounted by **app/medications/page.tsx**, not by ScheduleView (which the doc's orchestrator bullet might imply). page.tsx owns `doseDetailOpen`/`selectedSlot` and renders `<DoseDetailDialog>`; ScheduleView only emits `onDoseClick`. | app/medications/page.tsx:66-71; schedule-view.tsx:323 |
| low | `getDoseScheduleForDateRange(startDate, endDate)` — a date-range variant returning `Map<date, DoseSlot[]>` for history/calendar views — exists in the same service surface but is not mentioned. | dose-schedule-service.ts:250-272 |
| low | `formatDoseAmount` has a *third* form not described: a **single-compound with inventory** dose renders as `{formatPillCount(pillsPerDose)} of {dosageMg}{unit}` (e.g. "½ tablet of 50mg"), and a combo-with-inventory as "{formatPillCount} of {compoundShort}". The doc only describes the "N of XXmg" idea loosely. | medication-ui-utils.ts:90-105 |
| low | ScheduleView surfaces low-stock warnings (`lowStockWarnings`) computed from `negative_stock` OR `currentStock <= refillAlertPills`, passed to `DoseProgressSummary`. The doc mentions negative_stock "surfaces low-stock warnings" but omits the refillAlertPills threshold path and the DoseProgressSummary consumer. | schedule-view.tsx:95-111 |
| low | `nextUpcomingTime` highlight only considers slots with status `pending` (not `missed`), and only on today; an overdue-but-pending slot already past `now` won't be picked as "next upcoming". Doc's "next pending time slot" is roughly right but the >= now + pending-only gating is unstated. | schedule-view.tsx:76-92 |
| low | `editDoseTime` audit details payload is `{prescriptionId, date, time, newTime}` only (no dosageMg/pillsConsumed), unlike take/untake/skip/reschedule. Doc's generic audit-details shape ("{…dosageMg, pillsConsumed…}") doesn't note this slimmer edit payload. | dose-log-service.ts:655-657 |
| low | `InventoryTransaction.type` union also includes `"refill" \| "adjusted" \| "initial"`; the doc only cites `"consumed"` (correct for this unit's writes, but the enum is wider). | db.ts:262 |

## Spot-confirmed

- `LATE_THRESHOLD_MINUTES = 30`; late = `nowMinutes - schedMinutes > 30`. Mark-All uses the same `> 30` check. — dose-row.tsx:23,30; schedule-view.tsx:251
- Undo toast `duration: 5000` ms, plain function with `ToastAction`. — undo-toast.tsx:23-28
- `calculatePillsConsumed` = `Math.round((doseMg/pillStrengthMg)*10000)/10000`, returns 0 when strength is 0. — dose-log-service.ts:78-82
- `isCleanFraction` clean set `[0.25, 0.333, 0.5, 0.667, 0.75]` + whole numbers, tolerance `0.01`. — dose-log-service.ts:89-94
- Stock decrement allows negative; rounded to 4 decimals; inventory tx `type: "consumed"`, `amount: -pillsConsumed` on take, `+pillsConsumed` on untake/skip/reschedule. — dose-log-service.ts:279-303, 360-383, 429-452, 500-523
- Idempotent take via `wasTaken` guard (no re-decrement). — dose-log-service.ts:264-269
- `editDoseTime` regex `^(\d{1,2}):(\d{2})$`, h 0–23 / m 0–59, throws "Dose is not logged as taken" when not taken. — dose-log-service.ts:632-648
- Reschedule marks old slot `rescheduled` (storing `rescheduledTo: newTime`), creates new `pending` slot at newTime. — dose-log-service.ts:528-537
- `deriveStatus`: rescheduled→"skipped", no-log past→"missed", today/future no-log→"pending". — dose-schedule-service.ts:59-78
- Audit actions present in db.ts: `dose_taken`, `dose_untaken`, `dose_skipped`, `dose_rescheduled`, `dose_time_edited`. — db.ts:37-46
- `DoseStatus = "taken" | "skipped" | "rescheduled" | "pending"`; `DoseSlotStatus = "taken" | "skipped" | "pending" | "missed"`. — db.ts:138; dose-schedule-service.ts:17
- `PillShape = "round"|"oval"|"capsule"|"diamond"|"tablet"`, default "round"/"#ccc"; `FoodInstruction = "before"|"after"|"none"` → "{instruction} eating". — db.ts:136-137; dose-detail-dialog.tsx:149,174
- Skip presets exactly `["Forgot","Side effects","Ran out","Doctor advised","Don't need this dose"]` + custom; Submit disabled on blank; Enter submits; "Ran out" amber-ring when `suggestRanOut`. — skip-reason-picker.tsx:14-20,63-64,84-86,78-80
- `suggestRanOut` = `negative_stock || no_inventory`. — schedule-view.tsx:335-337
- RetroactiveTimePicker resets to `defaultTime` on each `open` via useEffect keyed on `[open, defaultTime]`. — retroactive-time-picker.tsx:34-38
- Bulk dialog: drawer `max-h-[85vh]`, list `max-h-[50vh]`, UN-TAKE/EDIT RECORD `disabled:opacity-40` when `!hasTaken`; SKIP ALL targets `status !== "skipped"`; EDIT RECORD default = `batchLoggedTime` (first taken log's clock time). — bulk-dose-edit-dialog.tsx:50-55,109,125,168-180,59
- Haptics: take `vibrate(50)`, skip `vibrate([30,50,30])`. — medication-ui-utils.ts:117,127
- `formatPillCount` glyphs ¼ ½ ¾ + "tablet"/"tablets". — medication-ui-utils.ts:63-83
- Undo description "Dose logged -- no stock tracked" when no inventory; else "{pillsPerDose} pill(s) deducted". — schedule-view.tsx:126-129,162-165
- `getDailyDoseSchedule`: hides doses before `prescription.createdAt`, day-of-week via `daysOfWeek.includes(dayOfWeek)` (0=Sunday), enabled schedules, active phase with titration overriding maintenance. — dose-schedule-service.ts:178-182,107-143,140-143
- Batch wrappers (`takeAllDoses`/`skipAllDoses`/`editAllDoseTimes`) loop per-entry, each its own transaction, aggregate errors into a string. — dose-log-service.ts:562-589,595-622,676-695
- Live reads via `useLiveQuery`; `useDailyDoseSchedule` returns `undefined` initially (no default arg). — use-medication-queries.ts:82-92
- All 8 dose mutation hooks + 3 live-read hooks present. — use-medication-queries.ts:213-262,82-92

## Low-confidence / could-not-verify

- "Offline / syncing … each enqueues a sync-queue entry and calls `schedulePush()`": confirmed each mutation calls `enqueueInsideTx(...)` inside the tx and `schedulePush()` after (dose-log-service.ts:286,304,317,328,333 etc.). The deeper claim that `schedulePush()` is "deferred background sync" was not traced into sync-engine.ts — accepted as plausible, not independently verified.
- "Drawer/dialog … drag down dismisses": this is vaul/Radix default behavior for the `Drawer` primitive; not asserted in these component files, so taken on faith as standard library behavior.
- "70% opacity" for skipped detail/card: confirmed `opacity-70` on the skipped DoseRow card (dose-row.tsx:74); the Detail dialog itself does not apply 70% opacity (the claim is about the row, which is correct).
