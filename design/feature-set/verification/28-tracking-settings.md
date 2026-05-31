# Verification — 28-tracking-settings

**Verdict:** minor-gaps · checked 86 claims, verified 82.

Scope: read all 9 listed component files plus every supporting module
(`settings-helpers.ts`, `optional-trackers.ts`, `expandable-settings-section.tsx`,
`numeric-input.tsx`, `security.ts`, `use-settings.ts`, `settings-store.ts`,
`constants.ts`, `app/settings/page.tsx`). Grepped the repo for downstream
consumers of every setting written by these sections.

The document is highly accurate on values, defaults, ranges, presets, enums,
and migration logic — every "actual value from code" claim checks digit-for-digit.
The one substantive problem: the **weight-graph overlay** booleans the section
writes are never read by any chart (orphaned settings), so the doc's
"seed the weight chart" framing describes behavior that does not exist in code.

---

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "Weight Graph Overlays … choosing which reference event lines appear *by default* on the weight chart (still toggleable live on the chart)" (line 49); "Weight-graph defaults only seed the chart's initial overlay state; live chart toggles are independent" (line 176); listed as a downstream consumer of these settings | `weightGraphShowEating/Urination/Defecation/Drinking` are written by the toggles but **read by nothing**. A repo-wide grep finds these keys only in `weight-settings-section.tsx` (the writer) and `settings-store.ts` (definition/default/setter). No weight chart/card consumes them — they are orphaned/write-only. There is no "weight chart" component at all that references them. | settings-store.ts:87-90,210-213,400-403; weight-settings-section.tsx:101-124; (no consumer exists) |
| low | "Bathroom defaults … (labels Small/Medium/Large; see `URINATION_AMOUNT_OPTIONS` / `DEFECATION_AMOUNT_OPTIONS`)" (line 138) implies the section sources its options from those constants | `urination-defecation-defaults.tsx` does **not** import those constants; it hardcodes `<SelectItem value="small">Small</SelectItem>` … The constants exist with matching values but are consumed by the urination/defecation cards, not this settings component. Values/labels are nonetheless correct. | urination-defecation-defaults.tsx:36-40,57-61; constants.ts:80-92 |
| low | Preset summary "joins present substances with " + " — `{caffeine}mg caff/100ml`, `{abv}std alc/100ml`, `{salt}mg salt/100ml`" (line 148) | Accurate template, but note the alcohol string is literally `${alcoholPer100ml}std alc/100ml` (e.g. renders `5std alc/100ml`) even though the stored value is an ABV percentage, not a "std drink" count — a slight semantic mismatch in the code itself, faithfully reproduced by the doc. Flagging only so it isn't mistaken for a doc error. | liquid-presets-section.tsx:19-34 |
| low | Optional-trackers in-UI helper text "Disabling hides the tracker from forms, voice input, progress bars, weekly grid, analytics KPIs/correlations, AI insight snapshot, reports, and history filters" (line 38) | The fuller list matches the `optional-trackers.ts` JSDoc and actual gating usage, but the **visible component text** is shorter: "hidden from forms, voice input, progress bars, reports and the AI summary" (no explicit "weekly grid / analytics / history filter" in the rendered copy). Doc conflates module-doc behavior with on-screen copy. | optional-trackers-section.tsx:24-28; optional-trackers.ts:6-11 |

---

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The `LiquidPreset` interface includes an `aiConfidence?: number` field and `source: "manual" \| "ai"`; the doc mentions `source` and `aiConfidence?` in the interface list (line 162) but never notes that the **edit/add form only ever sets `source: "manual"`** and never sets/exposes `aiConfidence` (AI-sourced presets come from elsewhere, not this CRUD UI). | liquid-presets-section.tsx:75-76; constants.ts:121-122 |
| low | `addLiquidPreset` **returns the new id** (`string`); minor — doc says "appends a new preset (UUID id)" which is accurate, but omits that the action returns the id. | settings-store.ts:155,437-446 |
| low | The OptionalTrackers Switch has an `aria-label` of `"{label} tracking enabled/disabled"` and each row a `data-testid="optional-tracker-row-{key}"`; not mentioned (accessibility/testing detail). | optional-trackers-section.tsx:37,60 |
| low | `GraphToggle` active row tint is **light-mode-only described** in the doc's color list; code also defines explicit dark-mode tints (e.g. `dark:bg-orange-900/50 dark:border-orange-700`). Doc's "Eating orange / Urination violet / Defecation stone / Drinking sky" is correct for the hue family. | weight-settings-section.tsx:103,110,117,124 |
| low | `validateAndSave` uses `parseFloat` (not `parseInt`); doc never claims otherwise for numeric inputs, but it's worth noting decimals are parsed at the UI layer and only rounded later by `sanitizeNumericInput` at the store. The doc's example "typing 1250.7 … stores 1251" (line 171) is correct given this two-stage flow. | settings-helpers.ts:14; security.ts:56-65 |

---

## Spot-confirmed

- Section order in the Tracking accordion group: Day → Water → Sodium → Optional Trackers → `{sugarEnabled && Sugar}` → `{potassiumEnabled && Potassium}` → Weight → Liquid Presets → Bathroom Defaults — exact. settings/page.tsx:94-104.
- Section icons/colors: Day=Clock indigo, Water=Droplets sky, Sodium=Sparkles amber, Optional=ToggleLeft indigo, Sugar=Candy pink, Potassium=Banana purple, Weight=Scale emerald, Liquid Presets=Droplets blue, Bathroom=Droplets rose — all exact. (day:23, water:27, salt:27, optional:22, sugar:25, potassium:23, weight:68, presets:198, bathroom:22).
- Numeric ranges/steps all exact: Water inc 10/1000/10, limit 100/10000/100, buffer 0/10000/100 (water-settings-section.tsx:36-75). Sodium identical (salt-settings-section.tsx:36-75). Sugar limit 5/500/5, buffer 0/500/5 (sugar:34-56). Potassium 100/20000/100 (potassium:32-37). Weight 0.05/1/0.05 (weight:77-82).
- Decrement floors exact: water inc floor 10, limit floor 100, buffer floor 0; sugar/salt analogous; weight floor 0.05. Verified each `decrementSetting(..., step, FLOOR, ...)` call.
- Defaults digit-for-digit: dayStartHour **2**, waterIncrement **250**, saltIncrement **250**, waterLimit **1000**, saltLimit **1500**, sugarLimit **30**, waterExtendedBuffer **500**, saltExtendedBuffer **500**, sugarExtendedBuffer **10**, potassiumLimit **3500**, weightIncrement **0.05**, optionalTrackers {sugar:true, potassium:false}, urinationDefaultAmount "small", defecationDefaultAmount "medium", timeFormat "24h". settings-store.ts:182-247, optional-trackers.ts:58-61.
- Store clamps exact: dayStartHour 0-23, potassium 100-20000, weight `sanitizeNumericInput(value,0.05,1,2)` (precision 2 — the only setting keeping decimals). settings-store.ts:382,363,422.
- `sanitizeNumericInput`: returns `min` on NaN/Infinity, clamps, rounds to integer when no precision, rounds to `precision` decimals otherwise. security.ts:56-65. Confirms doc lines 108, 171.
- `formatHour`: 0→"12:00 AM (midnight)", 12→"12:00 PM (noon)", <12→"H:00 AM", else "H-12:00 PM". settings-helpers.ts:51-56. 24 options generated `Array.from({length:24})`. day-settings-section.tsx:35-39.
- DEFAULT_LIQUID_PRESETS exact (all isDefault:true, source:"manual"): Espresso 210/98%/30ml, Double Espresso 210/98%/60ml, Moka 130/98%/50ml, Coffee 38/99%/250ml, Tea 19/99%/250ml, Beer 5ABV/93%/330ml, Wine 12ABV/87%/150ml, Spirit 40ABV/60%/45ml. constants.ts:125-136.
- New-preset form defaults: name "", tab "coffee", defaultVolumeMl 250, caffeine 0, alcohol 0 (step 0.5), salt 0, waterContentPercent 100 (min 0 max 100), isDefault false, source "manual"; substance fields spread only when `> 0`. liquid-presets-section.tsx:47-78, 109-165.
- Preset CRUD: Save disabled while `!name.trim()`; name trimmed on save; delete only on non-default (no trash icon when `isDefault`); inline confirm "Delete {name}?" with "Keep Preset"/"Delete Preset"; new ids via `crypto.randomUUID()`. liquid-presets-section.tsx:174,66,276-285,208-227,438.
- ExpandableSettingsSection: default `defaultOpen=false` (default-collapsed), chevron `rotate-180` when open, accordion-up/down animation, content `pl-6` left indent, optional `headerRight`. expandable-settings-section.tsx:22,42,50-51,48.
- GraphToggle: whole row is the `<button>` with `aria-pressed={checked}`, pill `translate-x-4` (on) vs `translate-x-0.5` (off), track `bg-primary` vs `bg-muted`. weight-settings-section.tsx:28,47-49,42.
- SETTINGS_PERSIST_VERSION = 16; localStorage key "intake-tracker-settings". settings-store.ts:255,461.
- Migration seeds exact: v<13 sugarLimit 30, v<14 potassiumLimit 3500, v<15 optionalTrackers {sugar:true,potassium:false}, v<16 the three extended buffers (500/500/10). settings-store.ts:319-337. Matches doc line 177.
- substanceConfig defaults: caffeine Coffee 95mg/250ml, Espresso 63mg/30ml, Tea 47mg/250ml, Other 80mg/250ml; alcohol Beer 1/330ml, Wine 1/150ml, Spirits 1/45ml, Other 1/250ml. settings-store.ts:230-244. Matches doc line 150.
- Optional-tracker gating breadth confirmed: `useOptionalTrackerEnabled`/`getOptionalTrackerEnabled` consumed in liquids-card, food-salt-card, text-metrics, voice-panel, parsed-item-row, food-section, analytics summary/correlations/records, ai-insights-card, settings page. Matches doc's claim that disabling hides nutritional surfaces app-wide.
- `setOptionalTracker` merges `{...state.optionalTrackers, [key]: enabled}`; conditional sugar/potassium sections mount/unmount via `{sugarEnabled && ...}`. settings-store.ts:364-367; settings/page.tsx:99-100.
- Downstream consumers confirmed present: extended-buffer logic in food-salt-card.tsx, text-metrics.tsx, liquids/{water-tab,beverage-tab,preset-tab}.tsx, progress-utils.ts; weightIncrement in weight-card.tsx; urination/defecation defaults in urination-card.tsx / defecation-card.tsx; dayStartHour in date-utils.ts / intake-service.ts / use-intake-queries.ts.

---

## Low-confidence / could-not-verify

- **Day-start-hour budget-rollover semantics** (doc line 173: "records logged after it count toward the new 'today'"): `dayStartHour` is consumed by `date-utils.ts` / `intake-service.ts` / `use-intake-queries.ts`, consistent with the claim, but I did not trace the full day-bucketing math end-to-end — it is plausibly correct and out of this unit's direct scope.
- **"second-tone progress-bar segment" visual** (doc lines 31, 172): `progress-utils.ts` and the cards reference the extended-buffer values, consistent with a two-stage bar, but the precise rendering ("turns red beyond limit+buffer") was not pixel-verified; logic presence confirmed, exact color staging not traced.
- The doc's framing that disabling a tracker "stops persistence of new values even if AI returns a value" (lines 38, 174) is asserted by the `optional-trackers.ts` module JSDoc; I confirmed the gating hooks are wired into voice/parse surfaces but did not execute the persistence path to prove the AI-value drop.
