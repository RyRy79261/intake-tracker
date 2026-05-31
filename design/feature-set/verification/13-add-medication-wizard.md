# Verification — 13-add-medication-wizard

**Verdict:** accurate · checked 96 claims, verified 92.

Adversarial read of every file in the "Files covered" list plus the service/db/query/rate-limit
dependencies they touch. The document is unusually faithful to the code: enums, presets, defaults,
thresholds, labels, and calculations were checked digit-for-digit and almost all confirmed. The few
discrepancies are minor (an over-broad audit-logging claim and a couple of small omissions). No
medium/high inaccuracies found.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Per-step validation gate … logs a `validation_error` audit entry" / "Required: brand name … logs a `validation_error`". Phrased as if every validation failure is audited. | Only the brandName (`search`), `schedule`, and `inventory` Zod failures call `logAudit("validation_error", …)`. The **combination-drug** validation failure (`isCombination` with <2 valid compounds) sets `errors.compounds` and returns false **without** any `logAudit` call. | use-add-medication-form.ts:194-205 (no audit) vs 185, 222, 244 (audit) |
| low | Step labels listed as "Search Medicine / Pill Appearance / Indication & Notes / Dosage / Schedule / Inventory". | Matches exactly, but the `dosage` label is the bare string `"Dosage"` and `schedule` is `"Schedule"` (doc's slash-list could read as longer labels). Confirmed identical — flagged only because the doc compresses them. | add-medication-wizard.tsx:34-41 |
| low | Region context: "secondary appended as fallback when set and ≠ \"None\"/\"none\"". | Correct, but the appended string is the literal `" (and <secondary> as secondary fallback)"` concatenated onto the *country* value, and the **prompt** wraps it as "focusing specifically on brands and availability in <country>". Doc states both pieces but in separate sections; no single statement is wrong. | use-medicine-search.ts:48-54; route.ts:165-167 |

(No high or medium inaccuracies were found. Every enum member, preset hex, dose multiplier, default
value, threshold, and label in the "Enums, options & configurable values" section was checked
character-by-character and matches the source.)

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | DosageStep renders an "Each pill contains <contents>" line above the dose presets (`pillContents` = `formatCompoundFull` for combos, else `dosageStrength`). The doc's Step-4 description never mentions this line. | dosage-step.tsx:40-44 |
| low | The combination-validation error path is the one validation branch that does **not** write an audit log (see Inaccuracy #1) — worth calling out as an asymmetry the doc glosses. | use-add-medication-form.ts:194-205 |
| low | `addMedicationToPrescription` (existing-Rx path) has non-trivial activation semantics the doc omits: the new InventoryItem is set `isActive: !hasActiveBrand`, i.e. it only auto-activates when the Rx currently has no active, non-archived, non-deleted brand; it never archives the existing brand or touches the phase/schedule. Doc says only "a new InventoryItem … no new phase/schedule/indication" — true but understates the activation rule. | phase-service.ts:80-115 |
| low | `addPrescription` skips creating a Phase **and** Schedules entirely when `input.schedules.length === 0` (PRN/as-needed). Doc states PRN "saves with empty `schedules`" but does not mention the service consequently persists **no MedicationPhase at all** (phase = null) for a PRN med. | prescription-service.ts:76-79 |
| low | Initial-stock InventoryTransaction is only created when `currentStock > 0`, and is typed `"refill"` with note `"Initial stock"`. Doc mentions `buildTransaction` "for the initial stock seed" but not the >0 guard or the `"refill"`/note specifics. | prescription-service.ts:97-101; phase-service.ts:94-98 |
| low | `useInteractionCheck` also exposes `isLoading`, `error`, lookup-mode caching (`getCached`/`setCache`), and a sibling `useRefreshInteractions` hook; the wizard only consumes `check`/`data`/`reset`. Doc's "caching, abort, and 15s timeout" summary is accurate but omits the lookup/cache + refresh surface. | use-interaction-check.ts:40-201 |
| low | `PhaseSchedule` has an optional `unit?` field (display unit); `buildSchedules` does not set it. Not load-bearing for the wizard but part of the written record shape the doc enumerates. | db.ts:219; medication-builders.ts:85-98 |

## Spot-confirmed (sample of key claims confirmed, with file:line)

- 6 canonical steps `search → appearance → indication → dosage → schedule → inventory`; dynamic
  filter drops `indication`+`dosage` for existing Rx and `schedule` for existing Rx **or** `asNeeded`.
  Confirmed. add-medication-wizard.tsx:33, 83-87.
- Drawer shell: `max-w-[100vw] overflow-hidden max-h-[90dvh]`; body `min-h-[300px] max-h-[60dvh]
  overflow-y-auto`. Confirmed. add-medication-wizard.tsx:356, 402.
- Segmented progress: `bg-teal-500` for `i <= currentStepIndex`, else `bg-muted`. Confirmed. :390-399.
- Header "Step X of N" with `N = activeSteps.length`. Confirmed. :383-385.
- Top-left button = Back (`ArrowLeft`) when `canGoBack` else Close (`X`); calls `goBack`/`handleClose`.
  Confirmed. :376-380.
- PILL_SHAPES (5): round/oval/capsule/diamond/tablet. Default `round`. Confirmed. types.ts:8-14;
  use-add-medication-form.ts:84.
- PRESET_COLORS (15) — all 15 hex values match digit-for-digit, default `#E91E63`. Confirmed.
  types.ts:16-20; use-add-medication-form.ts:86.
- COLOR_NAME_MAP — every mapping (pink/magenta→E91E63, teal AND cyan→00BCD4, amber AND orange→FF9800,
  brown/beige/tan→795548, gray/grey→607D8B, etc.) matches. Confirmed. types.ts:22-44.
- DOSE_MULTIPLIERS = `[0.25, 0.5, 1, 1.5, 2, 3]` (6), default `dosageAmount = 1`. Confirmed.
  types.ts:47; use-add-medication-form.ts:95.
- ALL_DAYS `[0,1,2,3,4,5,6]`, DAY_LABELS_SHORT `Su,Mo,Tu,We,Th,Fr,Sa`. Confirmed. types.ts:49-50.
- FoodInstruction `before/after/none`, default `none`, options Before/After/Not important. Confirmed.
  db.ts:137; indication-step.tsx:26-30; use-add-medication-form.ts:91.
- Schedule defaults: first row `{ time:"08:30", daysOfWeek: all, dosage:1 }`; added rows `"20:30"`.
  Confirmed. use-add-medication-form.ts:99; schedule-step.tsx:32.
- Default selection `selectedPrescriptionId = "new"`; sentinel option "Create new prescription".
  Confirmed. use-add-medication-form.ts:70; search-step.tsx:64.
- ConflictCheckState `idle|checking|warning|unavailable`; overlay renders ONLY `checking` and
  `warning`; "OK" severity filtered out of the warning list. Confirmed.
  conflict-check-overlay.tsx:7, 30-39, 52-53.
- AVOID badge = `destructive` variant; CAUTION badge = amber (`bg-amber-500`). Confirmed. :63-72.
- Conflict gate: runs only `showAi && conflictCheckState==="idle" && selectedPrescriptionId==="new"`
  with `activeMeds.length > 0`; AVOID/CAUTION ⇒ `setConflictCheckState("warning"); return`. "Save
  Anyway" sets state to `warning` then re-calls `handleSave`, which skips the re-check (state≠idle).
  Confirmed. add-medication-wizard.tsx:235-259, 365-368.
- AI search: `/api/ai/medicine-search`, `CLAUDE_MODELS.premium` (= `claude-opus-4-6`),
  `max_tokens: 2048`, `temperature: 0`, forced `tool_choice {type:"tool", name:"medicine_search_result"}`.
  Confirmed. route.ts:170-178; claude-client.ts:28.
- Request schema: query `min 1 / max 200`, country `max 100` optional. Rate limiter `createRateLimiter(15)`
  with default 60s window ⇒ 15 req/window, 429 on exceed. Invalid tool output ⇒ 422
  `{ fallbackToManual: true }`. Confirmed. route.ts:13-16, 126, 132-137, 193-206; rate-limit.ts:41.
- MedicineSearchResponseSchema fields list (brandNames…isGenericFallback, strengthOptions with
  `{label, compounds[]}`, foodInstruction enum) — all present and match. Confirmed. route.ts:28-46.
- Interaction-check 15000ms client AbortController timeout. Confirmed. use-interaction-check.ts:98.
- Query-driven dose auto-select: `/(\d+(?:\.\d+)?)\s*mg/i` for single, numeric match for combos
  (label includes OR `compoundSum` startsWith). Confirmed. add-medication-wizard.tsx:142-186.
- parseStrength regex `(\d+(?:\.\d+)?)\s*([a-zA-Z]+)`, fallback `{1,"mg"}`. Confirmed. :263-272.
- Combo dose math: `strength = compoundSum(validCompounds)`, `unit="mg"`; combo requires ≥2 valid
  compounds (name non-empty AND strength>0). Confirmed. :276-284; compound-utils.ts:17-20.
- `finalDosage = customDosage ? parseFloat : dosageAmount`; `scheduleDosage = (finalDosage||1)*strength`.
  Single custom input entered in mg, stored as `mg/strength` pill multiplier; combo custom = pills.
  Confirmed. :285-286; dosage-step.tsx:83-102.
- Partial-pill note when `pillsNeeded < 1`; "+ total" appended only for combos. Confirmed.
  dosage-step.tsx:114-115.
- Schedule save filter: drops entries without `time` or with empty `daysOfWeek`; PRN ⇒ `[]`.
  Confirmed. add-medication-wizard.tsx:292-296.
- Generic-name save fallback: `genericName || (isCombo ? formatCompoundNames : brandName)`. Confirmed.
  :315-317.
- buildSchedules writes both `time` (HH:MM), `scheduleTimeUTC` (minutes from UTC midnight via
  `localHHMMStringToUTCMinutes`), and `anchorTimezone`. Confirmed. medication-builders.ts:85-98.
- buildPhase initial: `type:"maintenance"`, `status:"active"`, `startDate=now`. Confirmed. :26-48.
- Reset deferred 300ms after close (resets form, step→"search", conflictCheckState→"idle",
  resetConflicts). Confirmed. add-medication-wizard.tsx:114-122.
- Auth gating via `useAuthGate()` hides search input/result card/AI Suggest; manual entry remains.
  Confirmed. search-step.tsx:30,74,102; indication-step.tsx:23,39.
- AppearanceStep: PillIcon 80px preview, 5 shape buttons, 15 swatches (white `#FFFFFF` gets
  `border-gray-300`), `<input type="color">` custom picker, selected swatch `border-teal-500 scale-110`.
  Confirmed. appearance-step.tsx:20, 26-58.
- IndicationStep: indication+safety hidden for existing Rx (`!isExistingPrescription` guard);
  contraindications sentence-cased (`charAt(0).toUpperCase()+slice(1).toLowerCase()`), warnings not;
  food note only when `foodInstruction !== "none"`. Confirmed. :34, 68, 78, 107.
- Form state interface enumerates 28 fields (selectedPrescriptionId … refillAlertPills) — counted,
  matches. use-add-medication-form.ts:34-67. (Doc says "28 fields"; the count of declared properties
  is 28 incl. searchResult.) Confirmed.

## Low-confidence / could-not-verify

- The doc's "**Single atomic save**" wording is accurate for the new-Rx path
  (`addPrescription` wraps everything in one `db.transaction`), but I did not separately benchmark
  atomicity guarantees — code uses a single Dexie `rw` transaction over all six stores, which is the
  expected atomic unit. prescription-service.ts:81-109.
- "all writes … enqueue sync transactions" (Offline/sync section): confirmed `enqueueInsideTx` calls
  inside each service transaction and a trailing `schedulePush()`, but the actual offline/online
  behavior of the sync engine itself is outside this unit's files and was not exercised.
  prescription-service.ts:82-110.
- Doc line 28 "6-step linear flow": the canonical max is 6, but in practice the inventory step is the
  6th only for a new, scheduled, single-search flow; verified the filter math yields 6/5/4/3 step
  ranges as the doc later states (line 32). Internally consistent.
