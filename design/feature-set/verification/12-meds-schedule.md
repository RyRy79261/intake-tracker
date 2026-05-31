# Verification — 12-meds-schedule

**Verdict:** accurate · checked 96 claims, verified 95.

This unit's doc is unusually faithful to the code. Every enum, preset, threshold,
default, calculation, status-derivation rule, and component behavior was checked
against the actual source. Only one wording nuance (Zustand "persistence") is
arguably misleading, and one date-caption format is loosely transcribed; both are
low severity. No described-but-nonexistent features were found.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Persists active tab in a Zustand store so it survives within the session." (line 40) | The store uses plain `create` with **no `persist` middleware**; its own comment says "Not persisted — same lifetime semantics as the previous useState pair." It is module-level in-memory state: it survives in-app navigation/remounts but is lost on page reload. The word "Persists" could mislead a reader into expecting localStorage/reload survival. The "survives within the session" half is accurate. | `src/stores/medication-ui-store.ts:10,19-24` |
| low | Day caption for arbitrary dates shown as "`<Weekday Month D>, <Mon D, YYYY>`" (line 35) | Actual caption is `${dateLabel}, ${fullDate}` where `dateLabel` = `toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})` → e.g. "Monday, Jun 3", and `fullDate` = "Jun 3, 2026". So the rendered string is "Monday, Jun 3, Jun 3, 2026" (weekday is long, and the weekday segment itself contains a comma before the month). The doc's shorthand is directionally right but omits that the weekday label is comma-joined to the month and that month/day repeats. | `week-day-selector.tsx:30-39,61-66,124-126` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | DoseDetailDialog (the tap-to-detail target referenced throughout the doc) also exposes its own **RESCHEDULE** action (today only) with a time input → `rescheduleDose`, plus SKIP / TAKE / UNTAKE, and a retroactive picker for past-date takes. The doc lists DoseDetailDialog as the tap target but never enumerates its in-dialog actions (it is not in "Files covered", so this is informational). | `dose-detail-dialog.tsx:104-117,202-244,273-279` |
| low | `inventoryWarning` precedence: `odd_fraction` is assigned first but **overwritten by `negative_stock`** when stock would go negative (only one warning survives per slot). The doc lists the three codes but does not state that negative_stock wins over odd_fraction. | `dose-schedule-service.ts:205-213` |
| low | `getDoseScheduleForDateRange` (range helper) is mentioned in passing (line 256) but its behavior — iterating each day via `T12:00:00` parsing and returning a `Map<date, DoseSlot[]>` for history/calendar views — is not described. Peripheral to this surface. | `dose-schedule-service.ts:250-272` |
| low | `medication-schedule-service.ts` also exposes `getDailySchedule(dayOfWeek)` and `getSchedulesForPhase()` reads (used by Rx/Settings tabs), and its schedules read additionally filters `deletedAt === null` alongside `enabled`. The doc only credits this file for add/update/delete schedule mutations. | `medication-schedule-service.ts:28-82` |

## Spot-confirmed (sample of key claims confirmed)

- DoseSlotStatus enum `"taken" | "skipped" | "pending" | "missed"` — `dose-schedule-service.ts:17`.
- DoseStatus enum `"taken" | "skipped" | "rescheduled" | "pending"`; `rescheduled` → slot `skipped` — `db.ts:138`, `dose-schedule-service.ts:69`.
- PillShape `"round" | "oval" | "capsule" | "diamond" | "tablet"`; default no-inventory shape `round` / color `#ccc` — `db.ts:136`, `dose-row.tsx:85-86`.
- Pill badge: taken=emerald+check, skipped=gray+X, rescheduled=amber+clock, pending=no badge; badge=45% of icon; row icon size 36px — `pill-icon.tsx:67,71-74,75`, `dose-row.tsx:86`.
- FoodInstruction `"before" | "after" | "none"`; rendered " -- before eating"/" -- after eating", `none` hidden — `db.ts:137`, `dose-row.tsx:47,100`.
- Inventory warning codes `"negative_stock" | "no_inventory" | "odd_fraction"` — `dose-schedule-service.ts:42,198,206,212`.
- Skip presets `["Forgot","Side effects","Ran out","Doctor advised","Don't need this dose"]` + free text; "Ran out" amber ring when negative_stock/no_inventory; custom trimmed, Submit disabled while blank — `skip-reason-picker.tsx:14-20,62-65,44,84`, `schedule-view.tsx:334-337`.
- MedTab enum + icons: schedule/CalendarDays, prescriptions/Rx/ClipboardList, medications/Meds/Pill, titrations/TrendingUp, settings/Settings; default `schedule` — `med-footer.tsx:7,9-15`, `medication-ui-store.ts:20`.
- Weekday labels `["Sun".."Sat"]`, week starts Sunday (index 0, `getDay()`), `daysOfWeek` is `number[]` 0=Sunday — `week-day-selector.tsx:8`, `dose-schedule-service.ts:103,142`, `db.ts:217`.
- `LATE_THRESHOLD_MINUTES = 30`; on-time = `nowMinutes - schedMinutes <= 30` today → immediate take, else retroactive; Mark-All late `nowMinutes - schedMinutes > 30`; past dates always retroactive — `dose-row.tsx:23,25-31,50`, `schedule-view.tsx:251`.
- Overdue heading red = today + `now > scheduled` + has pending/missed — `time-slot-group.tsx:32-37,57,72`.
- Next-upcoming: today only, first group with `schedMinutes >= nowMinutes` AND a `status==="pending"` slot — `schedule-view.tsx:76-92`.
- Undo toast duration `5000`ms, label "Undo" — `undo-toast.tsx:18,26`.
- Haptics: take `navigator.vibrate(50)`, skip `vibrate([30,50,30])` — `medication-ui-utils.ts:116-128`.
- Clean fractions: whole numbers + `[0.25,0.333,0.5,0.667,0.75]`, 0.01 tolerance; glyphs ¼/½/¾; pill math `round(x*10000)/10000` (4 dp) — `dose-log-service.ts:89-94,78-82`, `medication-ui-utils.ts:63-79`.
- `pillsPerDose = round(dosageMg / strength, 4)`; no inventory → `no_inventory` + "Dose logged -- no stock tracked"; odd → `odd_fraction`; `currentStock - pillsPerDose < 0` → `negative_stock` — `dose-schedule-service.ts:197-214`, `schedule-view.tsx:128`.
- Low-stock list: `negative_stock` OR (`currentStock != null && refillAlertPills != null && currentStock <= refillAlertPills`), by `genericName` — `schedule-view.tsx:99-108`.
- Progress: `total` = all slots, `pct = round((taken+skipped)/total*100)`, `allDone = total>0 && pending===0`; green card only when `allDone && total>0` — `medication-ui-utils.ts:136-160`, `dose-progress-summary.tsx:15`.
- Progress summary rendered only when `isToday` — `schedule-view.tsx:308-310`.
- Pre-creation cutoff: skips slots where `dateStr < prescription.createdAt` (ISO date) — `dose-schedule-service.ts:178-182`.
- Titration overrides maintenance when titration phase has `titrationPlanId` — `dose-schedule-service.ts:123-133`.
- Day-of-week parse via `new Date(dateStr + "T12:00:00")` — `dose-schedule-service.ts:101-103`.
- Day-of-week filter `daysOfWeek.includes(dayOfWeek)`, schedules filtered `enabled === true` — `dose-schedule-service.ts:140-143`.
- Status derivation: log present → mapped; no log: today→pending, past→missed, future→pending — `dose-schedule-service.ts:59-78`.
- RetroactiveTimePicker resets to `defaultTime` on `open` (Radix won't fire onOpenChange for controlled open) — `retroactive-time-picker.tsx:34-38`.
- Bulk gating: SKIP ALL always enabled; UN-TAKE & EDIT RECORD `disabled={!hasTaken}` + `opacity-40`; drawer `max-h-[85vh]`, dose list `max-h-[50vh]` scroll — `bulk-dose-edit-dialog.tsx:159,166-186,109,125`.
- Skip All targets `status !== "skipped"`; Un-Take iterates `status === "taken"` — `bulk-dose-edit-dialog.tsx:50,59,74-85`.
- Edit-time keying uses scheduled `localTime` as lookup; chosen time stored in `actionTimestamp`, shown "Taken at HH:MM" — `dose-row.tsx:157,64-66`, `dose-log-service.ts:251-257,628-661`.
- Combination dose label `formatPillCount + " of " + 49/51mg` (e.g. "2 tablets of 49/51mg") — `medication-ui-utils.ts:90-105`, `compound-utils.ts:57-63`.
- Empty state: Cat icon + "No medications scheduled for today" + optional "Add a prescription" → `onAddMed` (opens wizard via `setWizardOpen(true)`) — `empty-schedule.tsx:13-26`, `medications/page.tsx:34-36`.
- Tab bar: active = teal text + teal underline bar (`absolute ... h-0.5 bg-teal-600`); inactive muted, hover→foreground, focus-visible ring — `med-footer.tsx:35,41,32-36`.
- Week cell: selected = `bg-teal-600 text-white`; today-unselected = `ring-1 ring-teal-500` + teal numeral; default hover bg + `active:scale-95` — `week-day-selector.tsx:91-105`.
- Mutations enqueue `_syncQueue` + `auditLogs` and call `schedulePush()`; pill deductions are `inventoryTransactions` type `consumed` linked by `doseLogId` — `dose-log-service.ts:286,291-304,317,327-328,333`.
- Inventory transaction types `"refill" | "consumed" | "adjusted" | "initial"` — `db.ts:262`.
- Mutation input types `TakeDoseInput` (opt `takenAtTime`), `UntakeDoseInput`, `SkipDoseInput` (`reason`), `RescheduleDoseInput`, `EditDoseTimeInput` (`newTime`) — `dose-log-service.ts:22-68`.

## Low-confidence / could-not-verify

- None. All "Files covered" sources plus the tap-to-detail dialog, compound utils, and `db.ts` enum/interface definitions were read in full and corroborated. The `page-skeletons.tsx` reference resolves to `src/components/page-skeletons.tsx` (exists; the doc gave only a bare filename, not a wrong path).
