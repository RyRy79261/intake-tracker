# Verification — 09-history-drawer

**Verdict:** minor-gaps  ·  checked 95 claims, verified 89.

The document is highly accurate and detailed — nearly every enum member, label, color
token, threshold, and validation rule matches the source digit-for-digit. The one
material accuracy problem is the **Loading state**: the doc describes a spinner that, in
practice, can never render because `useHistoryData` seeds `useLiveQuery` with a truthy
`EMPTY_RESULT` default, so `historyData` is never falsy. A handful of minor wording
slips and small omissions round out the findings.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "Loading. `open && !historyData` → centered `Loader2` spinner" and "While `historyData` is undefined and the drawer is open, shows a centered spinner" — presented as a reachable state. | `useHistoryData` calls `useLiveQuery(fn, [limit], EMPTY_RESULT)`. Per dexie-react-hooks, the 3rd arg is the **default value** returned synchronously on first render and while pending, so `historyData` is `EMPTY_RESULT` (a truthy object), **never `undefined`**. Therefore `isLoading = open && !historyData` is effectively always `false`; the spinner branch (history-drawer.tsx:244-247) is unreachable and during initial load the **empty state** ("No records yet") shows instead. The literal expression is transcribed correctly but the described user-visible state does not occur. | use-history-queries.ts:35-52, 22-29; history-drawer.tsx:96,244-247; node_modules/dexie-react-hooks/dist/useLiveQuery.d.ts:2 |
| low | "Loader `limit` default `100` per table (`useHistoryData(100)`)." | The drawer calls `useHistoryData()` with **no argument**; the 100 comes from the hook's `limit = 100` default, not an explicit `useHistoryData(100)` call. | history-drawer.tsx:61-65; use-history-queries.ts:35 |
| low | "The cursor fetch over-fetches (`limit + 1`, then drops soft-deleted) to compensate." (order: over-fetch → drop) | `getRecordsByCursor` fetches the **entire** table (`query.toArray()`), filters `deletedAt === null` **first**, then slices to `limit + 1`. So soft-deletes are dropped before the `limit+1` slice, and there is no bounded "over-fetch" — it reads all rows. The net cap of 100 for the drawer holds, but the stated mechanism/order is inaccurate. | intake-service.ts:162-169 |
| low | Intake sub-types: "potassium falls into the `salt` row branch → `mg`" (mentions unit only). | True for the unit, but potassium also inherits the **salt theme's label "Sodium"** and the Sparkles icon/amber color in rows (themeKey is `water`/`sugar`/else→`salt`). The row therefore displays a potassium record labeled "Sodium", which the doc does not note. | record-row.tsx:29-37; card-themes.ts:60-67 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | Em-dash "—" fallback for measurement when a row has no displayable value: eating with no note, urination/defecation with no estimate+no note all render "—". Doc says "eating note" / "amount-estimate · note" without the empty fallback. | record-row.tsx:56,63-64,71-72 |
| low | Caffeine/alcohol measurement fallback strings "Caffeine"/"Alcohol" when description and amount are both empty. Doc gives the `desc · NN mg` / `desc · N drinks` forms but not the bare-label fallback. | record-row.tsx:80,90 |
| low | Alcohol drink pluralization: `drink` vs `drinks` is conditional on `amountStandardDrinks !== 1`. Doc's "N drinks" doesn't note the singular case. | record-row.tsx:87-89 |
| low | Row edit/delete buttons carry explicit hover color affordances (Edit → blue, Delete → red) and `aria-label`/`title` ("Edit entry"/"Delete entry"); keyboard Enter/Space also `preventDefault`s. Doc mentions role/tabindex/Enter-Space but not the per-button styling/aria. | record-row.tsx:129-149,106-111 |
| low | `EditEstimateEntryDialog` shared description text "Update the time, amount estimate, or note" and the amount Select placeholder "Select estimate"; note Textarea `min-h-[60px]`. Doc covers options/placeholders/accent but not these constants. | edit-estimate-entry-dialog.tsx:83,106,126 |
| low | Intake edit dialog `DialogDescription` "Update the amount, time, or note for this entry"; amount input has `text-lg h-12` + `autoFocus`; sr-only descriptive helper text per field. (Doc captures title/unit/maxLength/colours but not these.) | edit-intake-dialog.tsx:58,63-74 |
| low | `BloodPressureRecord.irregularHeartbeat` is an actual optional field on the record (carried in storage) and `initEditingState` does NOT populate it into bp `fields` (FieldMap.bp has no irregularHeartbeat). So even if the select were wired, the edit adapter has no irregular-heartbeat field to submit. Doc notes the select is "not wired" but not that the edit state omits the field entirely. | use-record-adapters.ts:36-44,88-103; db.ts:85 |
| low | `getLiquidTypeLabel` also decodes `source === "beverage"`→"Beverage", `substance:{id}`→note or "Drink", `manual:*`→note or "Food", and returns `null` for unknown formats. Doc lists coffee/beverage/juice/food/preset/manual but not the `substance:` and bare `manual:` sub-source branches or the unknown→null guard. | utils.ts:75-116 |

## Spot-confirmed

- PAGE_SIZE = 30; initial `page = 1`; "Load More" increments page; `hasMore = allRecords.length > page * PAGE_SIZE`. — history-drawer.tsx:47,74,95,103-106
- `allRecords` short-circuits to `[]` when `!open`; merges 6 domains and sorts by timestamp **descending**. — history-drawer.tsx:77-89
- Paging-before-filtering order: `records = allRecords.slice(0, page*PAGE_SIZE)` then `filterRecords(records, filter)`. — history-drawer.tsx:91-94,184
- Empty state triggers on `filteredRecords.length === 0` (post-filter), with History icon (w-12 h-12, opacity-30) + "No records yet" / "Start logging to see history here". — history-drawer.tsx:248-253
- Filter active tab: `variant="default"`, and tinted with `filterColorMap[value]` only when value !== "all". `text-xs shrink-0`. — history-drawer.tsx:229-234,199-207
- FILTER_TABS values/labels exactly: all/All, water/Water, salt/Salt, weight/Weight, bp/BP, eating/Eating, urination/Urination, defecation/Defecation. — history-drawer.tsx:188-197
- `FilterType` union includes sugar/potassium/caffeine/alcohol (filterable in code, no rendered tab). — history-types.ts:14,51-56
- `UnifiedRecord` domain types incl. caffeine/alcohol over `SubstanceRecord`. — history-types.ts:4-12
- `EditableType` = intake|weight|bp|eating|urination|defecation (caffeine/alcohol excluded); `openEdit` early-returns for caffeine/alcohol. — use-record-adapters.ts:25-31; history-drawer.tsx:141-144
- `useHistoryData` does NOT load substanceRecords — only the 6 domains. — use-history-queries.ts:13-52
- Date group key: en-US `{weekday:short, year:numeric, month:short, day:numeric}` → "Mon, Jan 15, 2026". Count pill singular/plural "entry"/"entries". — history-types.ts:32-37; history-drawer.tsx:261-263
- Row time: `formatTimeOnly` → en-US `{hour:numeric, minute:2-digit, hour12:true}` ("2:30 PM"). — date-utils.ts:75-81
- Intake row units: water→ml, sugar→g, else→mg. — record-row.tsx:36-37
- Measurement strings: weight `{w} kg`; bp `{sys}/{dia} mmHg`; intake `{amt} {unit} · {sourceLabel}`. — record-row.tsx:38-42,49,97
- CARD_THEMES labels/icons/iconColors/buttonBg all match doc exactly (water=Droplets/sky/bg-sky-600..., salt="Sodium"/Sparkles/amber, sugar=Candy/pink, potassium=Banana/purple, weight=Scale/emerald, bp="Blood Pressure"/Heart/rose, eating=Utensils/orange, urination=Droplet/violet, defecation=CircleDot/stone, caffeine=Coffee/yellow-700, alcohol=Wine/fuchsia). — card-themes.ts:38-269
- BP dialog ranges: systolic min=60 max=300, diastolic min=40 max=200, heartRate min=30 max=250 (placeholder "BPM"); sr-only hints "90-180"/"60-120"/"60-100". Position sitting/standing, Arm left/right. Irregular-heartbeat select only rendered when `onIrregularHeartbeatChange` provided (not wired by drawer). — edit-blood-pressure-dialog.tsx:83,101,119,124,92-94,109-111,127-129,139-141,154-156,163-180
- Intake edit: amount `type=number min=1 step=1`, label "Amount ({unit})", note `maxLength=200`, title "Edit {Water|Sugar|Sodium} Entry", save color sky/pink/amber by type. — edit-intake-dialog.tsx:44,57,62-67,103,116-122
- Weight edit: `type=number min=0.1 step=0.1`, "Weight (kg)", save emerald. — edit-weight-dialog.tsx:51,55-56,102
- Eating edit: time + "What I ate (optional)" Textarea (placeholder "e.g. Sandwich, apple"), grams `min=1 max=10000` only if `onGramsChange` passed (not wired), save orange. — edit-eating-dialog.tsx:48,63-69,72-86,91
- Urination dialog inline AMOUNT_OPTIONS small/medium/large, note placeholder "e.g. colour, urgency", accent violet, no "No estimate". — edit-urination-dialog.tsx:7-11,32-34
- Defecation dialog uses `DEFECATION_AMOUNT_OPTIONS` (small/medium/large), `allowNoEstimate`, placeholder "e.g. consistency, urgency", accent stone; "No estimate" sentinel `__none__` ↔ `""`. — edit-defecation-dialog.tsx:26-30; edit-estimate-entry-dialog.tsx:24,100-109; constants.ts:88-92
- `URINATION_AMOUNT_OPTIONS` also defined in constants (same small/medium/large) though urination dialog uses its own inline copy. — constants.ts:80-84; edit-urination-dialog.tsx:7-11
- DEFAULT_LIQUID_PRESETS names: Espresso, Double Espresso, Moka, Coffee, Tea, Beer, Wine, Spirit. — constants.ts:125-136
- Validation: intake `parseInt`≤0/NaN→"Invalid amount"; weight `parseFloat`≤0/NaN→"Invalid weight"; bp `parseInt` sys/dia≤0/NaN→"Invalid values" (heartRate parsed only if present); timestamp→`ValidationError("Invalid date/time")`. — use-record-adapters.ts:156-158,173-175,190-198,200-202,134-142
- Note trim divergence: intake/eating/urination/defecation `fields.note.trim() || undefined`; weight/bp `fields.note || undefined`. — use-record-adapters.ts:160,177,203,221,235,251
- Soft-delete model + each table capped at limit (100) via `getActiveRecords` slice / health-service slice; per-table load wrapped in try/catch with `console.error`, leaving that domain empty. Merged feed max 600. — record-crud.ts:39-41; health-service.ts:38,142; use-history-queries.ts:44-49
- Deletes: intake/eating/urination/defecation via `useDelete*` mutations; weight/bp via `deleteWeight`/`deleteBP` → `deleteWeightRecord`/`deleteBloodPressureRecord` (all soft-delete set `deletedAt`). — history-drawer.tsx:113-118; use-history-queries.ts:54-60; health-service.ts:61,165
- Delete: no confirmation dialog; spinner on that row's trash + `disabled={isDeleting}`; toast "Entry deleted"/"Record removed" on success, destructive "Error"/"Could not delete the entry" on failure. — history-drawer.tsx:108-128; record-row.tsx:143-148
- Edit submit: success → "Entry updated"; `ValidationError` → keeps dialog open + destructive toast with message; other error → destructive "Error"/"Could not update the entry". — history-drawer.tsx:158-182
- Action-button container `stopPropagation`s click; row `onClick={onEdit}` + role=button + tabIndex=0 + Enter/Space. — record-row.tsx:101-127
- PIN protection removed in "phase 41"; `handleOpenChange` is a passthrough. — history-drawer.tsx:98-101
- Drawer shell: `direction="bottom"`, `h-[96vh] flex flex-col`, header `border-b shrink-0`, body `flex-1 overflow-y-auto p-6`, tabs `overflow-x-auto`. Title "Health History" / desc "View and manage all your logged entries". — history-drawer.tsx:218-243,221-222
- `timestampToDateTimeLocal` / `dateTimeLocalToTimestamp` strip/reverse local offset; group key uses `toLocaleDateString` (calendar midnight, no dayStartHour). — date-utils.ts:20-39; history-types.ts:31-37
- db.ts record interfaces (IntakeRecord, WeightRecord, BloodPressureRecord, EatingRecord, UrinationRecord, DefecationRecord, SubstanceRecord) field lists + sync fields (createdAt/updatedAt/deletedAt/deviceId/timezone) match doc. BP `position: "standing"|"sitting"`, arm `"left"|"right"`. — db.ts:7-22,68-78,80-95,97-110,112-122,124-134,304-324

## Low-confidence / could-not-verify

- The `useLiveQuery` default-value semantics (and thus the unreachable loading spinner) were confirmed against the installed type declaration; runtime behavior was not exercised in a browser, but the type signature `useLiveQuery<T,TDefault>(querier, deps, defaultResult): T | TDefault` plus the truthy `EMPTY_RESULT` object make the conclusion firm.
- "Filtering is instant; paging is NOT reset on filter change" — confirmed there is no `setPage(1)` on `setFilter` (history-drawer.tsx:235), consistent with the doc; the user-facing consequence (empty filter view despite more data beyond the page) follows from the slice-then-filter order and is correctly described.
- Drag-down / backdrop dismiss behavior is delegated to the shadcn/vaul Drawer (`direction="bottom"`); standard behavior assumed, not separately re-derived from the vaul source.
