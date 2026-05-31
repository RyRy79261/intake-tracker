# Verification — 22-analytics-correlations

**Verdict:** minor-gaps  ·  checked 88 claims, verified 83.

This unit's document is unusually accurate. Nearly every calculation, threshold, enum
member, default, label, color token and edge-case rule was confirmed digit-for-digit
against source. The only real defects are (a) two constants attributed to the wrong file,
and (b) an undocumented unit-label mismatch between the pre-built Alcohol card (" units")
and the custom-dropdown `DOMAIN_UNITS` entry (" drinks"). Everything else holds.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "Fluid-balance constants … `FLUID_TARGET_ML = 500`" listed under the **`analytics-types.ts`** section header ("Default lags (`analytics-types.ts`)" / "Fluid-balance constants"), implying it is exported from `analytics-types.ts`. | `FLUID_TARGET_ML` is **not** in `analytics-types.ts`. It is a private module constant declared locally in `correlations-tab.tsx` (`= 500`), and again separately in `summary-tab.tsx`. There is no shared export; the value is duplicated. | correlations-tab.tsx:149; summary-tab.tsx:50; analytics-types.ts (absent) |
| low | "Alcohol vs Blood Pressure — alcohol (**standard drinks**)" and `DOMAIN_UNITS` table lists `alcohol=" drinks"`. The doc never notes the pre-built card uses a different unit string. | The pre-built Alcohol-vs-BP **card** passes `unitA=" units"` (hard-coded inline), NOT `" drinks"`. So the pre-built card's left Y-axis ticks read "… units" while the custom-comparison dropdown path uses `DOMAIN_UNITS.alcohol = " drinks"`. The doc lists both values in separate places but does not flag the inconsistency. | correlations-tab.tsx:404 (`unitA=" units"`) vs :77 (`alcohol: " drinks"`) |
| low | "Caffeine vs Blood Pressure — caffeine (mg) vs **systolic BP** (mmHg)" with card label implied; doc §card list. | Confirmed accurate, but note the card's `labelB` is the literal string `"Systolic BP"` (not "Blood Pressure"); the doc's prose says "systolic BP" so this is consistent — listed only for completeness, no defect. | correlations-tab.tsx:394 |
| low | "Direction: positive `r` → 'increase together' … negative `r` → 'move in opposite directions'." Implies a clean positive/negative split. | The `interpretCorrelation` split is `coefficient > 0 ? "increase together" : "move in opposite directions"`, so exactly `r === 0` (only reachable as a weak/none floor, never with strength≥weak) maps to the negative phrase. Meanwhile `strengthLabel` uses `coefficient >= 0 ? "positive" : "negative"`, so the two helpers disagree at r=0. Practically unreachable (r=0 ⇒ strength "none" ⇒ different sentence), so cosmetic only. | correlations-tab.tsx:91; correlation-chart.tsx:47 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The "Fluid Balance" empty-state condition is `!data || data.value.daily.length === 0` — i.e. it also guards the `useLiveQuery` default/undefined transient, not just "no daily rows". Doc says only "no daily rows". | correlations-tab.tsx:154 |
| low | `strengthLabel` produces the exact strings `"No correlation"` (strength none) and `"Strong/Moderate/Weak positive|negative"` (capitalized first letter). Doc describes the strength+direction label conceptually but never quotes the literal `"No correlation"` string or the capitalization rule. | correlation-chart.tsx:43-50 |
| low | Fluid-balance `FluidBalanceDay.target` is computed **per-day** as `urinationEstimatedMl + 500` in the service, while the chart's dashed reference line is a **flat** `FLUID_TARGET_ML` (500) line — i.e. the on-target footer stat (`intakeMl >= target`, per-day variable target) and the visual dashed line (constant 500) use different "target" notions. Doc's "Fluid-balance 'on target' rule" mentions the per-day target but does not surface that the visual reference line is a constant 500 unrelated to per-day output. | analytics-service.ts:223,252; correlations-tab.tsx:199 |
| low | `fluidBalance` also computes an `intraday` running-cumulative-balance `DataPoint[]` series (`FluidBalanceResult.intraday`) that the Correlations tab never renders (only `daily` is used). Doc lists `FluidBalanceResult` shape but omits that `intraday` is produced-but-unused here. | analytics-service.ts:235-245; analytics-types.ts:62-68 |
| low | The page's `effectiveRange = customRange ?? scopeRange` is passed to ALL four tabs; the Correlations tab does not own the range selector. Doc's "Context only" framing covers this, but the `useTimeScopeRange` `default` (fall-through) case maps to 7d — an implementation detail not stated (doc says default scope is 7d, which is set in `page.tsx` `useState<TimeScope>("7d")`, separately). | analytics/page.tsx:38; use-analytics-queries.ts:261-262 |
| low | `SubstanceRecord` carries `volumeMl`, `abvPercent`, `description`, `source`, `aiEnriched`, `sourceRecordId` fields beyond the `amountMg`/`amountStandardDrinks` the doc lists. None are used by correlations (only amount fields charted), so omission is benign. | db.ts:304-319 |

## Spot-confirmed

- Domain enum `DOMAINS` order & members (`water,salt,sugar,potassium,weight,bp,eating,urination,defecation,caffeine,alcohol,medication`) — analytics-types.ts:7-20. Matches doc §enum exactly.
- `DOMAIN_OPTIONS` 11 rows, labels, and the two optional gates (`sugar`→"sugar", `potassium`→"potassium"); `medication` excluded — correlations-tab.tsx:52-64. Matches doc table digit-for-digit.
- `DOMAIN_UNITS` map: `water=" ml", salt=" mg", sugar=" g", potassium=" mg", weight=" kg", bp=" mmHg", eating="", urination=" ml", defecation="", caffeine=" mg", alcohol=" drinks", medication=""` — correlations-tab.tsx:66-79. Exact.
- Strength buckets `absR > 0.7 strong, > 0.4 moderate, > 0.2 weak, else none` — analytics-stats.ts:160-167. Exact.
- `CorrelationResult["strength"]` union `"strong"|"moderate"|"weak"|"none"` — analytics-types.ts:132. Exact.
- Interpretation qualifiers strong→"clearly", moderate→"tend to", else (weak)→"slightly" — correlations-tab.tsx:92-93. Exact.
- Coefficient color: `none`/`weak`→`text-muted-foreground`; positive→`text-emerald-600 dark:text-emerald-400`; negative→`text-rose-600 dark:text-rose-400` — correlation-chart.tsx:52-59. Exact.
- `URINATION_ESTIMATE_ML = {small:150, medium:300, large:500}`, fallback `300`, unset→"medium" — analytics-types.ts:166-170; analytics-service.ts:120 (`URINATION_ESTIMATE_ML[r.amountEstimate ?? "medium"] ?? 300`). Exact.
- Default lags all = 2 (`DEFAULT_SALT_WEIGHT_LAG_DAYS`, `_SUGAR_`, `_POTASSIUM_`) — analytics-types.ts:173,176,179. Exact. Caffeine/Alcohol pre-built helpers call `correlate(...)` with no lag arg → undefined → 0 — analytics-service.ts:458,473.
- `MIN_PAIRED_DAYS = 3` (chart) and internal `pairedA.length < 3` guard (stats) — correlation-chart.tsx:30; analytics-stats.ts:146. Exact match for "minimum 3 paired days".
- Zero-variance guard `if (stdA === 0 || stdB === 0)` → returns empty (coefficient 0/strength none) — analytics-stats.ts:151-155. Exact.
- Lag shift: `new Date(dateStr + "T12:00:00")`, `d.getDate() + days`, A shifted forward, matched against unshifted B — analytics-stats.ts:126-142. Exact.
- Empty-state text "Not enough data to compare" (h 250px) when `seriesA.length===0 || seriesB.length===0`; insufficient strip "Not enough overlapping days to correlate (N/3)"; interpretation "Not enough overlapping days in this period to assess a relationship." — correlation-chart.tsx:120-126,184-187; correlations-tab.tsx:87-88. Exact.
- Custom defaults: `domainA="salt"`, `domainB="weight"`, `lagDays=0`, `active=false`; idle query feeds `"water"/"water"` over `{start:0,end:0}` — correlations-tab.tsx:246-257. Exact.
- Lag input `min={0} max={14}`, `onChange` does `Number(e.target.value)` + `setActive(false)`; A/B selects also `setActive(false)` on change; Compare sets `active=true` — correlations-tab.tsx:271-317. Exact.
- Chart series A line `hsl(199 89% 48%)` left axis, B `hsl(346 77% 50%)` right axis, both `type="monotone" strokeWidth={2} dot={{r:3}} connectNulls isAnimationActive={false}` — correlation-chart.tsx:157-178. Exact.
- Fluid bars `hsl(199 89% 48%)`; target line `hsl(160 84% 39%)` dashed `4 4`; zero baseline `ReferenceLine y={0}`; heights 250/200 — correlations-tab.tsx:181-215; correlation-chart.tsx:132. Exact.
- Tooltip style `hsl(var(--card))` bg, `1px solid hsl(var(--border))`, radius 8px, fontSize 12 — correlation-chart.tsx:32-37; correlations-tab.tsx:141-146. Exact.
- Card classes `bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800` — correlations-tab.tsx:117 etc. Exact.
- Footer stats `Avg: {Math.round(avgBalance)} ml/day` and `{daysAboveTarget}/{daysTotal} days on target`; caption "Balance = water intake − estimated urination output. Output is estimated from logged amount categories." — correlations-tab.tsx:218-227. Exact.
- `daysAboveTarget = daily.filter(d => d.intakeMl >= d.target).length` — analytics-service.ts:252. Exact.
- `getRecordsByDomain` per-domain values: water/salt/sugar/potassium→`amount`; weight→`weight`; bp→`systolic`; urination→estimated ml; eating/defecation→`1`; caffeine→`amountMg ?? 0`; alcohol→`amountStandardDrinks ?? 0`; medication→`[]` — analytics-service.ts:74-157. Exact.
- Substance fault-tolerance: `try { db.substanceRecords.where("[type+timestamp]").between(...) } catch { return [] }` — analytics-service.ts:45-53. Exact (compound index `[type+timestamp]` confirmed).
- `TimeScope = "24h"|"7d"|"30d"|"90d"|"all"`, default `7d` on page; range snaps via `startOfDay`/`endOfDay`/`subDays(6/29/89)` — analytics-types.ts:24; analytics/page.tsx:38; use-analytics-queries.ts:240-265. Exact.
- Optional trackers: sugar default **enabled**, potassium default **disabled**; double-gated (card + dropdown filter) — optional-trackers.ts:58-61; correlations-tab.tsx:240-245,368-388. Exact.
- `DEFAULT_CORRELATION` seed (coefficient 0, strength none, empty series) fed as `useLiveQuery` default → instant render, no spinner — use-analytics-queries.ts:88-101,158. Exact.
- `toLocalDateKey` uses local getters (`getFullYear/getMonth/getDate`), not `dayStartHour`; service `groupByDay` uses date-fns `format(...,"yyyy-MM-dd")` (also pure local midnight). Doc's "day boundaries vs day-start-hour" claim holds — date-utils.ts:66-69; analytics-service.ts:57. Exact.
- Data-model interfaces confirmed: `BloodPressureRecord` has systolic/diastolic/heartRate?/position/timestamp (+arm, irregularHeartbeat? — doc omits arm/irregularHeartbeat but only systolic is charted); `UrinationRecord.amountEstimate?`; `EatingRecord`/`DefecationRecord.timestamp`; `IntakeRecord.type/amount/timestamp` — db.ts:7-134,304-319. Confirmed.

## Low-confidence / could-not-verify

- Doc §"Hover/tap a chart point → Recharts tooltip shows the day's series values (styled card tooltip)" — the `<Tooltip contentStyle={TOOLTIP_STYLE} />` is present on both charts (correlation-chart.tsx:156, correlations-tab.tsx:196), so a tooltip renders; the exact rendered content is Recharts default formatting (not custom), which is consistent with "shows the day's series values" but the precise content string was not independently rendered. Low confidence only on exact tooltip text, high confidence the tooltip exists.
- Doc §"BP uses systolic only — diastolic and heart rate are ignored" is correct for the correlation/chart path (`getRecordsByDomain("bp")` → `r.systolic`). Note `BloodPressureRecord` also has `diastolic`, `heartRate?`, `position`, `arm`, `irregularHeartbeat?`; only `systolic` is consumed here — confirmed, no defect.
- `arm: "left" | "right"` and `irregularHeartbeat?` fields of `BloodPressureRecord` are omitted from the doc's data-model list (it lists `position` but not `arm`). Irrelevant to correlations (unused), so not scored as an inaccuracy.
