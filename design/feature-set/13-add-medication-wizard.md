# 13 — Add-Medication Wizard

**Files covered:**
- `src/components/medications/add-medication-wizard.tsx` (orchestrator: drawer, step routing, save logic, conflict gate)
- `src/components/medications/add-medication-steps/types.ts` (shared enums/presets: shapes, colors, dose multipliers, days)
- `src/components/medications/add-medication-steps/search-step.tsx`
- `src/components/medications/add-medication-steps/appearance-step.tsx`
- `src/components/medications/add-medication-steps/indication-step.tsx`
- `src/components/medications/add-medication-steps/dosage-step.tsx`
- `src/components/medications/add-medication-steps/schedule-step.tsx`
- `src/components/medications/add-medication-steps/inventory-step.tsx`
- `src/components/medications/add-medication-steps/conflict-check-overlay.tsx`
- `src/hooks/use-add-medication-form.ts` (form state, per-step Zod validation)
- `src/hooks/use-medicine-search.ts` (AI search mutation + result shape)
- `src/hooks/use-interaction-check.ts` (drug-interaction/conflict checking)
- `src/lib/medication-builders.ts` (record builders for Rx/phase/inventory/schedule/transaction)
- `src/lib/compound-utils.ts` (combination-drug math + formatting)
- `src/components/medications/pill-icon.tsx` (SVG pill preview)
- `src/app/api/ai/medicine-search/route.ts` (server AI endpoint)
- Supporting: `src/lib/prescription-service.ts` (`CreatePrescriptionInput`), `src/lib/phase-service.ts` (`AddMedicationToPrescriptionInput`), `src/lib/db.ts` (types)

**Purpose:** A multi-step, mobile-first bottom-drawer wizard for adding a medication — either as a brand-new prescription (with indication, dosage, schedule, inventory) or as an additional brand stocked under an existing prescription. It blends AI-assisted medicine lookup, manual entry, combination-drug support, and an AI drug-conflict gate before persisting a prescription + phase + inventory item + schedules into IndexedDB.

---

## Features

- **Bottom-sheet drawer wizard** (`Drawer`, max height `90dvh`, full-width `max-w-[100vw]`) with a 6-step linear flow rendered one step at a time inside a scrollable body (`min-h-[300px]`, `max-h-[60dvh]`).
- **Dynamic step set.** The canonical steps are `search → appearance → indication → dosage → schedule → inventory`. Steps are filtered out conditionally:
  - When adding to an **existing prescription** (not "new"): `indication` and `dosage` are skipped (those belong to the Rx itself), and `schedule` is skipped (this is a pure inventory/brand addition).
  - When **As Needed (PRN)** is enabled: `schedule` is skipped.
  - So flows range from 6 steps (new, scheduled) down to 3 steps (existing prescription: search → appearance → inventory).
- **Header** shows the current step's friendly label and "Step X of N" (N = active step count, recomputed live).
- **Segmented progress bar** — one teal/`muted` segment per active step; segments at/below the current index are teal (`bg-teal-500`).
- **Per-step validation gate** — `Next`/`Save` runs the step's Zod schema; invalid blocks advance and surfaces inline errors.
- **AI medicine search** (Step 1) — sends the query + region context to `/api/ai/medicine-search`, which calls Claude (premium model, `temperature: 0`, forced tool use) and returns structured pharma data. Results auto-populate brand, generic, strengths, indications, contraindications, warnings, food instruction/note, pill color, pill shape, visual identification, combination-drug compounds.
- **Region-aware search** — primary/secondary region from settings store are folded into the prompt ("focusing specifically on brands and availability in <country>" with secondary fallback).
- **Query-driven auto-selection** — if the query contains an explicit dose (e.g. "Eliquis 5mg"), the matching `dosageStrength` is auto-selected; for combos, the matching numeric strength option is chosen.
- **Combination-drug ("multi-compound") support** — toggle that switches single-strength entry for a per-ingredient name+mg editor; AI populates ingredient names and per-pill mg; preset chips for marketed strength options.
- **Pill appearance designer** (Step 2) — live SVG pill preview (80px), 5 shape choices, 15 preset color swatches + custom hex color picker, free-text visual-identification notes.
- **Indication & safety panel** (Step 3) — indication free-text with "AI Suggest" re-run, read-only contraindications/warnings panel (red/amber), food-timing selector, conditional food note, free-text notes.
- **Dosage calculator** (Step 4) — preset dose-multiplier chips + custom dose input, live "X pills per dose = Ymg" computation, partial-pill detection, PRN toggle.
- **Schedule builder** (Step 5) — multiple time entries, each with a 7-day-of-week toggle row; add/remove time rows.
- **Inventory & refill reminders** (Step 6) — current pill stock + two refill-alert thresholds (days-of-supply and pills-remaining).
- **AI drug-conflict check on save** — for new prescriptions with other active meds, runs an interaction check; if any `AVOID`/`CAUTION` conflicts, shows a blocking warning overlay requiring explicit "Save Anyway".
- **Single atomic save** — builds and persists Prescription + initial maintenance Phase + InventoryItem + PhaseSchedules (or just an InventoryItem for an existing Rx) in one mutation; failure surfaces a destructive toast.
- **Auto-reset** — closing resets form, step, and conflict state after a 300ms animation delay.
- **Auth gating** — all AI features (search input, result card, AI Suggest button, conflict check) are hidden/skipped when the user is signed out (`useAuthGate`), leaving a fully functional manual-entry path.

## User actions & interactions

**Global / navigation**
- **Top-left button** acts as Back (`ArrowLeft`) when not on the first step, or Close (`X`) on the first step. Close animates the drawer shut and resets state.
- **Drawer dismiss** (swipe down / scrim tap / Esc) triggers the same close+reset.
- **Bottom `Back` button** (shown when not first step) — clears errors, resets conflict state, returns to previous active step.
- **Bottom `Next` button** — validates current step; on success advances to next active step.
- **Bottom `Save Medication` button** (last step only) — validates, runs conflict check, persists; disabled + spinner while the save mutation is pending.

**Step 1 — Search**
- **"Assign to prescription" `<select>`** (shown only if existing prescriptions exist) — choose "Create new prescription" (default `"new"`) or an existing Rx by generic name. Selecting an existing Rx pre-populates food instruction/note from its active phase and sets/clears combination mode + compound names from the Rx's compounds.
- **Search query input** — type a medicine name; Enter blurs and triggers search; clears `document.activeElement` and scrolls to top on submit.
- **Search button** — disabled while searching or query empty; spinner while pending; populates the form from the AI result.
- **Brand name input** — editable; auto-capitalized; required.
- **Active ingredient (generic name) input** — editable; auto-capitalized.
- **"Combination drug" toggle** — switches between single dosage-strength and per-ingredient editor.
- **Combination strength chips** (when combo + AI options exist) — tap a preset (e.g. "100 (49/51 mg)") to fill both compound rows.
- **Per-ingredient name + mg inputs** (combo mode) — two rows; live "Total per pill: Nmg".
- **Dosage strength input** (single mode) — free text (e.g. "75mg").
- **Dosage strength chips** (single mode, when AI returns >1 strength) — tap to set the strength.

**Step 2 — Appearance**
- **Shape buttons** (5) — tap to set `pillShape`; each shows a mini pill preview.
- **Color swatches** (15 presets) — tap to set `pillColor`; selected swatch gets teal ring + scale.
- **Custom color picker** (`<input type="color">`) — pick any hex; current hex shown as text.
- **Visual identification textarea** — optional markings/imprints/coating notes.

**Step 3 — Indication & Notes** (new-Rx only sections)
- **"What is this medication for?" textarea** — indication free text.
- **"AI Suggest" button** — re-runs the medicine search to refill indication/safety fields; spinner while refreshing.
- **Food instruction segmented buttons** (3) — Before eating / After eating / Not important.
- **Food note input** — appears only when food instruction ≠ "none".
- **Additional notes textarea** — Rx-level notes.

**Step 4 — Dosage**
- **Dose-multiplier preset buttons** (6) — tap to set `dosageAmount` (clears any custom dose). Labels differ by mode: single → "Nmg" (mult × strength); combo → "1 pill"/"N pills".
- **Custom dose input** — single mode accepts mg (converted to a pill multiplier internally); combo mode accepts pills-per-dose directly. Entering a custom value supersedes the preset.
- **"As needed (PRN)" toggle** — when on, the schedule step is removed from the flow.

**Step 5 — Schedule**
- **Time picker** per row (`<input type="time">`).
- **Day-of-week toggle buttons** (7, Su–Sa) per row — tap to include/exclude a weekday; teal when active.
- **Remove-row button** (`X`) — shown only when >1 schedule row exists.
- **"Add time" button** — appends a new row defaulted to `20:30`, all days.

**Step 6 — Inventory**
- **Current stock number input** — pills on hand.
- **Refill-alert-by-days number input** — alert when days of supply remaining reaches N.
- **Refill-alert-by-pills number input** — alert when pills remaining reaches N.

**Conflict overlay (on save)**
- **"Go Back" button** — dismisses the warning (does not save), resets conflict state to idle.
- **"I'm Aware, Save Anyway" button** — acknowledges the warning and proceeds with the save.

## States & presentations

**Wizard shell**
- **Default** — current step body, segmented progress, header label/count.
- **First step** — top-left shows Close (`X`); no bottom Back button.
- **Mid/last step** — top-left shows Back (`ArrowLeft`); bottom Back button present.
- **Last step** — bottom button becomes "Save Medication" (teal); shows spinner + disabled while saving.
- **Validation-error** — `Next`/`Save` blocked; inline red error text under the offending field; logs a `validation_error` audit entry.

**Step 1 — Search**
- **Signed-out** — search input, result card, and AI affordances hidden; manual brand/generic/strength entry only.
- **Idle** — empty query; search button disabled.
- **Searching** — search button shows spinner, disabled.
- **Result found** — teal info card: "Found: <generic>", optional drug class, combination-drug line ("X + Y"), local alternatives, strengths list, appearance description.
- **Generic fallback** — amber inline banner inside the result card: "Could not find physical details for that specific brand. Showing appearance for the generic equivalent." (`isGenericFallback`).
- **Search error** — red error text under the input (cancelled searches are suppressed and show nothing).
- **Combination mode** — compound editor + total; preset strength chips when AI provided ≥2-ingredient options; selected chip highlighted teal.
- **Single mode** — dosage-strength input + chips (only when AI returns >1 strength); selected chip highlighted.
- **Existing-prescription selected** — combo state and food fields pre-filled from that Rx.

**Step 2 — Appearance**
- **Selected shape/color** — teal-bordered/ringed and scaled.
- White color swatch (`#FFFFFF`) always gets a gray border for visibility.

**Step 3 — Indication**
- **New Rx** — full panel (indication, safety, food, notes).
- **Existing Rx** — indication + safety sections hidden; only food + notes shown (this step is normally skipped for existing Rx, but the component guards anyway).
- **Has contraindications/warnings** — red-bordered safety panel with two labeled lists (contraindications red, warnings amber); contraindications are sentence-cased.
- **Refreshing AI** — "AI Suggest" shows spinner, disabled.
- **Food note** — only rendered when food instruction ≠ "none".

**Step 4 — Dosage**
- **Selected multiplier** — teal highlight (only when no custom dose set).
- **Custom dose active** — presets de-highlighted.
- **Summary box** — "N pill(s) per dose = Nmg" (+ " total" for combos); appends "(partial pill)" when pills-per-dose < 1.
- **Combo vs single** — labels, preset math, and custom-input semantics differ (pills vs mg).

**Step 5 — Schedule**
- **Single row** — no remove button.
- **Multiple rows** — each row gets a remove (`X`) button.
- Active days teal (`bg-teal-600 text-white`); inactive muted.

**Conflict overlay**
- **`idle`** — overlay not rendered.
- **`checking`** — full-cover overlay, centered spinner + "Checking for interactions...".
- **`warning`** — full-cover overlay with `AlertTriangle`, optional summary, list of `AVOID`/`CAUTION` items (each a colored row + severity badge: red destructive for AVOID, amber for CAUTION), and Go Back / Save Anyway buttons. `OK`-severity items are filtered out.
- **`unavailable`** — type exists but not actively rendered (AI errors fall through to save).

**Save**
- **Saving** — Save button disabled + spinner (`addPrescriptionMutation.isPending` or `addMedicationToPrescriptionMutation.isPending`).
- **Save error** — destructive toast "Failed to save prescription" with the error message.
- **Success** — drawer closes and state resets.

**Offline / sync** — all writes go to IndexedDB and enqueue sync transactions; the wizard does not visibly differ offline except that AI calls (search, conflict check) will error/fallback to manual.

## Enums, options & configurable values

**Wizard steps** (`WizardStep`): `search`, `appearance`, `indication`, `dosage`, `schedule`, `inventory`.
**Step labels:** Search Medicine / Pill Appearance / Indication & Notes / Dosage / Schedule / Inventory.

**Pill shapes** (`PillShape` / `PILL_SHAPES`): `round` (Round), `oval` (Oval), `capsule` (Capsule), `diamond` (Diamond), `tablet` (Tablet). Default `round`.

**Preset colors** (`PRESET_COLORS`, 15): `#E91E63`, `#9C27B0`, `#673AB7`, `#3F51B5`, `#2196F3`, `#00BCD4`, `#4CAF50`, `#CDDC39`, `#FFC107`, `#FF9800`, `#FF5722`, `#795548`, `#607D8B`, `#FFFFFF`, `#212121`. Default `#E91E63`.

**AI color-name → hex map** (`COLOR_NAME_MAP`): pink/magenta→`#E91E63`, purple→`#9C27B0`, violet→`#673AB7`, indigo→`#3F51B5`, blue→`#2196F3`, cyan/teal→`#00BCD4`, green→`#4CAF50`, lime→`#CDDC39`, yellow→`#FFC107`, amber/orange→`#FF9800`, red→`#FF5722`, brown/beige/tan→`#795548`, gray/grey→`#607D8B`, white→`#FFFFFF`, black→`#212121`.

**Dose multipliers** (`DOSE_MULTIPLIERS`, 6): `0.25`, `0.5`, `1`, `1.5`, `2`, `3`. Default `dosageAmount = 1`.

**Days of week** (`ALL_DAYS`): `[0,1,2,3,4,5,6]` (0=Sunday). Short labels (`DAY_LABELS_SHORT`): `Su, Mo, Tu, We, Th, Fr, Sa`.

**Food instruction** (`FoodInstruction` / options): `before` (Before eating), `after` (After eating), `none` (Not important). Default `none`.

**Schedule defaults:** first row `{ time: "08:30", daysOfWeek: all, dosage: 1 }`; added rows `{ time: "20:30", daysOfWeek: all, dosage: 1 }`.

**Default prescription selection:** `selectedPrescriptionId = "new"` (the "Create new prescription" sentinel).

**Default unit:** `mg` (used when strength parsing fails and as the combo unit).

**AI medicine-search response enums/fields** (`MedicineSearchResponseSchema`): `brandNames[]`, `localAlternatives[]`, `genericName`, `dosageStrengths[]`, `activeIngredients[]`, `strengthOptions[]` (each `{ label, compounds[] }`), `commonIndications[]`, `foodInstruction` (`before`/`after`/`none`), `foodNote?`, `pillColor`, `pillShape`, `pillDescription`, `drugClass`, `visualIdentification?`, `contraindications[]`, `warnings[]`, `isGenericFallback`.

**Interaction/conflict severity** (`InteractionItem.severity`): `AVOID`, `CAUTION`, `OK` (only AVOID/CAUTION are shown as conflicts; presence of either gates the save).

**Conflict-check states** (`ConflictCheckState`): `idle`, `checking`, `warning`, `unavailable`.

**AI request limits:** query `min 1 / max 200` chars; country `max 100` chars. Server rate limit: **15** requests/window per IP (429 on exceed). Claude model: `CLAUDE_MODELS.premium`, `max_tokens: 2048`, `temperature: 0`, forced `tool_choice` on `medicine_search_result`. Interaction-check client timeout: **15000ms** (AbortController).

## Data model touched

Reads: `usePrescriptions()` (existing prescriptions for the assign dropdown + active-meds conflict check), `usePhasesForPrescription()` (active phase of a selected existing Rx, for food prefill). Settings store: `primaryRegion`, `secondaryRegion`.

Writes (new prescription — `CreatePrescriptionInput` → `addPrescription`, builds 4 record types via `medication-builders.ts`):
- **Prescription** (`db.ts` `Prescription`): `id`, `genericName`, `indication`, `notes?`, `contraindications?[]`, `warnings?[]`, `compounds?[]`, `isActive=true`, audit/sync fields (`createdAt`, `updatedAt`, `deletedAt`, `deviceId`).
- **MedicationPhase** (initial, `buildPhase`): `type="maintenance"`, `unit`, `startDate=now`, `foodInstruction`, `foodNote?`, `notes?`, `status="active"`.
- **InventoryItem** (`buildInventory`): `prescriptionId`, `brandName`, `currentStock`, `strength`, `compounds?[]`, `unit`, `pillShape`, `pillColor`, `visualIdentification?`, `refillAlertDays?`, `refillAlertPills?`, `isActive=true`, `timezone`.
- **PhaseSchedule[]** (`buildSchedules`): `phaseId`, `time` (HH:MM, deprecated display), `scheduleTimeUTC` (minutes from UTC midnight, computed from local time + device tz), `anchorTimezone`, `dosage`, `daysOfWeek[]`, `enabled=true`.
- **InventoryTransaction** (`buildTransaction`) for the initial stock seed.

Writes (existing prescription — `AddMedicationToPrescriptionInput` → `addMedicationToPrescription`): only a new **InventoryItem** (brand, stock, strength, unit, shape, color, visual ID, compounds, refill alerts) — no new phase/schedule/indication.

Form state interface `AddMedicationFormState` (28 fields) covers: `selectedPrescriptionId`, `searchQuery`, `searchResult`, `brandName`, `genericName`, `dosageStrength`, `isCombination`, `compounds[]`, `pillShape`, `pillColor`, `visualIdentification`, `indication`, `contraindications[]`, `warnings[]`, `foodInstruction`, `foodNote`, `notes`, `dosageAmount`, `customDosage`, `asNeeded`, `schedules[]`, `currentStock`, `refillAlertDays`, `refillAlertPills`.

## Validation, edge cases & business rules

- **Required:** brand name (`SearchStepSchema`, "Medication name is required"). On validation the name falls back to a capitalized search query if brand is empty.
- **Combination validation:** when `isCombination`, at least 2 compounds must each have a non-empty name AND strength > 0, else error "Enter a name and strength for both active ingredients".
- **Schedule validation (`ScheduleEntrySchema`):** each entry needs a time, dosage > 0, and ≥1 day selected; errors are prefixed "Schedule N: ...".
- **Inventory validation (`InventoryStepSchema`):** stock must be a number ≥ 0 (negative blocked; non-number → coerced to 0 before validation).
- **Auto-capitalization:** `brandName` and `genericName` are title-cased on change and on query→brand fallback.
- **Strength parsing:** `parseStrength` extracts number+unit from strings like "75mg" (regex `(\d+(?:\.\d+)?)\s*([a-zA-Z]+)`); falls back to `{1, "mg"}` when unparseable.
- **Combination dose math:** for combos, `strength` is the SUM of compound strengths (`compoundSum`) so `pillsPerDose = dosage / strength` is identical to single-compound; `compounds` stays purely descriptive/labeling.
- **Dosage computation:** `finalDosage = customDosage ? parseFloat(customDosage) : dosageAmount`; `scheduleDosage = (finalDosage || 1) * strength`. Single-mode custom input is entered in mg but stored as a pill-multiplier (`mg / strength`); combo-mode custom input is pills directly.
- **Partial-pill note** shown when pills-per-dose < 1.
- **PRN behavior:** `asNeeded` removes the schedule step and saves with empty `schedules`.
- **Schedule filtering on save:** entries without a time or with no days are dropped before persisting.
- **Generic name fallback on save:** if `genericName` empty, uses combo names (`formatCompoundNames`) for combos, else the brand name.
- **Timezone:** schedule times stored as both local HH:MM and `scheduleTimeUTC` (minutes from UTC midnight) plus the `anchorTimezone`, so day-start/notification logic survives timezone changes.
- **Conflict gate rules:** only runs for NEW prescriptions, only when signed in, only when other active meds exist; AVOID/CAUTION → block + warning overlay; OK/no-conflict/AI-error → proceed silently. "Save Anyway" sets state to `warning` and re-invokes save (which then skips the re-check because state ≠ idle).
- **AI fallback:** AI errors during search show an error message but never block manual entry; conflict-check errors/timeouts fall through to save.
- **Reset timing:** form reset is deferred 300ms after close to avoid flashing during the drawer's exit animation.
- **Region context:** only added to the AI prompt when primary region is set and ≠ "none"; secondary appended as fallback when set and ≠ "None"/"none".
- **AI server hardening:** input sanitized (`sanitizeForAI`), forced tool use, response re-validated with Zod; invalid tool output → 422 `{ fallbackToManual: true }`; usage recorded per request.

## Sub-components / variants

- **`AddMedicationWizard`** — drawer orchestrator: step routing, dynamic step filtering, AI search invocation, conflict gate, atomic save.
- **`SearchStep`** — Rx-assignment dropdown, AI search, brand/generic entry, single vs combination strength editor with preset chips.
- **`AppearanceStep`** — shape picker, preset+custom color, visual-ID notes, live pill preview.
- **`IndicationStep`** — indication, AI-suggest, contraindications/warnings panel, food instruction + note, notes.
- **`DosageStep`** — preset/custom dose, live pills-per-dose math, PRN toggle.
- **`ScheduleStep`** — repeatable time + day-of-week schedule rows.
- **`InventoryStep`** — current stock + two refill-alert thresholds.
- **`ConflictCheckOverlay`** — full-cover checking spinner and AVOID/CAUTION interaction-warning gate.
- **`PillIcon`** — SVG renderer for the 5 pill shapes (also `PillIconWithBadge` for dose status, unused here).
- **`useAddMedicationForm`** — form state container + per-step Zod validation + audit logging.
- **`useMedicineSearch`** — React Query mutation wrapping the AI search endpoint; defines `MedicineSearchResult` and `MedicineSearchCancelledError`.
- **`useInteractionCheck`** — conflict/lookup interaction checker with caching, abort, and 15s timeout.
- **`medication-builders.ts`** — `buildPrescription` / `buildPhase` / `buildInventory` / `buildSchedules` / `buildTransaction` record factories.
- **`compound-utils.ts`** — `compoundSum`, `isCombo`, `splitDose`, `scaleCompounds`, `formatCompoundShort/Full/Names`.
- **`/api/ai/medicine-search`** — auth-gated, rate-limited Claude endpoint returning the structured pharma result.
