# 19 — Edit Medication

**Files covered:**
- `src/components/medications/edit-medication-drawer.tsx` (the `PrescriptionViewDrawer` component + its three internal tabs: `ScheduleTab`, `DetailsTab`, `InfoTab`)
- `src/hooks/use-medication-queries.ts` (read/mutation hooks the drawer consumes)
- `src/hooks/use-medicine-search.ts` (`useMedicineSearch` — the AI contraindications/warnings fetch hook the Info tab imports on its own line)
- `src/lib/medication-ui-utils.ts` (`getMaintenancePhase`, `getActiveTitrationPhase`)
- `src/lib/phase-service.ts` (`CreatePhaseInput`, `UpdatePhaseInput`, `startNewPhase`, `updatePhase` semantics)
- `src/lib/db.ts` (`Prescription`, `MedicationPhase`, `PhaseSchedule`, `FoodInstruction` interfaces)
- Adjacent (entry point / sibling editors, referenced but rendered elsewhere): `src/components/medications/compound-card-expanded.tsx` (opens the drawer), `src/components/medications/interactions-section.tsx`, `src/components/medications/brand-switch-picker.tsx`

**Purpose:** A bottom drawer for editing one existing prescription. It exposes three tabs — **Schedule** (edit the maintenance/baseline dosing schedule), **Details** (name, reason, notes, active toggle, delete), and **Info** (AI-fetched contraindications & warnings, reviewable/editable). It edits records that already exist; it is not the add-medication wizard.

---

## Features

### Container (`PrescriptionViewDrawer`)
- Renders as a `Drawer` (bottom sheet) capped at `max-h-[90dvh]`, flex column.
- Header shows the prescription's `genericName` as the title, and `indication` (or literal "Prescription" fallback) as a muted subtitle.
- Re-reads live data: it pulls the full `usePrescriptions()` list and re-selects the current record by `id` (`prescriptions.find(p => p.id === prescription?.id)`) so edits made in any tab reflect immediately without a prop change; falls back to the passed-in `prescription`.
- Returns `null` (renders nothing) when no prescription is resolvable.
- Three-tab navigation (`Tabs`), default tab = **Schedule**.

### Schedule tab (`ScheduleTab`)
- Edits the **maintenance ("baseline") phase** schedule for the prescription — for minor tweaks only. Formal dose increases/decreases are directed to the separate Titrations flow.
- Resolves the maintenance phase via `getMaintenancePhase(phases)` (prefers `type==="maintenance" && status==="active"`, else any maintenance phase).
- Detects an active titration via `getActiveTitrationPhase(phases)` (`type==="titration" && status==="active" && titrationPlanId` set) and shows a warning banner if one is running.
- Loads the maintenance phase's schedules (`useSchedulesForPhase`) and hydrates editable rows, sorted ascending by `time` (`a.time.localeCompare(b.time)`).
- Each schedule row edits: **time** (HH:MM), **dosage** (number), and **days of week** (7 toggle buttons).
- Editable **dosage unit** (free text, default `"mg"`).
- Editable **food instruction** (3-way segmented selector).
- Add a new dose row (defaults to `time: "20:00"`, empty dosage, all 7 days selected).
- Remove a dose row.
- Toggle individual days per row.
- Computes validity: counts `validRows` and whether `allRowsValid`.
- Save persists via `updatePhase` (existing maintenance phase) or `startNewPhase` (if no maintenance phase exists yet — creates one of `type: "maintenance"` with `startDate: Date.now()`).
- Saving a schedule here does **not** trigger a notification resync: the drawer saves via the phase mutations (`useUpdatePhase`/`useStartNewPhase`), which have no `onSuccess: resyncNotifications`. Only the schedule-level hooks (`useAddSchedule`/`useUpdateSchedule`/`useDeleteSchedule`) call `resyncNotifications()` → `syncMedicationNotifications()`, and those hooks are not used by this drawer. (`updatePhase`/`startNewPhase` rewrite the schedule rows directly but do not resync local notifications.)
- Discard (reset) abandons unsaved edits and re-hydrates from the DB.

### Details tab (`DetailsTab`)
- Read view: shows Active toggle, "Reason for use" (`indication` or "None specified"), "Notes" (or "No notes added."), and a destructive Delete button.
- Edit view (toggled by Edit button): editable **Active** switch, **Name** (`genericName`), **Reason for use** (`indication`), **Notes** (`Textarea`, 3 rows).
- The Active toggle behaves differently per mode: in read mode it persists immediately on change; in edit mode it only updates local state until the explicit Save.
- Save persists name, indication, notes, isActive via `useUpdatePrescription`.
- Delete shows a native `confirm()` dialog, then **soft-deletes** the prescription **and its history** (sets `deletedAt` on the prescription, phases, schedules, and inventory items; dose logs and inventory transactions are hard-deleted), and closes the drawer. The confirm copy reads "cannot be undone" — there is no in-app undo — but the records are soft-deleted (recoverable via sync history), not erased.

### Info tab (`InfoTab`)
- Shows stored **Contraindications** (red heading) and **Warnings** (amber heading) lists, or empty placeholders.
- Contraindications are rendered title-cased (first char upper, rest lower); warnings rendered verbatim.
- "Refresh AI Data" button calls `useMedicineSearch()` with the prescription's `genericName` to fetch fresh `{ contraindications, warnings }`.
- Returns a **review state** (pending AI data) before committing: lists the proposed new contraindications & warnings with Reject / Edit / Accept actions.
- An **edit sub-state** lets the user hand-edit the proposed contraindications and warnings as newline-delimited textareas before saving.
- Accept (or Save edits) persists arrays to the prescription via `useUpdatePrescription`.

---

## User actions & interactions

### Container
- **Tap a tab** (Schedule / Details / Info) → switches view; default is Schedule.
- **Swipe down / tap scrim / drag handle** (Drawer behavior) → `onOpenChange(false)` closes.

### Schedule tab
- **Edit unit input** → sets `unit`, marks form dirty.
- **Tap food-instruction button** (Anytime / before eating / after eating) → sets `foodInstruction`, marks dirty.
- **Edit time input** (`type="time"`) on a row → updates that row, marks dirty.
- **Edit dosage input** (`type="number"`, `step="any"`, `min="0"`) on a row → updates that row, marks dirty.
- **Tap a day toggle** (Su…Sa) → adds/removes that weekday for the row (kept sorted ascending), marks dirty.
- **Tap trash icon** (per row) → removes the row, marks dirty.
- **Tap "Add time"** → appends a new row (default 20:00, empty dose, all 7 days), marks dirty.
- **Tap "Discard"** (only visible when dirty) → resets dirty flag, re-hydrates from DB.
- **Tap "Save schedule"** (only visible when dirty; enabled only when `canSave`) → persists via `updatePhase`/`startNewPhase`, clears dirty.

### Details tab
- **Tap "Edit"** (pencil) → enters edit mode, exposes input fields.
- **Tap X** (edit header) → cancels edit mode without saving.
- **Tap check (teal)** (edit header) → saves name/indication/notes/isActive, exits edit mode.
- **Type in Name / Reason / Notes** inputs → update local state.
- **Toggle Active switch (read mode)** → persists `isActive` immediately.
- **Toggle Active switch (edit mode)** → updates local state only (committed on Save).
- **Tap "Delete Prescription"** → native confirm; on confirm, deletes and closes drawer.

### Info tab
- **Tap "Refresh AI Data"** → fetches AI contraindications/warnings into a pending review.
- **Tap "Reject"** (review) → discards pending data, returns to stored view.
- **Tap "Edit"** (review) → enters edit-AI state with prefilled textareas (joined by `\n`).
- **Tap "Accept"** (review) → persists pending contraindications & warnings.
- **Type in Contraindications / Warnings textareas** (edit state) → update local edit strings.
- **Tap "Cancel"** (edit state) → returns to review without saving.
- **Tap "Save"** (edit state) → splits text by line, trims, filters empties, persists, clears pending.

---

## States & presentations

### Container
- **Empty / no prescription:** renders `null`.
- **Live update:** re-selects the current record from the live `usePrescriptions()` list, so any tab's mutation reflects across the whole drawer.

### Schedule tab
- **Active-titration banner:** amber callout (`bg-amber-50 dark:bg-amber-950/30`, `TrendingUp` icon) warning that titration overrides today's doses and these edits affect the baseline schedule that resumes after titration. Shown only when `activeTitration` exists. A *pending* (planned-but-not-running) titration produces **no** banner — the drawer only checks `getActiveTitrationPhase`, ignoring the sibling `getPendingTitrationPhase`/`getEffectivePhase` utils.
- **Always-on hint:** muted instruction text steering formal dose changes to the Titrations tab.
- **Empty schedule:** dashed-border placeholder "No doses scheduled. Add a time below." when `rows.length === 0`.
- **Default / populated:** one bordered card per dose row (time input, dosage input, unit label, remove button, 7 day toggles).
- **Day toggle states:** selected = `bg-primary text-primary-foreground border-primary`; unselected = muted text + input border + hover bg.
- **Dirty (unsaved):** the Discard / Save action bar appears only when `dirty === true`.
- **Save disabled:** Save button disabled unless `canSave` (`dirty && allRowsValid && !isSaving`).
- **Saving:** Save button shows a `Loader2` spinner; both buttons disabled (`isSaving` = `updatePhase.isPending || startNewPhase.isPending`).
- **Save accent:** teal (`bg-teal-600 hover:bg-teal-700`).

### Details tab
- **Read mode (default):** Active toggle card, Reason text (or "None specified"), Notes block (or "No notes added."), destructive Delete button.
- **Edit mode:** Active toggle card (local-only), editable Name / Reason / Notes inputs; header swaps Edit button for X (cancel) + check (save) icons.
- **Saving (prescription update):** check icon → `Loader2` spinner; button disabled while `updatePrescription.isPending`.
- **Deleting:** Delete button → `Loader2` spinner; disabled while `deletePrescription.isPending`.

### Info tab
- **Stored view (default):** Refresh button + Contraindications (red) and Warnings (amber) lists, or muted "No contraindications listed." / "No warnings listed." placeholders.
- **Refreshing:** Refresh button shows `Loader2`; disabled while `isRefreshing || updatePrescription.isPending`.
- **Refresh failure (silent):** `handleRefresh` wraps the AI call in `try/catch`; on error it only logs `console.error("Failed to refresh AI data", e)` and returns to the stored view. There is no error toast or banner — a failed refresh is indistinguishable from a refresh that returned nothing.
- **Review state (pending AI data):** teal-bordered card ("Review AI Information") listing new contraindications & warnings (or "None found."), with Reject / Edit / Accept buttons. The same title-casing/verbatim split as the stored view applies here: proposed contraindications are rendered title-cased, proposed warnings verbatim.
- **Accepting:** Accept button → `Loader2` spinner; disabled while `updatePrescription.isPending`.
- **Edit-AI state:** "Edit AI Information" heading, two textareas (red-labelled Contraindications, amber-labelled Warnings, 5 rows each), Cancel / Save buttons.
- **Saving edits:** Save button → `Loader2` spinner; disabled while pending.

### Cross-cutting
- No explicit loading skeleton; live queries default to `[]` so the UI renders empty rather than a spinner during initial hydration.
- No explicit offline/syncing state in this component (Dexie writes are local-first; sync handled elsewhere).
- Hydration guard: the Schedule tab will NOT overwrite the user's in-progress edits when DB data changes — `useEffect` early-returns while `dirty`.

---

## Enums, options & configurable values

### Tabs
- `schedule`, `details`, `info` — labels "Schedule", "Details", "Info". Default = `schedule`.

### Day-of-week
- `DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]`
- `ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]` (0 = Sunday). New rows default to all 7 selected.

### Food instruction (`FoodInstruction`)
- Values: `"none"`, `"before"`, `"after"`.
- Button labels: `none → "Anytime"`, `before → "before eating"`, `after → "after eating"`.
- Default for a new/empty maintenance phase: `"none"`.

### Dosage unit
- Free-text string; default `"mg"`. Stored on the phase (`MedicationPhase.unit`).

### New-row defaults
- `time: "20:00"`, `dosage: ""` (empty), `daysOfWeek: [0..6]`.

### Inputs
- Dosage: `type="number"`, `step="any"`, `min="0"`.
- Time: `type="time"` (HH:MM, 24-hour).
- Notes (Details): `Textarea` rows=3.
- AI edit textareas: rows=5 each.

### Phase types / statuses (referenced)
- `PhaseType`: `"maintenance" | "titration"`.
- Phase `status`: `"active" | "completed" | "cancelled" | "pending"`.
- `startNewPhase` from this drawer always creates `type: "maintenance"`.

### Styling tokens
- Save accent: `bg-teal-600 hover:bg-teal-700`; save icon color `text-teal-600`.
- Titration banner: amber theme.
- Contraindication heading/label: red (`text-red-500 dark:text-red-400`).
- Warning heading/label: amber (`text-amber-500 dark:text-amber-400`).

---

## Data model touched

### `Prescription` (`db.ts`, table `prescriptions`)
- **Reads:** `id`, `genericName`, `indication`, `notes`, `isActive`, `contraindications?: string[]`, `warnings?: string[]`.
- **Writes (Details):** `genericName`, `indication`, `notes`, `isActive` (via `useUpdatePrescription`).
- **Writes (Info):** `contraindications`, `warnings`.
- **Deletes:** prescription + history (via `useDeletePrescription`) — soft-delete of the prescription/phases/schedules/inventory (`deletedAt`), hard-delete of dose logs + inventory transactions.
- (Not edited here: `compounds`, `createdAt`, `updatedAt`, `deletedAt`, `deviceId` — system/derived.)

### `MedicationPhase` (`db.ts`, table `medicationPhases`)
- **Reads:** `type`, `status`, `unit`, `foodInstruction`, `titrationPlanId`. `usePhasesForPrescription` returns the phase array; `unit`/`foodInstruction` are read off the single maintenance phase that `getMaintenancePhase(phases)` selects from it.
- **Writes (Schedule save):** `unit`, `foodInstruction`, plus child schedules — via `updatePhase` (existing) or `startNewPhase` (creates a maintenance phase with `startDate: Date.now()`).

### `PhaseSchedule` (`db.ts`, table `phaseSchedules`)
- **Reads:** `id`, `time`, `dosage`, `daysOfWeek` (via `useSchedulesForPhase`). Note `time` is the `@deprecated` HH:MM string field (kept for v10 DB record compatibility; the canonical field is `scheduleTimeUTC`), but the drawer still reads and writes `time`.
- **Writes:** rows mapped to `{ id?, time, dosage: parseFloat(...), daysOfWeek }` and passed to `updatePhase`/`startNewPhase`, which add/update/delete schedule records and derive `scheduleTimeUTC` / `anchorTimezone` **client-side** inside `updatePhase`/`startNewPhase` (via `localHHMMStringToUTCMinutes(time, deviceTimezone)`) — not server-side. Existing rows keep their `id`; new rows omit it.

### Service / hook layer
- Read hooks: `usePrescriptions`, `usePhasesForPrescription`, `useSchedulesForPhase`.
- Mutation hooks: `useUpdatePrescription`, `useDeletePrescription`, `useUpdatePhase`, `useStartNewPhase`.
- Info tab: `useMedicineSearch` (AI fetch, server route `/api/ai/medicine-search`) — defined in `src/hooks/use-medicine-search.ts` (a separate file from the medication-queries hooks above).
- Phase inputs (`phase-service.ts`): `UpdatePhaseInput` ( `id`, optional `unit`, `foodInstruction`, `status`, `schedules: { id?, time, daysOfWeek, dosage }[]`, …), `CreatePhaseInput` (`prescriptionId`, `type`, `unit`, `startDate`, `foodInstruction`, `schedules[]`, …).

---

## Validation, edge cases & business rules

- **Row validity:** `isRowValid` = non-empty dosage **AND** `parseFloat(dosage) > 0` **AND** `daysOfWeek.length > 0`.
- **All-or-nothing save:** Save requires `rows.length > 0` and **every** row valid (`allRowsValid`). This deliberately prevents a half-edited row from being silently dropped from the mutation (only `validRows` are written, so an invalid row would vanish — hence the guard).
- **Dirty gating:** action bar (Discard/Save) is hidden until any edit. Save also requires `dirty`.
- **Hydration vs. unsaved edits:** the Schedule `useEffect` returns early while `dirty`, so live DB changes never clobber in-progress edits.
- **No maintenance phase yet:** Save creates one via `startNewPhase` (`type: "maintenance"`, `startDate: Date.now()`). Side effect: `startNewPhase` auto-completes any currently-active phase for the prescription (sets the prior active phase to `status: "completed"` with an `endDate`) before activating the new one. It can also create a `pending` phase when `startDate > now`, but the drawer always passes `Date.now()`, so the new phase is always created `active`.
- **Active titration override:** When a titration is active, today's actual doses follow the titration plan; edits here only affect the baseline maintenance schedule, which resumes after the titration ends (warning banner communicates this).
- **Dosage parsing:** stored as `parseFloat(r.dosage)` (number); `step="any"` allows decimals/fractional mg.
- **Day toggle ordering:** `daysOfWeek` always re-sorted ascending after a toggle.
- **Schedule sort:** rows hydrate sorted ascending by string time.
- **Delete is destructive (soft-delete, no in-app undo):** guarded by native `confirm("Permanently delete this prescription and all its history? This cannot be undone.")`; the cascade **soft-deletes** the prescription, phases, schedules, and inventory items (`deletedAt`) and **hard-deletes** dose logs + inventory transactions; closes drawer on success. No in-app undo, but soft-deleted rows remain recoverable via sync history (matching `deletePrescription` in 15-prescriptions.md).
- **Active toggle dual behavior:** immediate persist in read mode, deferred (committed on Save) in edit mode — a subtle UX rule to avoid double writes during an edit session.
- **Details re-sync on prop change:** `useEffect` resets all local Details fields and exits edit mode whenever the `prescription` prop changes.
- **Info AI text normalization:** on Save-edits, both fields `split("\n")` → `trim()` → `filter(Boolean)`, so blank lines are dropped; contraindications are title-cased only on display, stored as-fetched/edited.
- **Info empty results:** AI returning no items still renders "None found." in review and persists empty arrays on accept.
- **Notification resync:** This drawer's saves do **not** resync local medication notifications. Resync is wired only through the schedule-level hooks (`useAddSchedule`/`useUpdateSchedule`/`useDeleteSchedule` → `resyncNotifications()`), which this drawer does not call — it saves through the phase mutations (`useUpdatePhase`/`useStartNewPhase`), which rewrite the schedule rows but have no resync.

---

## Sub-components / variants

- **`PrescriptionViewDrawer`** — top-level drawer; resolves live prescription, renders header + 3 tabs.
- **`ScheduleTab`** — edits maintenance-phase unit, food instruction, and per-time dose rows (time/dose/days); add/remove rows; dirty-gated save via `updatePhase`/`startNewPhase`.
- **`DetailsTab`** — read/edit prescription name, indication, notes, active toggle; destructive delete with confirm.
- **`InfoTab`** — AI-assisted contraindications/warnings with stored / review / edit sub-states.
- **`SchedRow`** (interface) — local row shape `{ id?, time, dosage(string), daysOfWeek }`.
- **Entry point — `compound-card-expanded.tsx`** — renders/opens the drawer for a selected prescription (not part of the drawer file).
- **Related sibling editors (rendered elsewhere, same domain, NOT inside this drawer):**
  - **`InteractionsSection`** (`interactions-section.tsx`) — shows contraindications (AVOID), warnings (CAUTION) and drug-class (INFO) badges; "Refresh interactions" checks against other active prescriptions. Auth-gated.
  - **`BrandSwitchPicker`** (`brand-switch-picker.tsx`) — dialog to switch the active pill brand among non-archived inventory items for the prescription (activate selected, deactivate prior, toast confirmation).
