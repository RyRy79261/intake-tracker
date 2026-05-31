# 08 — Recent Entries List & Inline Edit / Dialog System

**Files covered:**
- `src/components/recent-entries-list.tsx` — `RecentEntriesList` + `InlineEditFormShell`
- `src/components/edit-intake-dialog.tsx` — `EditIntakeDialog` (water/sugar/sodium)
- `src/components/edit-eating-dialog.tsx` — `EditEatingDialog`
- `src/components/edit-substance-dialog.tsx` — `EditSubstanceDialog` (caffeine/alcohol)
- `src/components/edit-estimate-entry-dialog.tsx` — `EditEstimateEntryDialog` (shared base)
- `src/components/edit-urination-dialog.tsx` — `EditUrinationDialog` (wraps base)
- `src/components/edit-defecation-dialog.tsx` — `EditDefecationDialog` (wraps base)
- `src/hooks/use-edit-record.ts` — `useEditRecord` (inline tap-to-edit state machine)
- `src/hooks/use-record-adapters.ts` — `useRecordAdapters`, `initEditingState`, `EditingState`, `ValidationError` (dialog-based unified editor)
- `src/hooks/use-delete-with-toast.ts` — `useDeleteWithToast`
- `src/hooks/use-undo-delete-mutation.ts` — `useUndoDeleteMutation`
- Consumers: `src/components/liquids-card.tsx`, `src/components/food-salt/food-section.tsx`, `src/components/urination-card.tsx`, `src/components/weight-card.tsx`, `src/components/blood-pressure-card.tsx`, `src/components/history-drawer.tsx`, `src/components/analytics/records-tab.tsx`
- Supporting: `src/components/medications/undo-toast.tsx`, `src/lib/card-themes.ts`, `src/lib/constants.ts`

**Purpose:** The shared "Recent" entries pattern that every dashboard card renders below its input — a compact list of the last few logged records, each row clickable to open an inline edit form (or a full modal dialog in the history/analytics views), with delete + ~5s undo. It is the universal read/edit/delete surface for all record domains (water, sodium, sugar, potassium, weight, blood pressure, eating, urination, defecation, caffeine, alcohol).

---

## Features

### `RecentEntriesList` (the row list)
- Renders a top-border-separated section labeled **"Recent"** below a card's input controls.
- Shows up to `maxEntries` rows (default **3**; cards pass their own slice via the query, e.g. cards fetch the last **5** records).
- Each row's content columns are caller-supplied via `renderEntry(record)` — so the same shell renders water amounts, BP readings, weight, eating macros, urination estimates, etc.
- Renders nothing at all (returns `null`) when `records` is `undefined` or empty.
- Per-row **Delete** button (trash icon) on the right.
- When `onEdit` is provided, each row becomes a clickable button (hover/active background, keyboard-activatable) that swaps the row for an inline edit form.
- Inline edit form is rendered in place of the row (same key) via `renderEditForm()` when `editingId === record.id`.
- Generic over `T extends { id: string }`.

### `InlineEditFormShell` (the inline form chrome)
- Shared inline-form wrapper rendered inside a row when editing. Renders, in order: caller's domain children, a **datetime-local** field, a **note** field, then a **Save** / **Cancel** button row.
- Two label modes:
  - `labeled` (visible `<Label>` "Date and time" and "Note (optional)" above each field).
  - Unlabeled fallback (placeholder + `aria-label` only) for cards not yet migrated.
- Generates per-instance unique DOM ids via `useId()` so two shells with the same `idPrefix` never collide (regression-tested).
- Save button accepts a caller `buttonClassName` to tint it with the domain theme color.

### `useEditRecord` (inline tap-to-edit state machine)
- Manages the "tap recent entry → inline form → save" lifecycle for a single record type.
- Tracks `editingRecord` (or null), `editTimestamp`, `editNote`.
- `openEdit(record)` populates the common timestamp + note, then calls consumer `onOpen(record)` to hydrate extra fields (e.g. weight, systolic, beverage name).
- `handleEditSubmit()` parses/validates the timestamp, trims the note, calls consumer `buildUpdates()`, runs `mutateAsync`, then shows toast + closes on success.
- Uses a ref to the latest callbacks to avoid stale-closure bugs.

### `useRecordAdapters` + `initEditingState` (dialog-based unified editor)
- Used by the **history drawer** and **analytics records tab**, which edit any of 6 record types through full modal dialogs from one unified list.
- `initEditingState(type, record)` produces a discriminated `EditingState` ({ type, record, fields }) pre-populating typed string form fields per type.
- `useRecordAdapters()` returns a per-type `submit(id, fields)` adapter that parses/validates and calls the matching update mutation.
- `ValidationError` is a typed error subclass; the dialog host catches it to show its message as a toast (vs. a generic error).

### `useDeleteWithToast`
- Shared delete-with-spinner pattern. Tracks `deletingId`; `handleDelete(id)` sets the spinner, awaits the delete mutation, shows a success toast (caller-supplied message) or error toast, then clears the spinner.

### `useUndoDeleteMutation`
- Shared soft-delete mutation that, on success, shows an **Undo** toast (~5s window) whose action reverses the soft-delete by calling the domain's undo function. Used for intake, urination, defecation, eating.

### Per-type edit dialogs (modal variants)
- `EditIntakeDialog` — edits a water/sugar/sodium intake (amount + time + note); title, unit, accent color all derive from `record.type`.
- `EditEatingDialog` — edits an eating record (time + "what I ate" note + optional grams).
- `EditSubstanceDialog` — edits a caffeine or alcohol substance (time + description + amount; alcohol adds a volume field and a "standard drinks are derived" hint).
- `EditEstimateEntryDialog` — shared base for the "time + optional amount-estimate select + note" pattern.
- `EditUrinationDialog` / `EditDefecationDialog` — thin wrappers over the base with domain titles, options, placeholders, accent colors.

---

## User actions & interactions

### In the recent list (per row)
- **Tap/click a row** → opens that row's inline edit form (only when `onEdit` provided). Row is `role="button"`, `tabIndex=0`.
- **Enter / Space on focused row** → same as tap (only fires when the event target is the row itself, not a child input).
- **Tap the trash icon** → deletes the record; `stopPropagation` prevents the row's edit-open. Shows a spinner on that button while deleting and disables it.
- **Undo** (in toast, ~5s) → reverses the soft-delete (domains using `useUndoDeleteMutation`).

### In the inline edit form (`InlineEditFormShell`)
- Edit the **datetime-local** field (when the entry was recorded).
- Edit the **note** field (optional).
- Edit domain-specific children (amount, weight, beverage/caffeine/alcohol/sugar fields, sodium + source select, BP systolic/diastolic/HR/position/arm/irregular-heartbeat checkbox, urination amount-estimate select, etc.).
- **Save** → validate + persist (toast "Entry updated"; on validation failure shows a destructive toast and stays open).
- **Cancel** → closes the inline form without saving (`closeEdit`).

### In the modal dialogs (history/analytics)
- **Tap a record row** → opens the matching modal dialog (caffeine/alcohol open the substance dialog; in history-drawer caffeine/alcohol edits are explicitly skipped).
- Edit fields per type (amount/time/note, plus type extras).
- **Save Changes** (submit) → validate + persist, close on success, toast "Entry updated".
- **Cancel** / click backdrop / press Esc / `onOpenChange(false)` → close without saving.
- Focusing any input fires `onFocus` (keyboard-aware scroll) so the field stays visible above the mobile keyboard.

### Quick-add interactions adjacent to the list (context, in consumer cards)
- Urination: three quick-log buttons (Small/Medium/Large), "Add details" expander.
- Weight: −/+ steppers and tap-to-type inline value.
- BP: systolic/diastolic always-visible, "More options" expander.
- Food: "What I ate" text + AI sparkle parse, detail fields, "Record with details".

---

## States & presentations

### List-level states
- **Hidden/empty:** `records` undefined or empty → renders nothing (no "Recent" header).
- **Populated:** "Recent" header + up to `maxEntries` rows.
- **Loading (card-level):** consumer cards show skeletons/pulse blocks in the header/input area while `recentRecords === undefined`; the list itself simply renders nothing until data arrives.

### Row states
- **Default:** time + value columns, ghost trash button.
- **Hover (when editable):** `hover:bg-black/5 dark:hover:bg-white/5`, rounded, cursor-pointer.
- **Active/pressed:** `active:bg-black/10 dark:active:bg-white/10`.
- **Deleting:** trash icon becomes a spinning `Loader2`, button disabled (`deletingId === record.id`).
- **Editing:** the entire row is replaced by the inline edit form on a `bg-muted/30` rounded panel.

### Inline form states
- **Labeled vs. unlabeled** (visible labels vs. placeholder-only).
- **Validation error:** destructive toast (e.g. "Invalid amount", "Invalid weight", "Invalid values", "Invalid date/time"); form stays open.
- **Success:** toast "Entry updated", form closes.
- **Per-domain children variant:** different field sets per record type (see below).

### Dialog states
- **Open** (`record !== null` / `open` true) vs. **closed**.
- **Type-themed accent:** submit button tint and title vary by record type/source.
- **Conditional fields:** alcohol shows a volume field + hint; caffeine hides volume; eating grams field only when `onGramsChange` provided; defecation shows a "No estimate" sentinel option (`allowNoEstimate`).
- **Validation error toasts:** "Invalid amount", "Description required", "Invalid date/time", "ABV must be between 0 and 100", "Enter a volume greater than 0".

### Delete/undo states
- **Spinner-while-deleting**, **success toast**, **error toast** ("Could not delete the entry").
- **Undo toast:** title (e.g. "Record deleted" / domain message), Undo action button, auto-dismiss after **5000 ms**.

---

## Enums, options & configurable values

### `RecentEntriesList` props/defaults
- `maxEntries` default `3`. Cards typically fetch last `5` (Urination/Weight/BP/Eating) or use water query default (Liquids).
- `borderColor` — Tailwind class from the card theme (`CARD_THEMES[...].border`).
- Hover classes: `hover:bg-black/5 dark:hover:bg-white/5`; active: `active:bg-black/10 dark:active:bg-white/10`.

### `InlineEditFormShell` props
- `labeled` boolean (default `false`).
- `idPrefix` default `"edit"` (consumers use `"edit-liquid"`, `"edit-urination"`, `"edit-defecation"`, etc.).
- `buttonClassName` — theme button background.

### Urination / Defecation amount-estimate options
- `URINATION_AMOUNT_OPTIONS` = `[{small, "Small"}, {medium, "Medium"}, {large, "Large"}]`.
- `DEFECATION_AMOUNT_OPTIONS` = `[{small, "Small"}, {medium, "Medium"}, {large, "Large"}]`.
- Defecation dialog adds `allowNoEstimate` → "No estimate" sentinel (`__none__` mapped to `""`).
- Default urination amount comes from settings (`settings.urinationDefaultAmount`).

### Intake type → label / unit / accent (in `EditIntakeDialog`)
- `water` → "Water", unit `ml`, accent `bg-sky-600 hover:bg-sky-700`.
- `sugar` → "Sugar", unit `g`, accent `bg-pink-600 hover:bg-pink-700`.
- `salt`/sodium → "Sodium", unit `mg`, accent `bg-amber-600 hover:bg-amber-700`.

### Substance dialog (caffeine vs. alcohol)
- caffeine: label "Caffeine (mg)", step `1`, description placeholder "e.g. Flat white", theme `CARD_THEMES.caffeine` (yellow `bg-yellow-700 hover:bg-yellow-800`).
- alcohol: label "% ABV", step `0.1`, description placeholder "e.g. Glass of red wine", adds Volume (ml) field, theme `CARD_THEMES.alcohol` (fuchsia `bg-fuchsia-600 hover:bg-fuchsia-700`).

### Blood Pressure enums (inline form + dialog)
- `position`: `"sitting" | "standing"` (labels Sitting/Standing).
- `arm`: `"left" | "right"` (labels Left arm/Right arm).
- `irregularHeartbeat`: boolean (checkbox / Yes/No toggle).
- BP categories (from `getBPCategory`): Optimal, Normal, High normal, Grade 1 hypertension, Grade 2 hypertension, plus higher grades — thresholds at systolic ≥120/130/140/160 or diastolic ≥80/85/90/100.

### Food sodium sources (eating inline form)
- `SodiumSource`: `sodium` (×1.0), `salt` (×0.39), `msg` (×0.12). Select labels: Sodium / Salt / MSG.
- Optional trackers gate extra fields: sugar (`sugarEnabled`), potassium (`potassiumEnabled`).

### History/analytics filter tabs
- History drawer `FilterType` tabs: All, Water, Salt, Weight, BP, Eating, Urination, Defecation.
- Analytics records-tab full `FilterType`: `all | water | salt | sugar | potassium | weight | bp | eating | urination | defecation | caffeine | alcohol` (sugar/potassium tabs hidden unless tracker enabled).
- History drawer `PAGE_SIZE` = `30`; "Load More" pagination.

### Editable types (dialog editor)
- `EditableType`: `intake | weight | bp | eating | urination | defecation`. (Caffeine/alcohol use the separate substance dialog; in history-drawer they are not editable.)

### Undo toast
- Auto-dismiss `duration: 5000` ms; default title "Record deleted".

### Field constraints (inputs)
- Intake amount: `type=number min=1 step=1`, note `maxLength=200`.
- Eating grams: `min=1 max=10000`.
- Substance amount: `min=0`, caffeine step `1`, alcohol step `0.1`; alcohol ABV must be `0 < amt ≤ 100`.
- Weight inline: `step=0.01`.

---

## Data model touched

Reads/writes the following Dexie tables / interfaces (`src/lib/db.ts`); each also mirrored to Neon Postgres (`src/db/schema.ts`):

- **IntakeRecord** (`intakeRecords`): `id, type ("water"|"salt"|"sugar"|"potassium"), amount, timestamp, source?, note?, groupId?, originalInputText?, groupSource?` + audit/sync fields (`createdAt, updatedAt, deletedAt, deviceId, timezone`). Edit writes `amount, timestamp, note, source?`.
- **WeightRecord** (`weightRecords`): `weight (kg), timestamp, note?`. Edit writes `weight, timestamp, note`.
- **BloodPressureRecord** (`bloodPressureRecords`): `systolic, diastolic, heartRate?, irregularHeartbeat?, position ("standing"|"sitting"), arm ("left"|"right"), timestamp, note?`.
- **EatingRecord** (`eatingRecords`): `timestamp, grams?, note?, groupId?, originalInputText?, groupSource?`. Edit may also sync linked intake records (sodium/sugar/potassium/water content) via the composable-entry group.
- **UrinationRecord** (`urinationRecords`): `timestamp, amountEstimate? (string), note?`.
- **DefecationRecord** (`defecationRecords`): `timestamp, amountEstimate? ("small"|"medium"|"large"), note?`.
- **SubstanceRecord** (`substanceRecords`): `type ("caffeine"|"alcohol"), amountMg?, amountStandardDrinks?, abvPercent?, volumeMl?, description, source ("water_intake"|"eating"|"standalone"), aiEnriched?, timestamp, groupId?`. Edit writes `timestamp, description`, plus `amountMg` (caffeine) or `{abvPercent, volumeMl, amountStandardDrinks}` (alcohol).

Mutations come from React Query hooks: `useUpdate{Intake,Weight,BloodPressure,Eating,Urination,Defecation}`, `useDelete{Intake,Eating,Urination,Defecation,Weight,BloodPressure}`, plus composable-group sync hooks (`useSyncLiquidEntrySubstances`, `useSyncEatingGroup`) for linked substance/intake records.

---

## Validation, edge cases & business rules

- **Empty list:** `RecentEntriesList` short-circuits to `null` when records are undefined/empty.
- **Slice limit:** only the first `maxEntries` records render even if more are passed.
- **Delete vs. edit click conflict:** trash button calls `e.stopPropagation()` so deleting never opens the edit form.
- **Keyboard activation guard:** row key handler ignores Enter/Space that originate from a child input (`e.target !== e.currentTarget`).
- **Unique DOM ids:** `InlineEditFormShell` uses `useId()` so duplicate `idPrefix` values across mounted shells don't break `<label htmlFor>`.
- **Timestamp parsing:** `dateTimeLocalToTimestamp` throws (never NaN) on invalid input; handlers catch it and surface "Invalid date/time". In adapters it is re-raised as `ValidationError`.
- **Amount validation:** intake amount must parse to a number > 0; weight must parse > 0; BP systolic/diastolic must parse > 0; HR (if present) must parse > 0.
- **Note handling:** trimmed; blank becomes `undefined` (field omitted from the update). Note max 200 chars in the intake dialog.
- **Eating composable edit:** edits back-convert stored sodium-mg into the user's chosen input unit using `SODIUM_MULTIPLIERS`; disabled trackers (sugar/potassium) are omitted entirely so linked records are left untouched; clearing a substance field to blank/0 soft-deletes the linked record.
- **Liquid composable edit:** caffeine/alcohol/sugar fields sync to linked `SubstanceRecord`/sugar intake; clearing a field (empty string) sets it to 0 → soft-deletes any existing linked substance; beverage name persists into `source` as `beverage:<name>` for plain beverages; preset/group-linked names live on the substance description.
- **Alcohol math:** ABV % must be `0 < amt ≤ 100` AND volume > 0 before persisting; standard drinks are derived (`standardDrinksFromAbv(abv, volume)`, rounded to 2 dp). Legacy records without `abvPercent` back-derive ABV from `amountStandardDrinks` + `volumeMl`.
- **Substance description required:** alcohol/caffeine edit rejects a blank description.
- **Stale async guard:** liquid/food `onOpen` uses an `openTokenRef` so a slow `fetchEntryGroup` result from a previously opened record is discarded if the user opened another.
- **History-drawer caffeine/alcohol:** `openEdit` returns early for those types (no inline edit there); analytics records-tab does route them to the substance dialog.
- **Timezone/day-start:** timestamps stored as Unix ms; `datetime-local` conversions are local-time based (`timestampToDateTimeLocal` / `dateTimeLocalToTimestamp`); quick-add time inputs cap at `getCurrentDateTimeLocal()` (no future entries).
- **Soft-delete + undo:** deletes set `deletedAt`; the undo toast's action reverses it within ~5s; both delete and undo go through `ServiceResult`/`unwrap`.

---

## Sub-components / variants

- `RecentEntriesList` — generic recent-rows list with per-row delete + click-to-edit; renders `null` when empty.
- `InlineEditFormShell` — inline edit form chrome (children + datetime + note + Save/Cancel), labeled/unlabeled modes, collision-safe ids.
- `useEditRecord<T>` — inline tap-to-edit state machine (one record type per card).
- `useRecordAdapters` / `initEditingState` / `EditingState` / `ValidationError` — unified dialog-based editor used by history drawer & analytics.
- `useDeleteWithToast` — delete + spinner + success/error toast.
- `useUndoDeleteMutation` — soft-delete + 5s Undo toast.
- `EditIntakeDialog` — modal water/sugar/sodium editor (type-driven label/unit/accent).
- `EditEatingDialog` — modal eating editor (time + note + optional grams).
- `EditSubstanceDialog` — modal caffeine/alcohol editor (alcohol adds volume + derived-drinks hint).
- `EditEstimateEntryDialog` — shared base for time + amount-estimate select + note records.
- `EditUrinationDialog` — base wrapper (violet accent, Small/Medium/Large).
- `EditDefecationDialog` — base wrapper (stone accent, allowNoEstimate).
- `showUndoToast` (`undo-toast.tsx`) — plain function rendering an Undo `ToastAction`, 5000 ms.
- Consumer cards (`LiquidsCard`, `FoodSection`, `UrinationCard`, `WeightCard`, `BloodPressureCard`) — each wires `RecentEntriesList` + `InlineEditFormShell` + `useEditRecord` + `useDeleteWithToast` with its domain fields.
- `HistoryDrawer` / analytics `records-tab` — full-list views using the modal dialogs + `useRecordAdapters` instead of inline editing.
