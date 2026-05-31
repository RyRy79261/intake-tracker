# Verification — 15-prescriptions

**Verdict:** minor-gaps  ·  checked 78 claims, verified 72.

This document is largely accurate and unusually faithful to the implementation. Most enums, defaults, thresholds, labels and calculations check out digit-for-digit. The notable issues are: (1) a misleading "count badge" claim on the active-medicine mini-card's pill icon, (2) the schedule summary renders the **deprecated `time`** field rather than the timezone-aware `localTime`/`scheduleTimeUTC`, and (3) several small over/under-statements around read filtering and the dose-amount line's render condition.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | Active-medicine mini-card shows the pill icon "with a count badge via `PillIconWithBadge`" (line 38). | `PillIconWithBadge` is invoked with only `shape`/`color`/`size` — **no `status` prop** — so no badge renders at all. Moreover `PillIconWithBadge`'s badge is a *status* glyph (taken/skipped/rescheduled check/X/clock), not a *count* badge. There is no count-badge feature anywhere in this component. | prescription-card.tsx:176-180; pill-icon.tsx:63-95 |
| medium | Schedule summary line "at {times}" / `{dose} at {time}` is driven by `scheduleTimeUTC` (the doc emphasizes `scheduleTimeUTC` "minutes from UTC midnight" as the schedule's authoritative time, line 112). | The expanded schedule summary renders the **deprecated `s.time`** raw HH:MM string (`schedules.map(s => s.time)` and `at {s.time}`), not `scheduleTimeUTC`/`localTime`. So unlike the "Today" rows (which use `localTime` from `scheduleTimeUTC`), the schedule summary shows the un-normalized stored string. | compound-card-expanded.tsx:170,186 |
| low | "Active-medicine mini-card … shows … a dose-amount line combining `formatDoseAmount(firstSlot)` with food-instruction text" — presented as always-present when the mini-card shows (line 38). | The dose-amount line is gated by an **extra condition** `firstSlot?.pillsPerDose != null && dosageMg != null`. A PRN med (or one with no slot today / no inventory strength) shows the mini-card but **no** dose line. | prescription-card.tsx:192-197 |
| low | Expanded Medicines list shows "every non-archived stocked brand" (line 42); "Soft-deleted records (`deletedAt` set) are already excluded by the service read" (line 21, scoped to prescriptions). | `getInventoryForPrescription` and `getPhasesForPrescription` do **not** filter `deletedAt` — they return all rows for the prescription id. The expanded list filters only `!item.isArchived`, so a soft-deleted (but not archived) inventory item could still appear. In practice soft-deleted prescriptions never reach the active list, so the exposure is narrow, but the "non-archived" filter is not a soft-delete filter. | inventory-service.ts:20-22; phase-service.ts:59-64; compound-card-expanded.tsx:50 |
| low | Foot-instruction footnote text mapping is exhaustive: `before`→"Take before eating", `after`→"Take after eating", `none`→omitted (line 43/91). | Correct for the three real enum members, but the code has a **fallthrough** that renders the raw `effectivePhase.foodInstruction` string for any value that is neither "before" nor "after" nor "none" — a defensive branch the doc doesn't mention (harmless given the enum, noted for completeness). | compound-card-expanded.tsx:195-203 |
| low | "sorts alphabetically by `genericName`" is described as the list's ordering, with the service read already excluding soft-deletes (line 21). | Accurate, but worth noting the underlying `getPrescriptions()` read returns **createdAt-desc** order; the view re-sorts in-memory by `genericName.localeCompare`. The net visible order is alphabetical (claim holds); the doc just omits the service's own ordering. | prescription-service.ts:42-44; prescriptions-view.tsx:17-19 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The collapsed dosage chip is taken from `prescriptionSlots[0]` which is the **time-sorted earliest slot** of the day (slots sorted by `localTime` in dose-schedule-service), not merely "first scheduled" — relevant when doses have differing dosages. | dose-schedule-service.ts:237; prescription-card.tsx:53-58 |
| low | `getEffectivePhase` has a **third fallback** beyond "active titration → maintenance": `phases.find(p => p.status === "active")` (any active phase). Doc says "falls back to any active phase" in prose (line 48) but the Enums/helpers list under-describes the precedence chain. (Minor — prose does cover it.) | medication-ui-utils.ts:47-55 |
| low | `getMaintenancePhase` itself prefers an **active** maintenance phase, then falls back to any maintenance phase — a two-step the doc folds into "maintenance". | medication-ui-utils.ts:13-20 |
| low | `deriveStatus` maps a `rescheduled` dose log to slot status **`skipped`** ("rescheduled slots show as handled"), and a missing log on a past date to `missed`. The per-dose row therefore never shows a distinct "rescheduled" state even though `DoseStatus` has one. Doc lists both enums but doesn't note the rescheduled→skipped collapse at the slot layer. | dose-schedule-service.ts:59-78 |
| low | `DoseSlot.inventoryWarning` carries `"no_inventory" \| "odd_fraction" \| "negative_stock"` and is computed per slot; the card/expanded body do not surface it (read-only at surface, consistent with doc) — but the enum-ish warning set is omitted from the doc's enum list. | dose-schedule-service.ts:42,197-213 |
| low | The "Active" outline badge in the expanded Medicines list uses `border-emerald-500 text-emerald-600`; the active-medicine mini-card uses emerald-50/950 tints. Doc says "emerald" generally; exact token (`emerald-500` border) not stated (cosmetic). | compound-card-expanded.tsx:116-122 |
| low | `addMedicationToPrescription` (add a brand to an existing Rx) exists as a sibling mutation reachable from this domain's hooks; doc only enumerates add/update/delete prescription mutations (appropriately scoped, but the brand-add path backs "Switch Brand"/medicines list). | use-medication-queries.ts:144-148 |

## Spot-confirmed

- 2-column grid `grid grid-cols-2 gap-2`, bottom `pb-24`, full-width outline "Add prescription" with `Plus` icon — prescriptions-view.tsx:89-108.
- Active-only filter `p.isActive` + `genericName.localeCompare` sort — prescriptions-view.tsx:17-19.
- Single-expand accordion via single nullable `expandedId`; opening one closes others — prescriptions-view.tsx:15,99.
- `spanMap` logic: expanded card `col-span-2`; lone neighbor promoted to full width in both the "col===1 previous-item-alone" and "next-is-expanded" cases; odd last item guarded by `!isLast` stays half — prescriptions-view.tsx:25-72.
- Empty state: `Cat` icon `w-16 h-16 text-muted-foreground/40`, "No prescriptions yet", outline "Add your first prescription" — prescriptions-view.tsx:74-86.
- Next-dose label states exactly "As needed" / "No doses today" / "All done" / `Next: {localTime}`, with `isAsNeeded = !effectivePhase` — prescription-card.tsx:74-87.
- Dosage chip: plain `${dosageMg}${unit}` single / `formatCompoundShort(splitDose(...))` combo; hidden when `dosageMg === undefined` — prescription-card.tsx:62-67,128.
- Titration badges mutually exclusive: solid amber "On titration" (active titration) vs blue-outline "Titration planned" (`!activeTitration && pendingTitration`) — prescription-card.tsx:139-148.
- Stock badges: destructive "Negative" when `currentStock < 0`; amber "Low" when `!negative && refillAlertPills !== undefined && currentStock <= refillAlertPills` — prescription-card.tsx:89-95,149-158.
- `whileTap={{ scale: 0.98 }}` + `hover:bg-muted/40`; chevron `animate rotate 180` when expanded — prescription-card.tsx:99,104,118-124.
- Mini-card `stopPropagation` + keyboard (`role="button"`, `tabIndex=0`, Enter/Space) opens `InventoryItemViewDrawer` — prescription-card.tsx:163-174,217-222.
- Expanded body four sections separated by `border-t`, all clicks `stopPropagation` — compound-card-expanded.tsx:71-75.
- Medicines list sorted active-first then `brandName` alphabetical; empty → "No medicines added yet"; per-row pill icon, Active outline badge, strength/compound label, stock text, Low badge, `ChevronRight` — compound-card-expanded.tsx:49-149.
- Schedule freq words: `daily` (1) / `twice daily` (2) / `${n}x daily` (≥3); collapses when all dosages equal; "No schedules configured" empty state — compound-card-expanded.tsx:168-194.
- Per-dose status icons: taken→emerald `CheckCircle2`, skipped→gray `XCircle`, pending→muted `MinusCircle`, missed→amber `Clock`; status word + `localTime` + dose label — compound-card-expanded.tsx:215-249.
- Actions: "Switch Brand" only when `hasMultipleBrands` (`sortedInventory.length > 1`); "Prescription Details" always; open `BrandSwitchPicker` / `PrescriptionViewDrawer` — compound-card-expanded.tsx:57,256-289.
- Enums verified digit-for-digit: `PillShape` (5 members), `FoodInstruction` (3), `PhaseType` (2), `MedicationPhase.status` 4-state, `DoseStatus` (4), `DoseSlotStatus` (4), `TitrationPlanStatus` (4), `InventoryTransaction.type` (4 incl. "initial") — db.ts:136-138,173,185,193,262; dose-schedule-service.ts:17.
- Defaults: pill shape default `"round"`, pill color fallback `#94a3b8`, unit fallback literal `"mg"` — prescription-card.tsx:60,177-178; compound-card-expanded.tsx:106-107.
- `formatPillCount`: `¼`/`½`/`¾` Unicode (U+00BC/BD/BE), "1 tablet", "{n} tablets", whole+fraction "1½ tablets" — medication-ui-utils.ts:61-83; expanded row uses `${stock} pills` for whole numbers — compound-card-expanded.tsx:94-96.
- Rounding: `pillsPerDose = round(dosageMg/strength, 4 decimals)`; `splitDose` rounds per-compound to 2 decimals — dose-schedule-service.ts:200-202; compound-utils.ts:38-41.
- `isCombo` requires `compounds.length >= 2`; `strength`/`dosage` store the **sum**; compounds descriptive — compound-utils.ts:17-25; db.ts:159-165,232-240.
- Service mutations: `addPrescription` creates Rx + optional maintenance phase + schedules + inventory, refill txn only when `currentStock > 0` (type `"refill"`, "Initial stock" note), audit `prescription_added`, enqueues all — prescription-service.ts:64-116.
- `updatePrescription` partial update (id/createdAt excluded), bumps `updatedAt`, audit `prescription_updated` with `Object.keys(updates)` — prescription-service.ts:118-139.
- `deletePrescription` soft-delete cascade: hard-deletes dose logs; for each inventory item hard-deletes its transactions then soft-deletes the item; soft-deletes schedules then phases then prescription (`deletedAt`/`updatedAt`); audit `prescription_deleted`; enqueues deletes — prescription-service.ts:141-179.
- PRN path: empty `schedules` → `phase = null`, no schedules → `getEffectivePhase` undefined → "As needed", no chip — prescription-service.ts:76-79; prescription-card.tsx:74-77.
- `usePrescriptions`/`useDailyDoseSchedule` are `useLiveQuery`; `usePrescriptions` seeded `[]` default, `useDailyDoseSchedule` may be `undefined` (coerced via `allSlots ?? []`) — use-medication-queries.ts:78-83; prescription-card.tsx:53.
- "today" via `toLocalDateKey()`; `localTime` formatted from `scheduleTimeUTC` in device tz — prescription-card.tsx:33-35; dose-schedule-service.ts:188.
- Page mounts `PrescriptionsView` under the `prescriptions` tab with `onAddMed → setWizardOpen(true)` — medications/page.tsx:34-36,57-59.
- `PrescriptionViewDrawer` exported from `edit-medication-drawer.tsx` — edit-medication-drawer.tsx:31.

## Low-confidence / could-not-verify

- "blue outline badge" token: code uses `border-blue-400 text-blue-600 dark:text-blue-400` — matches "blue outline" intent; exact shade naming is interpretive, not an inaccuracy.
- Visual/animation specifics (height/opacity reveal `duration: 0.2`, chevron `0.2`, whileTap `0.1`) are present in source and match the doc's qualitative description; not independently rendered/observed here.
- The doc's `InventoryItemViewDrawer` / `BrandSwitchPicker` internal behaviors (validation, edit) are out of this unit's scope and were not deeply audited — only their existence and wiring from the card were confirmed (files present: inventory-item-view-drawer.tsx, brand-switch-picker.tsx).
