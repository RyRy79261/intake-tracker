# 15 — Prescriptions

**Files covered:**
- `src/components/medications/prescriptions-view.tsx` (list/grid container)
- `src/components/medications/prescription-card.tsx` (collapsed/expandable card)
- `src/components/medications/compound-card-expanded.tsx` (expanded body)
- `src/lib/prescription-service.ts` (CRUD + reads)
- `src/lib/medication-builders.ts` (record construction)
- `src/lib/medication-ui-utils.ts` (phase resolution, dose/pill formatting)
- `src/lib/compound-utils.ts` (combination-drug math/labels)
- `src/hooks/use-medication-queries.ts` (live-query hooks)
- `src/lib/db.ts` (`Prescription`, `MedicationPhase`, `PhaseSchedule`, `InventoryItem`, `CompoundStrength` interfaces + enums)
- `src/lib/dose-schedule-service.ts` (`DoseSlot`, `DoseSlotStatus`)
- `src/app/medications/page.tsx` (mounts the view under the `prescriptions` tab)

**Purpose:** The Prescriptions tab of the Medications screen lists every active prescription as a compact, tap-to-expand 2-column card grid. Each card surfaces the drug's identity, today's dosing state, titration/stock badges, and its active medicine (brand) mini-card; expanding reveals all stocked medicines, the schedule summary, today's per-dose status, and entry points to brand-switch and full prescription detail.

## Features

**List container (`PrescriptionsView`)**
- Reads all prescriptions via `usePrescriptions()` (live IndexedDB query), then filters to **active only** (`p.isActive`) and **sorts alphabetically by `genericName`** (`localeCompare`). Soft-deleted prescription records (`deletedAt` set) are already excluded by the `getPrescriptions()` read (which itself returns **createdAt-desc** order before the view re-sorts in-memory by `genericName`). Note: the inventory/phase reads (`getInventoryForPrescription`, `getPhasesForPrescription`) do **not** filter `deletedAt` — they return all rows for the prescription id.
- Renders cards in a **2-column CSS grid** (`grid-cols-2 gap-2`).
- **Single-expand accordion behavior:** only one card may be expanded at a time (tracked by `expandedId`). Opening a card closes any other.
- **Dynamic column-span layout (`spanMap`):** computes which cards should span both columns so the grid never leaves an awkward orphan when a card expands:
  - The expanded card always spans full width (`col-span-2`).
  - A half-width card that ends up alone on its row *because its neighbor expanded* is also promoted to full width — both the case where the lone card precedes the expanded card (left half occupied, right half pulled to a new row) and where it precedes an expanded next item.
  - An odd last item that is naturally alone stays at 1 column.
- Bottom **"Add prescription"** full-width outline button (with `Plus` icon) under the grid.
- Bottom padding `pb-24` to clear the fixed footer/tab bar.

**Card (`PrescriptionCard`)** — collapsed state shows:
- **Generic name** (bold, truncated, single line).
- **Indication** subtitle (only if `prescription.indication` present; truncated).
- **Chevron** affordance that rotates 180° when expanded.
- **Dosage chip** for the **time-sorted earliest slot today** (`prescriptionSlots[0]`, where slots are sorted ascending by `localTime` in dose-schedule-service — relevant when doses have differing dosages): plain `"{dosageMg}{unit}"` for single-compound drugs, or a per-compound split (`formatCompoundShort(splitDose(...))`, e.g. `49/51mg`) for combination drugs. Hidden if there is no dose today / no schedule.
- **Next-dose label** (see Enums) — "As needed", "No doses today", "All done", or `Next: HH:MM`.
- **Status badges row:** titration badges + stock badges (see States).
- **Active-medicine mini-card** (emerald-tinted), shown when an active, non-archived inventory item exists. Shows the pill icon (shape + color via `PillIconWithBadge`, invoked with only `shape`/`color`/`size` — **no badge actually renders** since no `status` prop is passed; `PillIconWithBadge`'s badge would be a dose-*status* glyph, not a count), the brand name, and the strength/compound label. A dose-amount line — `formatDoseAmount(firstSlot)` plus food-instruction text (e.g. `· before eating`) when the phase has a non-`none` `foodInstruction` — renders **only** when `firstSlot?.pillsPerDose != null && dosageMg != null` (so a PRN med or one with no slot today / no inventory strength shows the mini-card but no dose line). The mini-card is independently tappable.
- `whileTap` scale-down micro-interaction (`scale: 0.98`) on the whole card.

**Expanded body (`CompoundCardExpanded`)** — four sections separated by a top border:
1. **Medicines (inventory):** every non-archived stocked brand for the prescription, sorted active-first then alphabetically by `brandName`. The filter is `!item.isArchived` only — it is **not** a soft-delete filter, so a soft-deleted-but-not-archived inventory item could still appear (narrow exposure since soft-deleted prescriptions never reach the active list). Each row: pill icon (shape/color), brand name, an **Active** outline badge (`border-emerald-500 text-emerald-600`) if active, strength/compound label, stock text, optional **Low** badge, and a chevron. Empty → "No medicines added yet".
2. **Schedule summary** (only if an effective phase exists): an **On titration** badge in the header when the effective phase is a titration. If all schedule rows share the same dosage it collapses to one line — `"{dose} {freq} at {times}"` where freq is `daily` / `twice daily` / `Nx daily` — otherwise one line per schedule (`{dose} at {time}`). The displayed times come from the **deprecated `s.time`** raw HH:MM string (`schedules.map(s => s.time)` / `at {s.time}`) — **not** `scheduleTimeUTC`/`localTime`, so unlike the "Today" rows (which normalize from `scheduleTimeUTC`) this section shows the un-normalized stored string. Food instruction footnote ("Take before eating" / "Take after eating") when not `none`; a defensive fallthrough renders the raw `foodInstruction` string for any other value (unreachable given the enum). Empty → "No schedules configured".
3. **Today's dose status** (only if there are slots today): one row per slot with a status icon, the slot's `localTime`, the dose label, and the status word.
4. **Actions:** **Switch Brand** button (only when >1 non-archived brand exists) and **Prescription Details** button (always).

**Dose/label computation helpers**
- `getEffectivePhase` — the phase that governs dosing *now*, resolved as a three-step chain: `getActiveTitrationPhase(phases)` → `getMaintenancePhase(phases)` → `phases.find(p => p.status === "active")` (any active phase). Drives the dosage chip unit, food instruction, and "As needed" detection (`isAsNeeded = !effectivePhase`).
- `getMaintenancePhase` — itself a two-step: prefers an **active** maintenance phase, then falls back to any maintenance phase.
- `getActiveTitrationPhase` / `getPendingTitrationPhase` — drive the titration badges (each requires `type === "titration"`, the matching status, and a non-null `titrationPlanId`).
- Combination-drug labeling via `isCombo` / `splitDose` / `formatCompoundShort` / `formatPillCount`.

## User actions & interactions

- **Tap a card (anywhere on the card surface):** toggles expand/collapse. Expanding collapses any other open card and recomputes the span layout.
- **Tap the active-medicine mini-card:** `stopPropagation` (does not toggle expand) → opens the **InventoryItemViewDrawer** for that active brand. Keyboard-accessible (`role="button"`, `tabIndex=0`, Enter/Space activate).
- **Tap a medicine row in the expanded Medicines list:** opens **InventoryItemViewDrawer** for that brand.
- **Tap "Switch Brand"** (expanded, multi-brand only): opens **BrandSwitchPicker**.
- **Tap "Prescription Details"** (expanded): opens **PrescriptionViewDrawer** (full prescription view/edit).
- **Tap "Add prescription" / "Add your first prescription":** calls `onAddMed()` → opens the add-medication wizard (`setWizardOpen(true)`).
- All clicks inside the expanded body `stopPropagation` so interacting with it does not collapse the card.
- **Service-level mutations** (invoked from drawers/wizard, not from the card surface directly):
  - `addPrescription(input)` — creates prescription + (optional) initial maintenance phase + schedules + inventory item, plus an initial-stock refill transaction when `currentStock > 0`; writes a `prescription_added` audit entry; enqueues all for sync.
  - `updatePrescription(id, updates)` — partial update (id/createdAt excluded), bumps `updatedAt`, audit `prescription_updated` records the changed field names.
  - `deletePrescription(id)` — **soft delete** cascade: hard-deletes dose logs; soft-deletes inventory items (and hard-deletes their transactions), phases, schedules, and the prescription (`deletedAt`/`updatedAt` set); audit `prescription_deleted`; enqueues deletes for sync.
  - `addMedicationToPrescription(...)` — a sibling mutation (reachable via this domain's hooks, `use-medication-queries.ts`, defined in `phase-service.ts`) that **adds a new brand** to an existing prescription (auto-activating it only when no other active brand exists); it backs the add-medication flow, **not** the "Switch Brand" flow.
  - **"Switch Brand" mutation owner:** the deactivate/activate is owned by `BrandSwitchPicker` itself, not `compound-card-expanded` (which only opens the picker) and not a dedicated service function. In `handleSelect`, the picker calls the `useUpdateInventoryItem()` hook twice via `mutateAsync` — first `{ isActive: false }` on the current active brand, then `{ isActive: true }` on the selected brand — then toasts "Brand switched". No `prescription-service`/`phase-service` function is involved.

## States & presentations

- **Empty (no active prescriptions):** centered column with a `Cat` icon (`w-16 h-16`, muted at 40% opacity), "No prescriptions yet", and an outline "Add your first prescription" button.
- **Default / populated:** 2-column card grid + bottom "Add prescription" button.
- **Collapsed card:** name, indication, dosage chip, next-dose label, badges, optional active-medicine mini-card, chevron pointing down.
- **Expanded card:** chevron rotated 180°, full-width span, animated height/opacity reveal of the four-section body.
- **Card pressed:** `whileTap` scale 0.98; hover raises background (`hover:bg-muted/40`).
- **Next-dose label states:** "As needed" (no effective phase / PRN), "No doses today" (no slots, or slots exist but no pending), "All done" (slots exist and none pending), `Next: HH:MM` (earliest pending slot's local time).
- **Titration badges (mutually exclusive on the card):**
  - **On titration** — solid amber badge, shown when an active titration phase exists.
  - **Titration planned** — blue outline badge, shown when no active titration but a pending titration phase exists.
- **Stock badges:**
  - **Negative** — destructive (red) badge when active inventory `currentStock < 0`.
  - **Low** — solid amber badge when not negative and `currentStock <= refillAlertPills` (only if `refillAlertPills` defined).
- **Active-medicine mini-card present vs absent:** shown only when an active, non-archived inventory item exists; absent otherwise (no placeholder).
- **Expanded Medicines list:** active brand gets an emerald **Active** outline badge; low-stock brand gets a **Low** amber badge; negative stock renders stock text in red/medium; empty → "No medicines added yet".
- **Per-dose status rows (Today):** color-coded icon + status word — taken (emerald check), skipped (gray X), pending (muted minus), missed (amber clock). `deriveStatus` collapses a `rescheduled` dose log to slot status **`skipped`** ("rescheduled slots show as handled"), and maps a missing log on a past date to `missed` — so the row never renders a distinct "rescheduled" state even though `DoseStatus` defines one.
- **Schedule section:** hidden entirely when no effective phase; "No schedules configured" when phase exists but has no schedule rows.
- **Loading:** `usePrescriptions()` is a `useLiveQuery` seeded with an empty array default → renders the empty state until data resolves (no explicit skeleton/spinner). `useDailyDoseSchedule` may be `undefined` before resolving (coerced to `[]`).
- **Offline/sync:** no offline-specific UI here; all reads are local IndexedDB. Mutations enqueue sync ops and call `schedulePush()` — sync status is not surfaced on these cards.
- **Disabled/validation/error states:** none rendered at the card/list level (validation lives in the wizard/drawers).

## Enums, options & configurable values

- **`PillShape`** = `"round" | "oval" | "capsule" | "diamond" | "tablet"` (default `"round"`; default color `#94a3b8`).
- **`FoodInstruction`** = `"before" | "after" | "none"`. Card/expanded labels: `before` → "before eating" / "Take before eating"; `after` → "after eating" / "Take after eating"; `none` → omitted.
- **`PhaseType`** = `"maintenance" | "titration"`.
- **`MedicationPhase.status`** = `"active" | "completed" | "cancelled" | "pending"`.
- **`DoseStatus`** (db.ts) = `"taken" | "skipped" | "rescheduled" | "pending"`.
- **`DoseSlotStatus`** (dose-schedule-service) = `"taken" | "skipped" | "pending" | "missed"` — the four statuses the per-dose rows render.
- **`TitrationPlanStatus`** = `"draft" | "active" | "completed" | "cancelled"`.
- **`InventoryTransaction.type`** = `"refill" | "consumed" | "adjusted" | "initial"` (card creation uses `"refill"` for initial stock).
- **`DoseSlot.inventoryWarning`** (computed per slot in dose-schedule-service) = `"no_inventory" | "odd_fraction" | "negative_stock"`. Computed but **not surfaced** anywhere on the card/expanded body (read-only at the surface).
- **Next-dose labels:** `"As needed"`, `"No doses today"`, `"All done"`, `"Next: {HH:MM}"`.
- **Frequency words (schedule summary):** `daily` (1/day), `twice daily` (2/day), `{n}x daily` (≥3/day).
- **Badge label strings:** `On titration`, `Titration planned`, `Negative`, `Low`, `Active`.
- **Pill-count fractions** (`formatPillCount`): renders `¼`/`½`/`¾` (Unicode), "1 tablet", "{n} tablets", and whole+fraction combos (e.g. "1½ tablets").
- **Unit:** free-form string, default `"mg"` (from effective phase, falls back to literal `"mg"`).
- **Schedule `daysOfWeek`:** integer array (0–6) per schedule row.
- **`dosageMg` rounding:** dosage stored as summed mg; `pillsPerDose = dosageMg / inventory.strength` rounded to 4 decimals; compound splits rounded to 2 decimals.
- **Default colors:** pill color fallback `#94a3b8`; emerald tints for active-medicine mini-card and Active badge; amber-500 for titration/low badges.

## Data model touched

- **`Prescription`** (read/write): `id`, `genericName`, `indication`, `notes?`, `contraindications?: string[]`, `warnings?: string[]`, `compounds?: CompoundStrength[]`, `isActive`, `createdAt`, `updatedAt`, `deletedAt: number|null`, `deviceId`. The card reads `genericName`, `indication`, `id`, `isActive`, `compounds`.
- **`CompoundStrength`**: `{ name: string; strength: number }`. Present (length ≥ 2) marks a combination drug; describes one reference dose and fixes the ratio for labeling.
- **`MedicationPhase`** (read): `id`, `prescriptionId`, `type`, `unit`, `startDate`, `endDate?`, `foodInstruction`, `foodNote?`, `notes?`, `status`, `titrationPlanId?`. Drives effective phase, unit, food instruction, titration badges.
- **`PhaseSchedule`** (read): `id`, `phaseId`, `time` (deprecated), `scheduleTimeUTC` (minutes from UTC midnight), `anchorTimezone`, `dosage`, `daysOfWeek`, `enabled`, `unit?`. Drives schedule summary.
- **`InventoryItem`** (read): `id`, `prescriptionId`, `brandName`, `currentStock?` (deprecated; sum-of-transactions is authoritative), `strength`, `compounds?`, `unit`, `pillShape`, `pillColor`, `visualIdentification?`, `refillAlertDays?`, `refillAlertPills?`, `isActive`, `isArchived?`, `timezone`. Card uses the first active non-archived item; expanded body lists all non-archived items.
- **`DoseSlot`** (read, computed by dose-schedule-service): `prescriptionId`, `phaseId`, `scheduleId`, `scheduledDate`, `scheduleTimeUTC`, `localTime`, `dosageMg`, `unit`, `status`, `existingLog?`, `prescription`, `phase`, `schedule`, `inventory?`, `pillsPerDose?`, `inventoryWarning?`.
- **`InventoryTransaction`** (write on create): initial-stock refill row. **`DoseLog`**, **`auditLogs`**, **`_syncQueue`** also written by the service mutations.

## Validation, edge cases & business rules

- **Active-only list:** the view filters to `isActive === true`; inactive/soft-deleted prescriptions never appear here.
- **Soft delete:** `deletePrescription` sets `deletedAt` on prescription/phases/schedules/inventory (and removes dose logs + transactions hard); reads exclude `deletedAt`-set records.
- **PRN / as-needed:** a prescription created with an empty `schedules` array gets **no phase and no schedules** → `getEffectivePhase` returns undefined → card shows "As needed" and no dosage chip.
- **Effective phase precedence:** active titration phase wins over the active maintenance phase, so the displayed dose/unit/food instruction always matches the day's real doses.
- **Single-expand invariant:** opening any card collapses the previously expanded one (`expandedId` is a single nullable id).
- **Span layout correctness:** the `spanMap` logic guarantees no half-width card is left visually orphaned when a neighbor expands; the natural odd-last card is intentionally left at half width.
- **Combination-drug math:** `strength`/`dosage` always store the **sum** of compound strengths (so `pillsPerDose = dosage / strength` stays valid); `compounds` is descriptive-only and used to label per-compound splits. `isCombo` requires ≥ 2 compounds.
- **Stock thresholds:** "Low" requires `refillAlertPills` to be defined and `currentStock <= refillAlertPills` and stock ≥ 0; "Negative" requires stock < 0; the two are mutually exclusive in the card badge logic.
- **Fractional stock:** expanded medicine rows render fractional stock via `formatPillCount` (e.g. "½ tablet"), whole counts as "{n} pills".
- **Timezone/day logic:** "today" derived from `toLocalDateKey()` (device-local date key); schedules persist `scheduleTimeUTC` + `anchorTimezone`, and slot `localTime` is rendered in the device timezone.
- **Sync:** every create/update/delete enqueues sync ops inside the transaction and calls `schedulePush()`; all wrapped in `ServiceResult` (`ok`/`err`) with try/catch.
- **Card is read-only at the surface:** editing/deleting/switching happens only via the drawers/wizard launched from the card.

## Sub-components / variants

- **`PrescriptionsView`** — active-prescription grid container with single-expand accordion + dynamic span layout and empty state.
- **`PrescriptionCard`** — collapsed/expandable card; controlled (`expanded`/`onToggleExpanded`) or self-managed; renders summary, badges, active-medicine mini-card, and wraps the expanded body.
- **`CompoundCardExpanded`** — expanded body: medicines list, schedule summary, today's dose status, and Switch-Brand / Prescription-Details actions.
- **`PillIcon` / `PillIconWithBadge`** — SVG pill glyph by `shape` + `color` (badge variant adds a count badge).
- **`Badge`** (shadcn) — used for titration/stock/active labels (variants: solid amber, blue outline, destructive, emerald outline).
- **`Card`** (shadcn) — card surface.
- **`InventoryItemViewDrawer`** — per-brand medicine detail drawer (opened from mini-card and medicine rows).
- **`BrandSwitchPicker`** — switch the active stocked brand (multi-brand only).
- **`PrescriptionViewDrawer`** (in `edit-medication-drawer.tsx`) — full prescription view/edit drawer.
- **Hooks:** `usePrescriptions`, `usePhasesForPrescription`, `useInventoryForPrescription`, `useDailyDoseSchedule`, `useSchedulesForPhase` (all `useLiveQuery`-backed).
