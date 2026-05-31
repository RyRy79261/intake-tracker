# 09 — History Drawer

**Files covered:**
- `src/components/history-drawer.tsx` (the bottom-sheet container + edit-dialog wiring)
- `src/hooks/use-history-queries.ts` (`useHistoryData` — reactive multi-table loader + weight/BP delete)
- `src/lib/history-types.ts` (`UnifiedRecord`, `FilterType`, grouping/filtering helpers)
- `src/components/history/record-row.tsx` (`RecordRow` — one row per entry)
- `src/hooks/use-record-adapters.ts` (`useRecordAdapters`, `EditingState`, `FieldMap`, validation, submit)
- `src/components/edit-intake-dialog.tsx`
- `src/components/edit-weight-dialog.tsx`
- `src/components/edit-blood-pressure-dialog.tsx`
- `src/components/edit-eating-dialog.tsx`
- `src/components/edit-urination-dialog.tsx` (+ shared `src/components/edit-estimate-entry-dialog.tsx`)
- `src/components/edit-defecation-dialog.tsx` (+ shared `EditEstimateEntryDialog`)
- `src/lib/card-themes.ts` (per-domain icon, label, colours)
- `src/lib/constants.ts` (amount-estimate options, liquid presets)
- `src/lib/utils.ts` (`getLiquidTypeLabel`), `src/lib/date-utils.ts` (`formatTimeOnly`, timestamp ↔ datetime-local)
- `src/lib/db.ts` (record interfaces)

**Purpose:** A full-screen (96vh) bottom sheet that unifies every health-tracking domain into one reverse-chronological, date-grouped, type-filterable feed where the user can view, inline-edit, and delete any logged entry. It is the single cross-domain "history" surface; per-domain cards elsewhere only show recent/today data.

---

## Features

- **Cross-domain unified feed.** Merges six record domains into one list: water/salt/sugar/potassium intake, weight, blood pressure, eating, urination, defecation. (The `UnifiedRecord` type and filter set also model `caffeine` and `alcohol` substances, but the drawer's loader currently does NOT fetch substance records — see Edge cases.)
- **Reactive data.** Data comes from `useHistoryData()` which uses Dexie `useLiveQuery`; the list auto-refreshes whenever any underlying table changes (add/edit/delete from anywhere in the app), no manual refetch.
- **Reverse-chronological sort.** All records are merged and sorted by `timestamp` descending (newest first) before paging.
- **Date grouping.** Records are grouped under a date header using a locale key formatted `"Mon, Jan 15, 2026"` (`weekday: short, year: numeric, month: short, day: numeric`, en-US). Each header shows the date + a count pill ("N entries" / "1 entry").
- **Per-day entry count pill.** Rounded muted pill next to each date showing the number of entries that day, with singular/plural wording.
- **Type filter tabs.** Horizontal scrollable filter bar; one tab per domain plus "All". Selecting a tab filters the visible list (client-side, applied after paging).
- **Pagination ("Load More").** Client-side paging of `PAGE_SIZE = 30`. Page starts at 1; "Load More" increments the page, appending another 30 from the already-loaded (max 100 per table) dataset. Button only shows while `hasMore` is true.
- **Per-row summary.** Each row shows a domain icon (coloured), an uppercase type label, a domain-formatted measurement string, the entry time (`formatTimeOnly`, e.g. "2:30 PM"), and Edit + Delete action buttons.
- **Domain-specific measurement formatting** (see Validation): intake amount+unit+source label, weight in kg, BP "120/80 mmHg", eating note, urination/defecation amount-estimate · note, caffeine "desc · NN mg", alcohol "desc · N drinks".
- **Inline edit.** Tapping a row (or its Edit button) opens a domain-specific edit dialog pre-filled with the record's current values.
- **Inline delete.** Trash button deletes the entry (soft-delete via the domain service), with a per-row spinner while in flight and a success/error toast.
- **Empty state.** When no records match the current filter, shows a History icon + "No records yet" / "Start logging to see history here".
- **Loading state.** While `historyData` is undefined and the drawer is open, shows a centered spinner.
- **Toasts.** Success ("Entry deleted" / "Entry updated") and error toasts on delete/edit; validation errors surface their message as a destructive toast.
- **PIN protection removed.** A code comment notes PIN protection was removed in "phase 41"; `handleOpenChange` is now a passthrough.

## User actions & interactions

- **Open/close drawer.** Controlled via `open` / `onOpenChange` props; drag-down or backdrop dismiss closes it (standard `vaul`/shadcn Drawer, `direction="bottom"`).
- **Tap a filter tab.** Sets `filter` state; active tab renders as `variant="default"` tinted with that domain's `buttonBg` colour (except "All", which stays plain default). Filtering is instant; paging is NOT reset on filter change.
- **Scroll the filter bar.** Tabs overflow horizontally (`overflow-x-auto`) so all tabs are reachable on narrow screens.
- **Scroll the list.** The list body is independently scrollable (`flex-1 overflow-y-auto`); header (title + tabs) is pinned (`shrink-0`, `border-b`).
- **Tap "Load More".** Loads the next 30 records (page + 1). Disabled/hidden when no more.
- **Tap a row body.** Opens the edit dialog for that record (`onClick={onEdit}`, also `role="button"`, `tabIndex=0`, Enter/Space activate). Caffeine/alcohol rows are non-editable: `openEdit` early-returns for those types.
- **Tap the Edit (pencil) button.** Same as tapping the row; the action cluster `stopPropagation`s so the two buttons don't double-fire.
- **Tap the Delete (trash) button.** Immediately deletes (no confirmation dialog). Shows a spinner on that row's trash button (`isDeleting`) and disables it while pending.
- **Edit dialog — change fields.** Per domain (amount/weight/systolic/diastolic/heartRate/position/arm/timestamp/note/amount-estimate). Inputs are controlled via `patchFields`.
- **Edit dialog — submit ("Save Changes").** Validates, persists via the domain's React Query update mutation, closes the dialog, toasts "Entry updated". On `ValidationError`, keeps the dialog open and toasts the validation message (destructive). On any other error, toasts a generic "Could not update the entry".
- **Edit dialog — Cancel / dismiss.** Closes without saving (`onClose` clears `editingRecord`).
- **Keyboard-aware focus scroll.** All edit inputs receive `onFocus={scrollOnFocus}` (from `useKeyboardAwareScroll`) so the focused field scrolls into view above the mobile soft keyboard.

## States & presentations

- **Closed.** Drawer not rendered; `allRecords` short-circuits to `[]` when `!open` (no data work while closed).
- **Loading.** `open && !historyData` → centered `Loader2` spinner, py-12. (No skeleton rows; just the spinner.)
- **Empty (no matches).** `filteredRecords.length === 0` (after filtering the current page) → History icon (12×12, 30% opacity) + two-line empty message. Note: this triggers if the active filter has no matches even when other records exist.
- **Populated.** Date-grouped sections, each with a Calendar-icon header, count pill, and rows under a top border.
- **Has-more.** `allRecords.length > page * PAGE_SIZE` → "Load More" button with ChevronDown.
- **Row default.** Hover background `hover:bg-muted/30`, pointer cursor, bottom hairline border.
- **Row deleting.** That row's trash icon swaps to a spinning `Loader2` and is disabled.
- **Filter tab active vs inactive.** Active = `default` button variant + domain colour (non-"all"); inactive = `outline` variant. Text size `text-xs`, `shrink-0`.
- **Edit dialog open vs closed.** Each `Edit*Dialog` is open iff its `record !== null`; the drawer derives one nullable edit-state per domain from `editingRecord.type`.
- **Validation-error (edit).** Dialog stays open; destructive toast with the specific message ("Invalid amount" / "Invalid weight" / "Invalid values" / "Invalid date/time").
- **Success.** Delete → "Entry deleted" / "Record removed". Edit → "Entry updated".
- **Error.** Delete failure → destructive "Error / Could not delete the entry". Edit failure → destructive "Error / Could not update the entry".
- **Offline/syncing.** Not specially handled in this component — all reads/writes go to local Dexie (offline-first), so the drawer functions identically offline; sync to Postgres happens out-of-band.
- **Per-domain colour theming.** Icon colour and active-filter/Save-button colours come from `CARD_THEMES` (see enums below).

## Enums, options & configurable values

**Filter tabs rendered (`FILTER_TABS` in component), value → label:**
- `all` → "All"
- `water` → "Water"
- `salt` → "Salt"
- `weight` → "Weight"
- `bp` → "BP"
- `eating` → "Eating"
- `urination` → "Urination"
- `defecation` → "Defecation"

**`FilterType` union (history-types.ts) — superset including types NOT in the visible tab bar:**
`"all" | "water" | "salt" | "sugar" | "potassium" | "weight" | "bp" | "eating" | "urination" | "defecation" | "caffeine" | "alcohol"`. (sugar/potassium/caffeine/alcohol are filterable in code but have no rendered tab in this drawer.)

**`UnifiedRecord` domain types:** `intake | weight | bp | eating | urination | defecation | caffeine | alcohol`.

**`EditableType` (use-record-adapters):** `intake | weight | bp | eating | urination | defecation` (caffeine/alcohol are explicitly NOT editable here).

**Intake sub-types (`IntakeRecord.type`):** `water | salt | sugar | potassium`. Units in rows: water → `ml`, sugar → `g`, salt/sodium → `mg` (potassium falls into the `salt` row branch → `mg`).

**Card theme labels / icons / icon colours (`CARD_THEMES`):**
- water — "Water", Droplets, sky-600/400; buttonBg `bg-sky-600 hover:bg-sky-700`
- salt — "Sodium", Sparkles, amber-600/400; `bg-amber-600 hover:bg-amber-700`
- sugar — "Sugar", Candy, pink-600/400; `bg-pink-600 hover:bg-pink-700`
- potassium — "Potassium", Banana, purple-600/400; `bg-purple-600 hover:bg-purple-700`
- weight — "Weight", Scale, emerald-600/400; `bg-emerald-600 hover:bg-emerald-700`
- bp — "Blood Pressure", Heart, rose-600/400; `bg-rose-600 hover:bg-rose-700`
- eating — "Eating", Utensils, orange-600/400; `bg-orange-600 hover:bg-orange-700`
- urination — "Urination", Droplet, violet-600/400; `bg-violet-600 hover:bg-violet-700`
- defecation — "Defecation", CircleDot, stone-600/400; `bg-stone-600 hover:bg-stone-700`
- caffeine — "Caffeine", Coffee, yellow-700/400 (display only)
- alcohol — "Alcohol", Wine, fuchsia-600/400 (display only)

**Pagination:** `PAGE_SIZE = 30`; initial `page = 1`. Loader `limit` default `100` per table (`useHistoryData(100)`).

**Date group key format:** en-US, `{ weekday:"short", year:"numeric", month:"short", day:"numeric" }`.
**Row time format:** en-US, `{ hour:"numeric", minute:"2-digit", hour12:true }`.

**BP edit dialog enums & input ranges:**
- Position: `sitting | standing` (Select; labels "Sitting" / "Standing").
- Arm: `left | right` (Select; "Left" / "Right").
- Irregular heartbeat: `no | yes` (Select; only rendered if `onIrregularHeartbeatChange` is provided — NOT wired by the history drawer, so hidden here).
- Systolic input `min=60 max=300`; Diastolic `min=40 max=200`; Heart rate `min=30 max=250` (optional, placeholder "BPM").
- sr-only hints: systolic "typically 90-180", diastolic "60-120", heart rate "60-100".

**Intake edit dialog:** amount input `type=number min=1 step=1`; label "Amount (unit)" with unit from sub-type; note `maxLength=200`. Title "Edit {Water|Sugar|Sodium} Entry". Save button colour matches sub-type (sky/pink/amber).

**Weight edit dialog:** weight input `type=number min=0.1 step=0.1`; label "Weight (kg)". Save colour emerald.

**Eating edit dialog:** time + "What I ate (optional)" Textarea (placeholder "e.g. Sandwich, apple") + optional grams input `min=1 max=10000` (grams only shown if `onGramsChange` passed — NOT wired here). Save colour orange.

**Urination/Defecation edit dialogs (shared `EditEstimateEntryDialog`):**
- Urination amount options (inline in component): `small`→"Small", `medium`→"Medium", `large`→"Large". Note placeholder "e.g. colour, urgency". Accent violet. No "No estimate" option.
- Defecation amount options (`DEFECATION_AMOUNT_OPTIONS`): `small`/`medium`/`large` (same labels). `allowNoEstimate` → prepends "No estimate" sentinel (`__none__` → stored as `""`). Note placeholder "e.g. consistency, urgency". Accent stone.
- `URINATION_AMOUNT_OPTIONS` also defined in constants (same small/medium/large) though the urination dialog uses its own inline copy.

**Liquid source labels (`getLiquidTypeLabel`, used for water-intake row source):** decodes `source` strings like `coffee:latte`→"Latte", `beverage:Juice`→"Juice", `juice:orange`→"Orange", `food:*`→note or "Food", `preset:{id}`→preset name (from `liquidPresets`) or "Beverage", `manual`/`preset:manual`→null. `liquidPresets` passed from settings store (defaults include Espresso, Double Espresso, Moka, Coffee, Tea, Beer, Wine, Spirit — see `DEFAULT_LIQUID_PRESETS`).

## Data model touched

Reads (via `useHistoryData`, each capped at `limit=100`, soft-deletes excluded):
- **intakeRecords** — `getRecordsByCursor(undefined, 100)` (orderBy timestamp desc, filters `deletedAt === null`).
- **weightRecords** — `getWeightRecords(100)`.
- **bloodPressureRecords** — `getBloodPressureRecords(100)`.
- **eatingRecords** — `getEatingRecords(100)`.
- **urinationRecords** — `getUrinationRecords(100)`.
- **defecationRecords** — `getDefecationRecords(100)`.

Writes:
- **Delete** — intake via `useDeleteIntake`; eating/urination/defecation via their `useDelete*` mutations; weight/BP via `useHistoryData().deleteWeight`/`deleteBP` → `deleteWeightRecord`/`deleteBloodPressureRecord` (all soft-delete: set `deletedAt`).
- **Update** — via `useRecordAdapters` → `useUpdateIntake/Weight/BloodPressure/Eating/Urination/Defecation`.

Key fields per interface (`db.ts`):
- `IntakeRecord`: id, type, amount, timestamp, source?, note?, groupId?, groupSource?, originalInputText?, + sync fields (createdAt, updatedAt, deletedAt, deviceId, timezone).
- `WeightRecord`: id, weight (kg), timestamp, note?, + sync fields.
- `BloodPressureRecord`: id, systolic, diastolic, heartRate?, irregularHeartbeat?, position (`standing|sitting`), arm (`left|right`), timestamp, note?, + sync fields.
- `EatingRecord`: id, timestamp, grams?, note?, groupId?, groupSource?, originalInputText?, + sync fields.
- `UrinationRecord`: id, timestamp, amountEstimate?, note?, + sync fields.
- `DefecationRecord`: id, timestamp, amountEstimate? (`small|medium|large`), note?, + sync fields.
- `SubstanceRecord` (caffeine/alcohol): id, type, amountMg?, amountStandardDrinks?, abvPercent?, volumeMl?, description, source, timestamp, + sync fields (referenced by row rendering only; not loaded by this drawer).

Common sync fields on every record: `createdAt`, `updatedAt`, `deletedAt` (null = active), `deviceId`, `timezone`.

## Validation, edge cases & business rules

- **Soft-delete model.** Deletes set `deletedAt`; the cursor/list queries filter out `deletedAt !== null`. The cursor fetch over-fetches (`limit + 1`, then drops soft-deleted) to compensate.
- **Edit validation (per domain, throws `ValidationError`):**
  - intake: `parseInt(amount)`; reject if NaN or ≤ 0 ("Invalid amount").
  - weight: `parseFloat(weight)`; reject if NaN or ≤ 0 ("Invalid weight").
  - bp: `parseInt(systolic/diastolic)`; reject if either NaN or ≤ 0 ("Invalid values"); heartRate optional (parsed only if present).
  - timestamp: `dateTimeLocalToTimestamp` throws on bad input → re-raised as `ValidationError("Invalid date/time")`.
  - note: trimmed; empty → stored as `undefined` (intake/eating/urination/defecation trim; weight/bp use `|| undefined` without trim).
  - urination/defecation amount: empty estimate → `undefined`.
- **Timezone / datetime-local conversion.** `timestampToDateTimeLocal` strips the timezone offset to produce a local "YYYY-MM-DDTHH:mm" string for the input; `dateTimeLocalToTimestamp` reverses it. Editing time uses local interpretation (no day-start-hour logic here).
- **Date grouping uses local calendar day** (via `toLocaleDateString`), not the app's configurable day-start hour — so group boundaries are midnight-to-midnight regardless of `dayStartHour` settings.
- **Paging vs filtering order.** Records are sliced to `page * PAGE_SIZE` FIRST, THEN filtered by type. Consequence: a type filter can show very few (or zero) rows even when more matching records exist beyond the current page; "Load More" reflects the unfiltered total. The empty state can appear for a filter while "All" has data.
- **Loader cap.** Each table is independently capped at 100 records; the merged feed therefore tops out at 600 rows max before any are excluded. Per-table load failures are caught and logged (`console.error`), leaving that domain empty rather than failing the whole drawer (`EMPTY_RESULT` fallback while loading).
- **Caffeine & alcohol are display-only.** The `UnifiedRecord`/`RecordRow`/`FilterType` support them, but `useHistoryData` does not fetch `substanceRecords`, and `openEdit` early-returns for them — so in this drawer they never appear and are never editable. (Substance history lives elsewhere.)
- **Delete has no confirmation.** Single tap deletes immediately (only the in-flight spinner guards double-taps via `disabled`).
- **Row click vs action buttons.** The action button container `stopPropagation`s click events so tapping Edit/Delete doesn't also trigger the row's `onEdit`.
- **`grams` / `irregularHeartbeat` optionality.** The eating grams field and BP irregular-heartbeat select are conditionally rendered on optional callbacks that the history drawer does not pass → hidden here, though the underlying records carry those fields.
- **Reactive consistency.** Because `useLiveQuery` re-runs on any table change, an edit/delete made elsewhere (or the one just made here) updates the list without manual invalidation.

## Sub-components / variants

- `HistoryDrawer` — the bottom-sheet shell: header (title/description + filter tabs), scrollable grouped list, Load-More, and the six mounted edit dialogs.
- `useHistoryData` — reactive multi-table loader (Dexie `useLiveQuery`) + `deleteWeight`/`deleteBP` async helpers.
- `RecordRow` (memoized) — single entry row: icon, type label, measurement, time, Edit + Delete buttons; encodes per-domain measurement formatting.
- `useRecordAdapters` / `initEditingState` / `FieldMap` / `EditingState` / `ValidationError` — typed edit state + per-domain submit/validation adapters.
- `EditIntakeDialog` — amount + time + note (sub-type-aware unit/label/colour).
- `EditWeightDialog` — weight (kg) + time + note.
- `EditBloodPressureDialog` — systolic/diastolic/heart-rate + position/arm Selects (+ optional irregular-heartbeat) + time + note.
- `EditEatingDialog` — time + "What I ate" textarea (+ optional grams).
- `EditUrinationDialog` / `EditDefecationDialog` — thin wrappers over `EditEstimateEntryDialog` (time + amount-estimate Select + note), differing by options, "No estimate" allowance, placeholder, and accent colour.
- `EditEstimateEntryDialog` — shared "time + optional estimate + note" edit form.
- `CARD_THEMES` — per-domain label/icon/colour token source.
- `getLiquidTypeLabel` — decodes water-intake `source` into a human label using liquid presets.
- `groupRecordsByDate` / `filterRecords` / `getRecordTimestamp` / `getRecordId` — pure helpers for grouping, type-filtering, and field access on `UnifiedRecord`.
