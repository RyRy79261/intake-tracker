# 16 — Titrations

**Files covered:**
- `src/components/medications/titrations-view.tsx` (top-level tab view)
- `src/components/medications/titrations/titration-plan-card.tsx` (plan card + expand + lifecycle actions + phase rows)
- `src/components/medications/titrations/titration-drawer.tsx` (create/edit drawer)
- `src/components/medications/titrations/rx-entry-card.tsx` (per-prescription entry editor + maintenance prefill + edit-schedule loader)
- `src/components/medications/titrations/maintenance-row.tsx` (read-only current-maintenance summary row)
- `src/components/medications/titrations/use-titration-drawer-form.ts` (drawer form state hook)
- `src/components/medications/titrations/types.ts` (`RxEntry`, `DAY_LABELS_LONG`)
- `src/lib/titration-service.ts` (CRUD + lifecycle transactions over Dexie)
- `src/app/api/ai/titration-warnings/route.ts` (AI warning-sign generation endpoint)
- `src/hooks/use-medication-queries.ts` (live queries + mutation hooks, lines ~305–356)
- `src/lib/db.ts` (interfaces: `TitrationPlan`, `MedicationPhase`, `PhaseSchedule`, `Prescription`, `DoseLog`; types `TitrationPlanStatus`, `PhaseType`, `FoodInstruction`)
- `src/app/medications/page.tsx` (mounts `TitrationsView` under the `titrations` tab)

**Purpose:** The Titrations unit lets a single user plan, run, and finalize multi-prescription dosage adjustments ("titrations") — e.g. ramping a heart-failure drug from one strength to another over time — while AI optionally drafts warning signs to watch. A titration plan is a draft/active/completed/cancelled container that spins up temporary "titration" medication phases (overriding each drug's normal "maintenance" schedule), and on completion either promotes those new doses to become the new maintenance baseline or reverts on cancel.

---

## Features

- **Tab entry point.** Rendered as the `titrations` tab inside the Medications page tab bar (alongside `schedule`, `medications`, `prescriptions`, `settings`); the page only conditionally mounts `<TitrationsView />`. The header line ("Manage dosage adjustments across prescriptions.") and the "New" button (Plus icon) live inside `TitrationsView` itself, not the page-level tab bar.
- **Plan list, grouped by status into three sections:**
  - **Active** — plans with `status === "active"` (only shown if non-empty).
  - **Planned** — plans with `status === "draft"` (only shown if non-empty).
  - **Past** — plans with `status === "completed"` OR `status === "cancelled"` (only shown if non-empty).
  - Each section has an uppercase tracking-wide tiny label.
- **Plan cards** (`TitrationPlanCard`): show title, a status badge, condition label, and a prescription count ("N prescription(s)"). Active cards get a highlighted (emerald) 2px border. If a `recommendedStartDate` exists, a short start-date label (e.g. "May 31") shows on the right next to a chevron.
- **Inline warnings preview.** A plan's `warnings[]` (amber, with AlertTriangle icons) are shown on the card when the plan is active OR when the card is expanded.
- **Expandable plan detail.** Tapping a card expands (animated height/opacity + chevron rotates 180°) to reveal: per-prescription phase rows, optional italic notes, and a lifecycle action bar.
- **Per-prescription phase rows** (`PhaseEntryRow`): show the prescription's generic name, a phase-status badge (active / pending / other), and each schedule line (time, formatted dose, and day-of-week subset when not all 7 days). The displayed time is the **deprecated `s.time` HH:MM string** rendered verbatim — display still reads the legacy `time` field even though `scheduleTimeUTC` is the source of truth for writes. (Same for `MaintenanceRow` and the maintenance prefill panel.)
- **Compound dose formatting.** For combination drugs (`isCombo`), doses are split via `splitDose(mg, compounds)` and rendered with `formatCompoundShort(...)`; otherwise plain `"{mg}{unit}"` (unit is typically "mg").
- **Current Maintenance section.** Below the plans, lists every active prescription's current active maintenance phase as a read-only `MaintenanceRow`: generic name, total daily dose ("/day"), indication, and each schedule line (time, dose, day subset). Sorted by generic name (locale compare). Rows with no active maintenance phase / no schedules render nothing.
- **Create plan** via drawer: title, start mode (immediate vs scheduled date), one-or-more prescription entries each with one-or-more dose schedules, free-text warning signs, and notes.
- **Edit plan** via the same drawer (draft or active plans). Prefills title/notes/warnings/start and reloads each phase's schedules. Start-mode on prefill: if `recommendedStartDate` exists → the date field is populated and `startNow = false`; otherwise `startNow` defaults to `plan.status === "active"` (active plans with no scheduled date default back to "start immediately").
- **AI warning-sign generation.** "AI Suggest" button (gated by auth) calls `/api/ai/titration-warnings`, which uses Claude (premium model, temperature 0, forced tool call) acting as a "clinical pharmacist assistant" to return 4–8 short patient-friendly warning sentences. Results are appended (newline-joined) to the warnings textarea; the user can still hand-edit.
- **Maintenance prefill into a titration entry.** When a prescription with an active maintenance phase is selected in an entry, a blue "Current maintenance" panel shows its existing schedule with a "Copy to titration" button that copies those times/days/doses into the entry's titration schedules.
- **Lifecycle transitions:**
  - **Activate** (draft → active): flips plan + all `pending` phases to `active`, sets their `startDate = now`.
  - **Complete & Promote** (active → completed): copies each titration phase's schedules onto the prescription's maintenance phase (replacing old maintenance schedules), re-activates maintenance, copies titration's `unit` + `foodInstruction`, marks the titration phase completed (sets `endDate`). Confirmation dialog warns it "cannot be undone".
  - **Cancel** (active → cancelled): cancels active/pending plan phases (sets `endDate`), re-activates the most recently completed maintenance phase for each affected prescription. Confirmation dialog.
  - **Delete** (draft or cancelled only): soft-deletes the plan, its phases, and their schedules. Confirmation dialog.
- **Audit logging.** Every mutation writes an audit entry (`phase_started`, `titration_plan_updated`, `phase_activated`, `phase_completed`) and enqueues a sync push. Note these are not four distinct lifecycle actions: **both Cancel and Delete reuse the `phase_completed` action type**, disambiguated only by a metadata `action` field (`titration_cancelled` vs `titration_deleted`).
- **Offline-first + sync.** All reads/writes go to Dexie (IndexedDB) and enqueue sync-queue upserts inside the transaction; `schedulePush()` runs after each mutation. Live queries (`useLiveQuery`) keep the UI reactive.
- **Dose-log remapping on edit.** When entries are replaced during edit, existing dose logs are remapped from old phase IDs to the new phase ID by matching `prescriptionId`, preserving dose history across re-saves.

---

## User actions & interactions

**Titrations tab (list view):**
- **Tap "New"** → opens the drawer in create mode (`editingPlan = null`).
- **Tap a plan card** → toggles expand/collapse.
- **Tap inside expanded area** → click is stopped from bubbling (won't collapse the card).
- **Tap "Edit"** (visible for draft/active) → opens drawer in edit mode prefilled from that plan.
- **Tap "Activate"** (draft only) → activates plan + pending phases (no confirm dialog).
- **Tap "Complete & Promote"** (active only) → opens AlertDialog; confirm runs completion + promotion; cancel dismisses.
- **Tap "Cancel"** (active only) → opens AlertDialog ("Keep running" / "Cancel titration"); confirm reverts to maintenance.
- **Tap "Delete"** (draft/cancelled only) → opens AlertDialog; confirm permanently deletes.

**Drawer (create/edit):**
- **Type Title** (Input, placeholder "e.g. Heart failure dose increase").
- **Toggle "Start immediately"** (Switch). When off, a date Input appears for a scheduled start.
- **Pick a start date** (date Input), only when not starting immediately.
- **Tap "Add Rx"** → appends a new prescription entry (default schedule 08:00, all 7 days, empty dose).
- **Select a prescription** (Select dropdown) per entry; already-used prescriptions are disabled in other entries.
- **Tap "Copy to titration"** (in the blue maintenance panel) → copies maintenance schedule into the entry.
- **Tap "Add time"** → appends a new dose schedule to the entry (default 12:00, all 7 days, empty dose).
- **Edit a schedule time** (time Input) / **edit dose** (number Input, `step="any"`, "mg" suffix).
- **Remove a schedule** (X button) — only shown when an entry has more than one schedule.
- **Remove an entry** (X icon button at top of the entry card).
- **Type warning signs** (Textarea, one per line) and/or **tap "AI Suggest"** to append AI-generated warnings.
- **Type notes** (Textarea).
- **Tap submit button** (footer): label is "Create Plan" / "Create & Activate" (create mode, depending on start-immediately) or "Save Changes" (edit mode); while pending shows "Creating..." / "Saving...". Disabled until `canSubmit` and not pending. On success, the form resets and the drawer closes.
- **Dismiss drawer** (swipe down / scrim) → closes; on close the `initialized` flag resets.

---

## States & presentations

- **Empty (no plans):** centered TrendingUp icon (muted), "No titration plans yet", subtext "Create a plan to adjust dosages across prescriptions." The Current Maintenance section can still appear below if active prescriptions exist.
- **Populated list:** Active / Planned / Past sections render only when their group is non-empty.
- **Card collapsed (default):** title + status badge + condition + count + chevron (+ optional start date). Active cards always also show warnings.
- **Card expanded:** animated reveal of phase rows, notes, and action bar; chevron rotated 180°.
- **Active card emphasis:** emerald 2px border + emerald status badge ("active").
- **Status badge variants (plan):**
  - `active` → solid emerald, white text.
  - `draft` → blue tint.
  - `completed` → gray tint.
  - `cancelled` → red tint.
- **Phase-status badge variants (row):** `active` → emerald outline; `pending` → blue outline; anything else → muted.
- **Lifecycle action-button colors:** **Activate** is teal (`bg-teal-600 hover:bg-teal-700`); **Complete & Promote** is emerald (`bg-emerald-600 hover:bg-emerald-700`); **Cancel** and **Delete** are red (red text/outline, with `bg-red-600 hover:bg-red-700` on the confirm action). Edit is a plain outline button.
- **Maintenance prefill panel:** blue-tinted box labeled "Current maintenance" with clock-icon schedule lines and a "Copy to titration" button. Renders only if an active maintenance phase with schedules exists for the selected prescription.
- **Drawer header:** "New Titration Plan" (create) vs "Edit Titration Plan" (edit).
- **Drawer entries empty:** dashed-border hint "Add at least one prescription to this plan."
- **Schedule remove button:** hidden when the entry has exactly one schedule (cannot remove the last one).
- **AI Suggest button states:** hidden unless `showAi` (auth gate) passes; disabled when no entry has a prescription selected or while loading; loading shows a spinner + "Generating..." (idle shows TrendingUp icon + "AI Suggest").
- **AI failure:** silently fails (caught) — the textarea is left as-is, user can type manually.
- **Submit button disabled** when `!canSubmit` or a mutation is pending; shows pending label while saving.
- **Confirmation dialogs:** Complete & Promote, Cancel, and Delete each render an AlertDialog with descriptive copy; mutation buttons disable while `isPending`.
- **Day-subset rendering:** schedule lines only show the day list (e.g. "(Mon, Wed, Fri)") when fewer than 7 days are selected; daily schedules omit it.
- **Offline/syncing:** no distinct visual state in this unit — writes succeed locally and queue for sync transparently.
- **Loading:** uses Dexie live queries; lists simply render when data resolves (no explicit skeleton/spinner in this unit besides the AI button spinner). Editing waits for `editingPhases` to be ready (`phasesReady`) before prefilling.

---

## Enums, options & configurable values

- **`TitrationPlanStatus`** = `"draft" | "active" | "completed" | "cancelled"` (db.ts).
- **`PhaseType`** = `"maintenance" | "titration"` (db.ts).
- **MedicationPhase `status`** = `"active" | "completed" | "cancelled" | "pending"` (db.ts).
- **`FoodInstruction`** = `"before" | "after" | "none"` (db.ts); titration entry default = `"none"`.
- **Day-of-week labels** `DAY_LABELS_LONG` = `["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]` (index 0 = Sunday); `daysOfWeek` arrays use these indices. "All 7 days" = `[0,1,2,3,4,5,6]`. (Despite the `_LONG` name, these are the **short** 3-letter labels — the constant name is a misnomer in the source.)
- **List groups (sections):** "Active" (active), "Planned" (draft), "Past" (completed + cancelled), "Current Maintenance".
- **Plan status badge color map:** active=emerald solid; draft=blue; completed=gray; cancelled=red.
- **Dosage unit:** hard-coded `"mg"` on submit (`unit: "mg"`); display unit comes from `phase.unit`.
- **Default new entry schedule:** time `"08:00"`, all 7 days, empty dose.
- **Default added schedule:** time `"12:00"`, all 7 days, empty dose.
- **Default start date:** today's local date key (`toLocalDateKey()`).
- **Default `startNow`:** `false`.
- **Dose input:** `type="number"`, `step="any"` (decimals allowed), positive required (`parseFloat > 0`).
- **Submit button labels:** create → "Create Plan" (scheduled) / "Create & Activate" (start now); edit → "Save Changes"; pending → "Creating..." / "Saving...".
- **AI endpoint config (`/api/ai/titration-warnings`):**
  - Model `CLAUDE_MODELS.premium`, `max_tokens: 1536`, `temperature: 0`, forced tool call `titration_warnings_result`.
  - Target output: "Aim for 4–8 warnings", one short sentence each, patient-friendly.
  - Request schema (route zod) fields per prescription: `genericName` (required), optional `currentDosage`, `newDosage`, `newSchedule[]`, `newTotalDaily`, `frequency`; optional `otherMedications[]` (`genericName`); optional `title` (max 200 chars). **This unit's client only ever sends `genericName`, `newSchedule`, `newTotalDaily`, and `frequency`** — `currentDosage` and `newDosage` are accepted by the schema but never populated by the titration drawer (dead for this unit).
  - Frequency string built as `"{N}x daily"` from schedule count; days rendered as "daily" (7 days) or comma-joined day labels.
  - Response schema: `{ warnings: string[] }`.
  - System prompt focus areas: dose-too-high symptoms, timing-specific concerns, drug-interaction concerns, frequency-change peak/trough effects, vital-sign thresholds (BP, HR), symptoms requiring immediate attention.
- **`canSubmit` rule:** title non-empty AND ≥1 entry AND every entry has a prescription, ≥1 schedule, and every schedule has a dose `> 0`.

---

## Data model touched

**Reads/writes (Dexie tables, `db.ts`):**
- **`titrationPlans`** (`TitrationPlan`): `id, title, conditionLabel, recommendedStartDate?, status, notes?, warnings?[], createdAt, updatedAt, deletedAt, deviceId`.
- **`medicationPhases`** (`MedicationPhase`): `id, prescriptionId, type ("maintenance"|"titration"), unit, startDate, endDate?, foodInstruction, foodNote?, notes?, status, titrationPlanId?, createdAt, updatedAt, deletedAt, deviceId`. Titration creates phases with `type:"titration"` and `titrationPlanId` set.
- **`phaseSchedules`** (`PhaseSchedule`): `id, phaseId, time (deprecated HH:MM), scheduleTimeUTC (minutes from UTC midnight), anchorTimezone, dosage, daysOfWeek[], enabled, unit?, createdAt, updatedAt, deletedAt, deviceId`.
- **`doseLogs`** (`DoseLog`): only `phaseId` remapped during edit (to preserve history).
- **`auditLogs`**: one entry per mutation (action types listed below).
- **`prescriptions`** (`Prescription`): read-only here — `genericName, indication, compounds?, isActive`, used for entry selection, labels, condition-label derivation, and compound dose splitting.
- **`_syncQueue`**: upserts enqueued inside each transaction for `titrationPlans`, `medicationPhases`, `phaseSchedules`, `doseLogs`, `auditLogs`.

**Service input types (`titration-service.ts`):**
- `CreateTitrationPlanInput`: `{ title, conditionLabel, recommendedStartDate?, startImmediately?, notes?, warnings?[], entries: TitrationEntryInput[] }`.
- `TitrationEntryInput`: `{ prescriptionId, schedules: { time, daysOfWeek[], dosage }[], unit, foodInstruction? }`.
- `UpdateTitrationPlanInput`: `{ planId, title?, conditionLabel?, recommendedStartDate?, notes?, warnings?[], entries? }`.

**Hooks (`use-medication-queries.ts`):** `useTitrationPlans`, `usePhasesForTitrationPlan`, `usePhasesForPrescription`, `useSchedulesForPhase`, `usePrescriptions`; mutations `useCreate/Update/Activate/Complete/Cancel/DeleteTitrationPlan`. Note `usePrescriptions()` (backed by `getPrescriptions`) returns **all** non-deleted prescriptions — it is *not* active-filtered. `TitrationsView` applies the `isActive` filter itself before passing the list to the drawer and to the Current Maintenance section.

---

## Validation, edge cases & business rules

- **Required to submit:** non-empty title, ≥1 entry, every entry has a selected prescription + ≥1 schedule, every schedule has dose `> 0` (`parseFloat`).
- **Duplicate prescriptions prevented:** a prescription already used by another entry is disabled in the Select.
- **`conditionLabel` derivation:** taken from the first entry's prescription `indication` if present, else the trimmed title.
- **Start date guard:** if not starting immediately, `recommendedStartDate` is set only when the parsed date is finite (`new Date(startDate + "T00:00:00").getTime()`), avoiding NaN timestamps.
- **Status on create:** `startImmediately` → plan `active` + phases `active`; otherwise plan `draft` + phases `pending`.
- **Phase startDate:** immediate → `now`; scheduled → `recommendedStartDate ?? now`.
- **Timezone handling:** schedule `scheduleTimeUTC` is computed from local HH:MM via `localHHMMStringToUTCMinutes(time, tz)` and `anchorTimezone` records the IANA zone at creation (offline-first / DST-safe). Note this is for **writes** only — the row UIs (`PhaseEntryRow`, `MaintenanceRow`, prefill panel) still display the legacy `s.time` string directly, not a value derived from `scheduleTimeUTC`.
- **Edit replaces all phases/schedules:** existing phases + schedules are soft-deleted and recreated; new phase status follows current plan status (`active` if plan active, else `pending`); new phase `startDate = plan.recommendedStartDate ?? now`.
- **Dose-log preservation on edit:** logs are remapped old-phase→new-phase by `prescriptionId` so history survives a re-save.
- **Complete & Promote:** finds each prescription's maintenance phase (prefers `active`, else first active/completed), soft-deletes its schedules, copies the titration schedules onto it (re-using `scheduleTimeUTC`), re-activates it, and copies the titration's `unit` + `foodInstruction`; titration phase → `completed` with `endDate`. Irreversible (per dialog copy).
- **Cancel:** active/pending plan phases → `cancelled` (+`endDate`); for each affected prescription, the most recently updated `completed` maintenance phase is re-activated (revert).
- **Delete:** only allowed for draft/cancelled; soft-deletes plan + phases + schedules.
- **Soft delete everywhere:** records carry `deletedAt`; reads filter `deletedAt === null`. `getTitrationPlans` orders by `updatedAt` descending.
- **Edit prefill timing:** drawer waits until `editingPhases.length > 0` (`phasesReady`) before prefilling, then sets `initialized` to avoid re-prefill on re-render; resets `initialized` on close.
- **AI append (not replace):** generated warnings are appended to existing textarea content (newline-joined), preserving manual edits.
- **AI gating:** AI Suggest hidden unless auth gate passes; disabled with no prescription selected; API route is auth-protected (`withAuth`) and sanitizes all inputs (`sanitizeForAI`) before sending to Claude; usage is recorded; failures return 500/502 and the client swallows the error.
- **Compound drugs:** doses displayed split per active ingredient when `compounds` present; `splitDose`/`formatCompoundShort` handle the ratio math; plain `{mg}{unit}` otherwise.
- **MaintenanceRow / PhaseEntryRow no-render:** rows render nothing when there's no matching active maintenance phase or no schedules.

---

## Sub-components / variants

- **`TitrationsView`** — top-level tab; groups plans into Active/Planned/Past, renders Current Maintenance, owns drawer open/edit state and the empty state.
- **`Section`** (local in titrations-view) — small labeled wrapper for each list group.
- **`TitrationPlanCard`** — collapsible plan card with status badge, inline warnings, expand animation, and lifecycle action bar (Edit/Activate/Complete&Promote/Cancel/Delete) with AlertDialogs.
- **`PhaseEntryRow`** (local in titration-plan-card) — per-prescription phase row inside an expanded card (name, phase-status badge, schedule lines).
- **`TitrationDrawer`** — bottom drawer for create/edit; title/start/entries/warnings/notes form, AI Suggest, submit; orchestrates `useTitrationDrawerForm`.
- **`RxEntryCard`** — one prescription entry: prescription Select, maintenance-prefill panel, dose-schedule list (time + dose inputs, add/remove).
- **`PrefillFromMaintenance`** (local in rx-entry-card) — blue panel showing current maintenance schedule + "Copy to titration".
- **`EditPhaseScheduleLoader`** (local in rx-entry-card) — invisible loader that reads an existing phase's schedules once and pushes them into the entry on edit.
- **`MaintenanceRow`** — read-only summary of a prescription's active maintenance schedule (total/day + per-time lines) in the Current Maintenance section.
- **`useTitrationDrawerForm`** — form-state hook: title/start/notes/warnings/entries + entry/schedule helpers, `canSubmit`, `reset`, `prefillFromPlan`.
- **`types.ts`** — `RxEntry` interface (string-dosage editing model) + `DAY_LABELS_LONG`.
- **`titration-service.ts`** — all Dexie transactions: create/update/activate/complete/cancel/delete + reads:
  - `getTitrationPlans` — all non-deleted plans, `updatedAt` descending.
  - `getTitrationPlanById` — single plan by id.
  - `getActiveTitrationPlans` — only `status === "active"` non-deleted plans.
  - `getPhasesForTitrationPlan` — non-deleted phases linked to a plan.
  - `getConditionLabels` — sorted unique set of condition-label suggestions folding in **both** every plan's `conditionLabel` **and** every prescription's `indication` (not just plan labels).
  - `getActiveTitrationPhaseForPrescription(prescriptionId)` — returns the active **titration** phase that overrides a given prescription's maintenance schedule (a `type:"titration"`, `status:"active"`, plan-linked, non-deleted phase), or `undefined` if none.
- **`/api/ai/titration-warnings` route** — auth-gated Claude endpoint returning `{ warnings: string[] }` via a forced tool call (clinical-pharmacist system prompt).
