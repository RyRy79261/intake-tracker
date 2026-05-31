# 14 — Compound Library + Interactions

**Files covered:**
- `src/components/medications/compound-list.tsx`
- `src/components/medications/compound-card.tsx`
- `src/components/medications/compound-card-expanded.tsx`
- `src/components/medications/brand-switch-picker.tsx`
- `src/components/medications/interaction-search.tsx`
- `src/components/medications/interactions-section.tsx`
- `src/components/medications/pill-icon.tsx`
- `src/app/api/ai/interaction-check/route.ts`
- `src/app/api/ai/medicine-search/route.ts`
- `src/hooks/use-interaction-check.ts`
- `src/hooks/use-medicine-search.ts`
- Supporting: `src/lib/compound-utils.ts`, `src/lib/medication-ui-utils.ts`, `src/lib/interaction-cache.ts`, `src/lib/db.ts` (types), `src/lib/dose-schedule-service.ts` (`DoseSlot`), `src/stores/settings-store.ts` (region settings)

**Purpose:** The medication-inventory ("compound library") surface — a categorized list of medication brands/pills with collapsed and expanded cards, a brand/generic switch, the per-pill SVG pill-icon renderer, plus the AI-backed drug-interaction search and the stored interactions/warnings display. It represents one prescription (a generic compound) as a group of physical "medicines" (brands), supports combination drugs (multi-ingredient tablets), and lets the user check arbitrary substances against their active prescriptions.

---

## Features

### Compound list (`CompoundList`)
- Renders the full inventory of medications, keyed off `InventoryItem` records joined to their parent `Prescription`.
- Filters out archived items (`isArchived === true`) up front.
- Splits non-archived items into **three categories** computed from stock + active flag:
  - **Active**: `currentStock > 0` AND `item.isActive === true`. Sorted alphabetically by `brandName`. Always expanded/visible.
  - **Other (inactive)**: `currentStock > 0` AND `item.isActive === false`. Grouped by parent prescription's `genericName` (compound name); each group is an independently collapsible accordion.
  - **Out of stock**: `currentStock <= 0` (regardless of active flag). Sorted alphabetically by `brandName`. Lives behind a single collapsible header showing a count.
- Renders the **interaction search bar** (`InteractionSearch`) at the top — only when AI/auth gate is satisfied (`useAuthGate()` truthy).
- "Add another medication" button at the bottom; an empty-state "Add your first medication" button when there are zero non-archived items.
- Group headers use uppercase micro-labels: "Active", "Other", "Out of stock (N)".
- Inactive compound-group header shows compound name + a count label: `N medication` / `N medications` (singular/plural).

### Collapsed compound card (`MedicationCard`)
- Compact row for one `InventoryItem`. Shows:
  - **Pill icon** (`PillIconWithBadge`, size 36) using the item's `pillShape` (default `"round"`) and `pillColor` (default `#94a3b8`).
  - **Brand name** (`item.brandName`, truncated, semibold).
  - **Strength line**: for a combination drug → compact compound split `formatCompoundShort(compounds, unit)` e.g. `49/51mg`; for single-compound → `${strength}${unit}` (unit default `"mg"`).
  - **"For:" line**: parent prescription's `genericName` (only when a prescription is joined).
  - **Stock display** (right column): whole counts → `${stock} pills`; fractional → `formatPillCount()` (Unicode fractions, e.g. `½ tablet`).
  - **"Updated <Mon D>"** timestamp from `item.updatedAt` (locale short month + day).
  - Stock badges (see States).
- Tapping the card opens the `InventoryItemViewDrawer` for that brand.
- Tap-scale animation (`whileTap scale 0.98`).

### Expanded compound card (`CompoundCardExpanded`)
- Expanded body for one `Prescription` (mounted inside `prescription-card.tsx`). Four stacked sections:
  1. **Medicines** — list of this prescription's non-archived inventory items, sorted active-first then alphabetically. Each row: pill icon (size 24), brand name, "Active" badge if active, strength/compound line, stock text, "Low" badge if low, chevron. Tapping a row opens that item's `InventoryItemViewDrawer`.
  2. **Schedule** — derived from the *effective phase* (`getEffectivePhase`: active titration overrides maintenance). Shows a "On titration" badge when the effective phase is a titration. If all schedules share the same dosage, collapses to one line: `<dose> <freq> at <times>` where freq = `daily` / `twice daily` / `Nx daily`. Otherwise one line per schedule (`<dose> at <time>`). Combination drugs render the per-compound split via `splitDose` + `formatCompoundShort`. Food instruction footnote when `foodInstruction !== "none"` ("Take before eating" / "Take after eating").
  3. **Today** — today's dose slots for this prescription (from `useDailyDoseSchedule`), each with a status icon, local time, dose amount, and status label.
  4. **Actions** — "Switch Brand" button (only if >1 brand) opening `BrandSwitchPicker`; "Prescription Details" button opening `PrescriptionViewDrawer`.
- Stops click propagation so taps inside don't collapse the parent card.

### Brand switch picker (`BrandSwitchPicker`)
- Modal dialog listing every non-archived brand for a prescription.
- Each row: pill icon (size 28), brand name, strength/compound line + stock, "Active" check badge on the current active brand.
- Selecting a brand deactivates the current active item and activates the chosen one (two sequential mutations). Toasts "Brand switched → Switched to <brandName>". Selecting the already-active brand just closes the dialog (no-op).

### Pill icon (`PillIcon` / `PillIconWithBadge`)
- SVG renderer that draws one of 5 pill shapes in a given color at a given size.
- `PillIconWithBadge` overlays a small status badge (bottom-right) for `taken` / `skipped` / `rescheduled` (none for `pending`), each with a colored circle and a glyph (check / cross / clock).

### Interaction search (`InteractionSearch`)
- Free-text search bar to check an arbitrary substance (drug, supplement, food, e.g. "ibuprofen") against the user's **active prescriptions** via AI.
- Submits on Enter. Clears with the X button.
- Calls `useInteractionCheck` in `"lookup"` mode; sends only the active prescriptions' `genericName`s.
- Results: grouped by medication; each interaction labeled `AVOID` / `CAUTION` / `OK` with a description, plus an optional one-line `summary` and `drugClass`.
- Shows a green "No significant interactions found" panel when every returned interaction is `OK`.
- 24-hour client-side localStorage cache for lookup results (`interaction-cache.ts`, key = trimmed+lowercased substance).

### Interactions section (`InteractionsSection`)
- Per-prescription stored interactions panel (header "Interactions & Warnings" with shield icon).
- Renders persisted `prescription.contraindications` (as `AVOID`) and `prescription.warnings` (as `CAUTION`, or `INFO` when the warning string starts with `"Drug class:"`).
- "Refresh interactions" button (when AI gate is on) re-runs an AI conflict check of this prescription against all *other* active prescriptions and persists the result back onto the prescription. Disabled when there are no other active prescriptions.
- When signed-out AND no stored data: the whole section is hidden.

### Medicine search (`useMedicineSearch`)
- AI lookup used by the add-medication wizard to auto-fill a new medication: brand names, local alternatives, generic name, dosage strengths, active ingredients, per-strength compound breakdowns, indications, food instruction, pill color/shape/description, drug class, visual identification, contraindications, warnings, and a generic-fallback flag.
- Region-aware: prepends the user's `primaryRegion` (and `secondaryRegion` as fallback) from settings to bias brand availability.

---

## User actions & interactions

### Compound list
- **Tap "Active" cards** → open `InventoryItemViewDrawer` for that brand.
- **Tap an "Other" compound-group header** → expand/collapse that compound's brand list (chevron rotates 180°).
- **Tap "Out of stock (N)" header** → expand/collapse the out-of-stock list (chevron rotates 180°).
- **Tap a card inside any group** → open that item's view drawer.
- **Tap "Add your first medication" / "Add another medication"** → fires `onAddMed()` (opens the add-medication wizard).

### Collapsed card
- **Tap card** → open `InventoryItemViewDrawer`.
- **Press (tap-down)** → scale-down haptic-style animation.

### Expanded card
- **Tap a medicine row** → open that item's `InventoryItemViewDrawer`.
- **Tap "Switch Brand"** (only when >1 brand) → open `BrandSwitchPicker`.
- **Tap "Prescription Details"** → open `PrescriptionViewDrawer`.
- Inner taps do not collapse the parent card (propagation stopped).

### Brand switch picker
- **Tap a brand row** → activate it (and deactivate the prior active), toast, close. Tapping the active brand is a no-op close.
- Rows are disabled while a switch mutation is pending.

### Interaction search
- **Type query + Enter** (or this is the only submit path) → run interaction check.
- **Tap X** → clear query, clear errors, reset results.
- Submitting an empty/whitespace query → no-op.
- Submitting with zero active prescriptions → inline error "Add prescriptions first to check interactions".

### Interactions section
- **Tap "Refresh interactions"** → AI conflict check vs other active prescriptions, persist contraindications/warnings to the prescription.
- Button disabled while refreshing or when `otherActiveCount === 0` (label changes to "Add more prescriptions to check interactions").

---

## States & presentations

### Compound list
- **Empty**: centered cat icon (`Cat`, muted), "No medications yet", outline "Add your first medication" button.
- **Populated**: up to three sections (Active / Other / Out of stock), each only shown if it has items.
- **Out-of-stock collapsed** (default) vs **expanded** (animated height/opacity).
- **Inactive compound group collapsed** (default) vs **expanded** (animated).
- **AI-gated**: interaction search bar shown only when `useAuthGate()` is truthy.

### Collapsed card
- **Default**: pill icon + brand + strength + "For:" + stock + updated date.
- **Negative stock** (`currentStock < 0`): destructive "Negative" badge.
- **Low stock** (not negative, `refillAlertPills` defined, `currentStock <= refillAlertPills`): amber "Low" badge.
- **Fractional stock**: stock shown as a tablet-fraction string.
- **No prescription joined**: "For:" line hidden.
- **Hover**: subtle background tint; **tap**: scale animation.

### Expanded card
- **Medicines empty**: "No medicines added yet".
- **Medicine row active**: outlined emerald "Active" badge.
- **Medicine row low** (`stock <= refillAlertPills && stock >= 0`): amber "Low" badge.
- **Medicine row negative** (`stock < 0`): stock text red + medium weight.
- **Schedule on titration**: amber "On titration" badge next to "Schedule".
- **No schedules**: "No schedules configured".
- **No effective phase**: Schedule section omitted entirely.
- **No today slots**: Today section omitted.
- **Today slot statuses** (icon + colored label): `taken` (emerald check), `skipped` (gray X), `pending` (muted minus), `missed` (amber clock).
- **Single brand**: "Switch Brand" hidden.

### Brand switch picker
- **Default**: list of brands; active one shows emerald check "Active" badge.
- **Pending**: all rows disabled during the activate/deactivate mutations.

### Interaction search
- **Idle**: just the search input (no results panel).
- **Has query**: X-clear button appears.
- **Loading**: bordered panel, spinner + "Checking interactions…".
- **Error**: red-bordered panel with the error message (local or fetch).
- **Empty/whitespace submit**: silently ignored.
- **No active prescriptions**: inline error "Add prescriptions first to check interactions".
- **Success — no significant**: green panel + shield-check + "No significant interactions found".
- **Success — significant**: per-medication cards, each interaction in a severity-tinted row (red `AVOID` / amber `CAUTION` / green `OK`), plus italic summary and "Drug class: …" line when present.
- **Cancelled sign-in**: returns null silently (no error).
- **Timeout** (15s after fetch resolves): error "Interaction check timed out".
- **Rate-limited (429)**: error surfaced from response body.

### Interactions section
- **Has data**: contraindication rows (`AVOID`, red), warning rows (`CAUTION`, amber; or `INFO`/muted for "Drug class:" prefixed warnings).
- **No data + AI on**: dashed "No interaction data yet" panel with a "Refresh interactions" outline button.
- **Refreshing**: spinner replaces the refresh icon.
- **No other active prescriptions**: button disabled, relabeled "Add more prescriptions to check interactions".
- **Signed-out + no stored data**: section hidden entirely.

### Pill icon
- Renders one of 5 shapes; status overlay badge for `taken`/`skipped`/`rescheduled`; nothing for `pending`.

---

## Enums, options & configurable values

- **`PillShape`** (`db.ts`): `"round"` | `"oval"` | `"capsule"` | `"diamond"` | `"tablet"`. Default fallback in UI: `"round"`.
- **Default pill color**: `#94a3b8` (slate) when `pillColor` absent.
- **`PillIconWithBadge` status**: `"taken"` | `"skipped"` | `"rescheduled"` | `"pending"`. Badge colors: taken → emerald-500, skipped → gray-400, rescheduled → amber-500; pending → no badge.
- **Pill icon geometry** (relative to `size`): round = r 0.8·half; oval = rx 0.9·half / ry 0.6·half; capsule = rect 0.8w×0.5h, rx 0.25; diamond = polygon; tablet = rect 0.7×0.7, rx 0.12. Default size 32 (collapsed card uses 36, expanded rows 24, brand picker 28).
- **`DoseStatus`** (`db.ts`): `"taken"` | `"skipped"` | `"rescheduled"` | `"pending"`.
- **`DoseSlotStatus`** (`dose-schedule-service.ts`, used in Today section): `"taken"` | `"skipped"` | `"pending"` | `"missed"`.
- **`FoodInstruction`**: `"before"` | `"after"` | `"none"`. UI strings: before → "Take before eating", after → "Take after eating".
- **`PhaseType`**: `"maintenance"` | `"titration"`. Titration overrides maintenance for the effective phase.
- **`MedicationPhase.status`**: `"active"` | `"completed"` | `"cancelled"` | `"pending"`.
- **Interaction severity** (`AVOID` / `CAUTION` / `OK`):
  - `AVOID` → red, destructive badge; mapped to `Prescription.contraindications`.
  - `CAUTION` → amber badge; mapped to `Prescription.warnings`.
  - `OK` → green outline badge; "no significant" when all are OK.
  - `INFO` (display-only): warnings whose text starts with `"Drug class:"`.
- **Interaction check modes** (`interaction-check/route.ts`): `"lookup"` (ad-hoc substance) | `"conflict"` (new/existing med vs current list). Both require ≥1 active prescription.
- **Frequency labels** (schedule summary): 1 schedule → `daily`; 2 → `twice daily`; N → `Nx daily`.
- **Pill-count fractions** (`formatPillCount`): `¼` (0.25), `½` (0.5), `¾` (0.75), whole+fraction combos, "tablet"/"tablets" pluralization.
- **Compound formatters**: `formatCompoundShort` → `49/51mg`; `formatCompoundFull` → `Sacubitril 49mg + Valsartan 51mg`; `formatCompoundNames` → `Sacubitril / Valsartan`.
- **Combination-drug threshold**: `isCombo` = `compounds.length >= 2`.
- **Default unit**: `"mg"` throughout.
- **Refill alerts**: `refillAlertPills` (low-stock threshold), `refillAlertDays`.
- **Interaction-search timeout**: 15000 ms (armed only after the fetch resolves).
- **Interaction lookup cache TTL**: 24h (`24 * 60 * 60 * 1000`), localStorage prefix `interaction-cache:`.
- **Rate limits**: interaction-check 5/window; medicine-search 15/window.
- **AI model**: `CLAUDE_MODELS.premium`, `max_tokens` 2048, `temperature` 0, forced tool use.
- **Region settings** (`settings-store.ts`): `primaryRegion` (default `""`), `secondaryRegion` (default `""`); values `"none"`/`"None"` treated as unset.
- **Medicine-search `foodInstruction` enum**: `"before"` | `"after"` | `"none"` (defaults `"none"`).
- **Medicine-search request limits**: `query` 1–200 chars; `country` ≤100 chars.

---

## Data model touched

### `InventoryItem` (`db.ts`) — read (and `isActive` written by brand switch)
`id`, `prescriptionId`, `brandName`, `currentStock?` (deprecated; UI still reads it), `strength` (pill-math denominator; for combos = sum of compounds), `compounds?: CompoundStrength[]` (per-pill breakdown for combos), `unit`, `pillShape: PillShape`, `pillColor`, `visualIdentification?`, `refillAlertDays?`, `refillAlertPills?`, `isActive`, `isArchived?`, `createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `timezone`.

### `Prescription` (`db.ts`) — read (and `contraindications`/`warnings` written by refresh)
`id`, `genericName`, `indication`, `notes?`, `contraindications?: string[]`, `warnings?: string[]`, `compounds?: CompoundStrength[]`, `isActive`, plus timestamps/`deviceId`.

### `CompoundStrength` (`db.ts`)
`{ name: string; strength: number }` — one active ingredient and its per-pill (or per-reference) mg.

### `MedicationPhase` (`db.ts`) — read for schedule summary
`type: PhaseType`, `unit`, `foodInstruction: FoodInstruction`, `foodNote?`, `status`, `titrationPlanId?`, dates.

### `PhaseSchedule` (`db.ts`) — read for schedule summary
`phaseId`, `time` (deprecated), `scheduleTimeUTC`, `anchorTimezone`, `dosage`, `daysOfWeek: number[]`, `enabled`, `unit?`.

### `DoseSlot` (`dose-schedule-service.ts`) — read for Today section
`prescriptionId`, `phaseId`, `scheduleId`, `scheduledDate` (YYYY-MM-DD), `scheduleTimeUTC`, `localTime` (HH:MM), `dosageMg`, `unit`, `status: DoseSlotStatus`, `existingLog?`, joined `prescription`/`phase`/`schedule`/`inventory?`, `pillsPerDose?`, `inventoryWarning?`.

### Hooks/services used
- `usePrescriptions`, `useAllInventoryItems`, `useInventoryForPrescription`, `usePhasesForPrescription`, `useSchedulesForPhase`, `useDailyDoseSchedule`, `useUpdateInventoryItem`, `useUpdatePrescription` (`use-medication-queries.ts`).
- `useInteractionCheck`, `useRefreshInteractions` (`use-interaction-check.ts`).
- `useMedicineSearch` → `MedicineSearchResult` (`use-medicine-search.ts`).
- `useAuthGate` (`auth-guard`), `useSettingsStore` (regions).

### API payloads
- **interaction-check** request: `{ mode: "lookup", substance, activePrescriptions: [{genericName, drugClass?}] }` or `{ mode: "conflict", newMedication, activePrescriptions }`. Response: `{ interactions: [{substance, medication, severity, description}], drugClass?, summary? }`.
- **medicine-search** request: `{ query, country? }`. Response: `MedicineSearchResult` (brandNames, localAlternatives, genericName, dosageStrengths, activeIngredients, strengthOptions[{label, compounds[]}], commonIndications, foodInstruction, foodNote?, pillColor, pillShape, pillDescription, drugClass, visualIdentification?, contraindications, warnings, isGenericFallback).

---

## Validation, edge cases & business rules

- **Categorization order**: stock ≤ 0 → out-of-stock first, regardless of `isActive`; then active vs inactive by the `isActive` flag.
- **Archived items** (`isArchived === true`) are excluded everywhere (list, expanded medicines, brand picker).
- **`currentStock` defaulting**: `?? 0` used throughout; `% 1 !== 0` detects fractional stock.
- **Low-stock rule**: `refillAlertPills` defined AND `0 <= currentStock <= refillAlertPills`. Negative stock is *not* "low" — it gets the "Negative" badge instead.
- **Combination drug rule**: a record is a combo when `compounds.length >= 2`. `strength` (sum of compounds) stays authoritative for dose math; `compounds` is descriptive/label-only. Dose split preserves the reference ratio and rounds to 2 decimals (`Math.round(x*100)/100`).
- **Effective phase**: active titration phase (with a `titrationPlanId`) overrides the maintenance phase; falls back to any active phase. The schedule + dose-amount labels follow this phase so the UI never contradicts the day's real doses.
- **Schedule summary collapsing**: only collapses to a single line when *every* schedule shares the same `dosage`.
- **Brand switch atomicity**: deactivate-then-activate is two sequential `mutateAsync` calls (no transaction); rows disabled while pending to avoid double-fire. Re-selecting the active brand is a no-op.
- **Interaction search**: trims the query; empty → no-op; requires ≥1 active prescription (server also enforces `.min(1)`). PII stripped server-side via `sanitizeForAI` before the AI call. Only `genericName`s are sent (not brand/stock/personal data).
- **Interaction cache**: keyed on trimmed+lowercased substance; 24h TTL; lookup results cached, conflict results not. All localStorage access wrapped in try/catch for SSR/quota safety.
- **Timeout arming**: the 15s abort timer starts only *after* `apiFetch` resolves with a real Response — so a blocking sign-in modal doesn't consume the timeout. Sign-in dismissal returns null silently.
- **Refresh interactions**: checks this prescription only against *other* active prescriptions (excludes self); disabled when none. Maps `AVOID`→contraindications, `CAUTION`→warnings, prepends `"Drug class: …"` to warnings, persists onto the prescription.
- **Interactions section visibility**: hidden when signed-out and no stored data (nothing can populate it).
- **AI tool-use enforcement**: both routes force `tool_choice` and re-validate the tool output with Zod; failures return 502 ("AI service unavailable") for interaction-check, or 422 with `fallbackToManual: true` for medicine-search.
- **Medicine-search generic fallback**: when an exact brand can't be matched, `isGenericFallback` is set and the description reflects the generic equivalent.
- **Updated-date display**: only shown when `item.updatedAt` is present; locale short month+day.

---

## Sub-components / variants

- **`CompoundList`** — top-level categorized inventory list (Active / Other / Out-of-stock) + interaction search + add buttons.
- **`CompoundGroup`** (internal to `compound-list.tsx`) — collapsible accordion grouping inactive items by compound (generic) name.
- **`MedicationCard`** — collapsed brand row → opens `InventoryItemViewDrawer`.
- **`CompoundCardExpanded`** — expanded prescription body: Medicines / Schedule / Today / Actions.
- **`BrandSwitchPicker`** — modal to set the active brand for a prescription.
- **`InteractionSearch`** — ad-hoc substance interaction checker (AI lookup, grouped severity results).
- **`InteractionsSection`** — per-prescription stored contraindications/warnings with AI refresh.
- **`PillIcon`** — SVG pill renderer (5 shapes × color × size).
- **`PillIconWithBadge`** — `PillIcon` + dose-status overlay badge.
- **`useInteractionCheck`** — lookup-mode hook with cache, abort, 15s timeout.
- **`useRefreshInteractions`** — conflict-mode hook that persists results to a prescription.
- **`useMedicineSearch`** — region-aware AI medication auto-fill (used by add-med wizard).
- Helpers: `isCombo`, `splitDose`, `scaleCompounds`, `compoundSum`, `formatCompoundShort/Full/Names` (`compound-utils.ts`); `formatPillCount`, `getEffectivePhase`, `formatDoseAmount` (`medication-ui-utils.ts`); `getCached`/`setCache`/`clearCache` (`interaction-cache.ts`).
