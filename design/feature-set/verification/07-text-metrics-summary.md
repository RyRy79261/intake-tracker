# Verification — 07-text-metrics-summary

**Verdict:** accurate · checked 78 claims, verified 74.

The document is a high-fidelity, near-exhaustive description of the `TextMetrics`
widget. Every structural feature, metric, enum, default, threshold, color token,
gradient, and edge-case rule was checked digit-for-digit against source. Only a
handful of minor wording/precision nits were found; no medium- or high-severity
inaccuracies, no material omissions.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Self-refreshes every 60 seconds via `useNowTick(60_000)`" (line 29), and "shared 60s interval" with explicit `60_000` arg in the hooks list (line 220) | The component calls `useNowTick()` with **no argument**. The 60_000 ms is the hook's default param, not an explicit call arg. Functionally 60s, but the literal `useNowTick(60_000)` call does not appear in `text-metrics.tsx`. | `text-metrics.tsx:86` (`const tick = useNowTick();`); default in `use-now-tick.ts:35` |
| low | Caffeine Today value is "`<total> mg` (integer mg)" (lines 53, 123) | The Today caffeine value is rendered raw: `{caffeineTotal} mg` where `caffeineTotal = reduce(sum + amountMg)`. It is **not** `Math.round`-ed (only the *weekly* caffeine cell rounds). It is integer only insofar as the underlying `amountMg` values happen to be integers; the widget applies no rounding/`toLocaleString` to it (so e.g. 1234.5 mg or no thousands separator would show verbatim). | `text-metrics.tsx:411` (`{caffeineTotal} mg`), reduce at `:115-118` |
| low | Today section described as "each is one flex line (`icon · label(w-16) · bar/spacer(flex-1) · value block`)" implying a uniform 4-part layout (line 33) | Potassium row deviates: it has the value split into **two sibling spans** (`{total}` then `/ {limit} mg`) directly in the flex row rather than a stacked `flex-col` value block like water/salt/sugar. Cosmetic; the doc's per-metric breakdown below (lines 47-49) does describe potassium correctly. | `text-metrics.tsx:381-391` vs `:229-258` |
| low | "each budgeted bar has an `aria-label`" — phrasing implies only budgeted (water/salt/sugar) bars (line 90) | Potassium's bar (described elsewhere as a *soft target*, non-budgeted) **also** carries `aria-label="Potassium intake progress"`. Covered by the "e.g." but the "budgeted" qualifier is loose. | `text-metrics.tsx:379` |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | Weekly grid cell color precedence: a value over target but in extended zone sets BOTH `!isOverTarget` (false→skips theme color) and `isInExtendedZone` (orange). The `cn()` also stacks `font-semibold` (today) on top of color and `text-muted-foreground/50` (no-data/future) — the no-data faded class can co-apply with `isToday` bold. Doc describes states individually but not that today-bold + color/fade classes are composed via `cn` (multiple may co-apply). Behavior is correct as described per-state; composition just unstated. | `text-metrics.tsx:474-484` |
| low | `data-testid` hooks exist on optional rows: `metrics-sugar-row` (sugar Today row) and `metrics-potassium-row` (potassium Today row). Not mentioned in the doc. | `text-metrics.tsx:315, 369` |
| low | Substance weekly query uses the compound `[type+timestamp]` index (inclusive both ends) when a type is given, vs a plain `timestamp.between` when not. Doc summarizes the date-range query generically but omits this index/inclusive-bounds detail. (Date-range bounds are inclusive: `between(..., true, true)`.) | `substance-service.ts:105-115` |
| low | `useNowTick` clamps non-finite/≤0 intervals to 60_000 (`safeIntervalMs` guard). Defensive detail not surfaced (the widget always uses the default anyway). | `use-now-tick.ts:36-37` |
| low | `getOptionalTrackerEnabled` (non-reactive snapshot variant) exists alongside the reactive `useOptionalTrackerEnabled` in the same module. Doc only lists the reactive hook (correct, since the widget uses only the reactive one). | `optional-trackers.ts:73-75` |

## Spot-confirmed

- Container `rounded-lg bg-muted/50 border p-4`; `<section aria-label="Daily intake summary">`. — `text-metrics.tsx:202-203`
- Six Today rows in order water, Sodium, Sugar (gated `sugarEnabled`), Potassium (gated `potassiumEnabled`), Caffeine, Alcohol. — `text-metrics.tsx:210-433`
- Icons: water Droplets, sodium Sparkles, sugar Candy, potassium Banana, caffeine Coffee, alcohol Wine; all `aria-hidden="true"`, `w-4 h-4`, themed `iconColor`. — `text-metrics.tsx:211,263,316,370,397,417`
- Label `w-16`; sodium label literally "Sodium" for key `salt`. — `text-metrics.tsx:215,267`
- Two-stage bar props: `value` = `isOverExtended ? 100 : primaryPct`; `extendedValue` = `isOverExtended ? 0 : extendedPct`; `targetMarkerPct` = `isOverExtended ? 0 : targetPct`; over-extended indicator `bg-red-500`. — `text-metrics.tsx:217-226`
- Top value `formatValue(Math.min(total, limit))` with `/ {limit} {unit}`; over-extended text `text-red-600 dark:text-red-400`. — `text-metrics.tsx:239-243, 234-236`
- "extra" second line gated on `isOverTarget && extendedTotal > 0`; shows `extendedCurrent / extendedTotal {unit} extra`; muted while in-zone, red when over-extended. — `text-metrics.tsx:245-257`
- Potassium: `potassiumPct = limit>0 ? min(100, total/limit*100) : 0`; single-stage bar; value `formatValue(potassiumTotal)` (raw, not clamped) + `/ {potassiumLimit} mg`. — `text-metrics.tsx:196-199, 387-391`
- Caffeine `{caffeineTotal} mg`, Alcohol `{alcoholTotal.toFixed(1)} std drinks`; both muted (`text-muted-foreground`) when total === 0, else theme color; both use a `flex-1` spacer span instead of a bar. — `text-metrics.tsx:402-431`
- Weekly header `This Week (Mon-Sun)`; `grid-cols-[auto_repeat(7,1fr)]`; empty corner cell + `DAY_HEADERS = ["M","T","W","T","F","S","S"]`; today's header `font-semibold`. — `text-metrics.tsx:437-453, 59`
- Weekly row labels: `Water`, `Na`, `Sug`, `K`, `Caf`, `Alc`; sug/K gated by `sugarEnabled`/`potassiumEnabled` via `.filter(row => row.show)`. — `text-metrics.tsx:455-462`
- Weekly formatting: water/Na/Sug/K → `formatValue` (`value.toLocaleString()`); Caf → `formatValue(Math.round(v))`; Alc → `v.toFixed(1)`. — `text-metrics.tsx:456-461, 55-57`
- Future cells (`i > todayIndex`) render literal `"---"` in `text-muted-foreground/50`, never computed/colored; today's column cells `font-semibold`. — `text-metrics.tsx:466, 478-486`
- K/Caf/Alc weekly rows pass `limit: 0, buffer: 0` → `isOverTarget`/`isOverExtended` always false → never colorize by budget. — `text-metrics.tsx:459-461, 468-470`
- Cell budget colors: under-target → `row.theme.latestValueColor`; in-extended → `text-orange-600 dark:text-orange-400`; over-extended → `text-red-600 dark:text-red-400`; no-data → `text-muted-foreground/50`. — `text-metrics.tsx:480-483`
- `bucketByDay`: `ONE_DAY_MS = 24*60*60*1000` (86_400_000); index `floor((timestamp - weekStart)/ONE_DAY_MS)`; only `i>=0 && i<7` accepted (out-of-range dropped). — `text-metrics.tsx:60-71`
- `weekEnd = weekStart + 7 * ONE_DAY_MS`. — `text-metrics.tsx:130`
- `computeTwoStageProgress`: `target<=0` short-circuits all-zero (extendedTotal = buffer, maxAmount 0); `buffer = Math.max(0, extendedBuffer)`; `isTwoStage = isOverTarget && buffer>0`; two-stage `maxAmount = target+buffer`, `primaryPct = target/maxAmount*100`, extended = `min(extendedCurrent,buffer)/maxAmount*100`, `targetPct=primaryPct`; single-stage `primaryPct = min(safeCurrent/target*100,100)`, no marker; `isOverExtended = buffer>0 ? total>target+buffer : total>target`; `extendedCurrent = max(0, current-target)`. — `progress-utils.ts:34-97`
- `Progress`: clamps `primary` into `[0,100]`; `extended = min(100-primary, extendedValue)`; marker only when `0 < targetMarkerPct < 100`; marker class `bg-foreground/40 dark:bg-foreground/50`; two-stage = two absolute divs; single-stage = Radix Indicator `translateX`; `transition-all duration-300 ease-out`. — `progress.tsx:35-90`
- Settings defaults — waterLimit 1000, saltLimit 1500, sugarLimit 30, potassiumLimit 3500, waterExtendedBuffer 500, saltExtendedBuffer 500, sugarExtendedBuffer 10, dayStartHour 2, optionalTrackers `{sugar:true, potassium:false}`. — `settings-store.ts:185-199`
- Settings clamps — waterLimit/saltLimit 100–10000, sugarLimit 5–500, water/saltExtendedBuffer 0–10000, sugarExtendedBuffer 0–500, potassiumLimit 100–20000, dayStartHour 0–23. — `settings-store.ts:350-382`
- `IntakeRecord.type` = `"water"|"salt"|"sugar"|"potassium"`; `amount` units; `deletedAt` (null=active). `SubstanceRecord.type` = `"caffeine"|"alcohol"`; `amountMg`/`amountStandardDrinks`. — `db.ts:7-22, 304-318`
- `getDailyTotal`: `aboveOrEqual(getDayStartTimestamp)`, filter `type === t && deletedAt === null`, sum `amount`. `getRecordsByDateRange`: `timestamp.between(start,end)` then filter `deletedAt===null` + optional type. — `intake-service.ts:103-111, 179-193`
- `getDayStartTimestamp`: day begins at `dayStartHour`; if `now < dayStart` use previous day. — `date-utils.ts:48-58`
- `getWeekStartTimestamp` / `getTodayDayIndex`: boundary-adjusted (`now.getHours() < dayStartHour` → back one day); Monday from `daysSinceMonday = dow===0 ? 6 : dow-1`; Sun → index 6. — `text-metrics.tsx:22-53`
- `CARD_THEMES` keys: water, salt, sugar, potassium, weight, bp, eating, urination, defecation, caffeine, alcohol. — `card-themes.ts:38-269`
- All gradients verified digit-for-digit (water from-sky-400 to-cyan-500 / ext from-blue-500 to-indigo-600; salt from-amber-400 to-orange-500 / ext from-orange-600 to-amber-700; sugar from-pink-400 to-rose-500 / ext from-rose-600 to-fuchsia-700; potassium from-purple-400 to-indigo-500; caffeine from-yellow-400 to-amber-500; alcohol from-fuchsia-400 to-pink-500). — `card-themes.ts:49-50,70-71,91-92,112,237,258`
- `latestValueColor` tokens verified: water `text-sky-700 dark:text-sky-300`, sodium amber-700/300, sugar pink-700/300, potassium purple-700/300, caffeine yellow-700/300, alcohol fuchsia-700/300. — `card-themes.ts:56,77,98,118,244,265`
- `OPTIONAL_TRACKER_DEFAULTS = { sugar:true, potassium:false }`; `useOptionalTrackerEnabled` reactive selector. — `optional-trackers.ts:58-69`
- Consumers: `page.tsx` mounts `<TextMetrics/>` inside `mb-6` wrapper on dashboard; `preview-registry.tsx` registers it with `seedTextMetricsPreview`; `seedTextMetricsPreview` seeds water 500/300, salt 600, caffeine 95mg, etc. — `page.tsx:37`, `preview-registry.tsx:33-34`, `preview-data.ts:187-226`
- Test `text-metrics.dom.test.tsx` asserts region `daily intake summary`, "Today", "This Week (Mon-Sun)", and seeded water "500". — `text-metrics.dom.test.tsx:13-31`

## Low-confidence / could-not-verify

- "integer mg" for the *Today* caffeine line (flagged low above): correctness depends on whether `amountMg` is always an integer in practice. The widget itself applies no rounding to the Today caffeine value, so a non-integer `amountMg` would surface verbatim. The doc's weekly-caffeine `Math.round` claim is correct and verified; only the Today parenthetical is loose.
- Doc line 100 says the extended-zone "extra" line shows `extendedCurrent / buffer <unit> extra` (using "buffer") while line 101/254 uses `extendedTotal`. These are the same value (`extendedTotal` === the configured `buffer` per `progress-utils.ts:26,94`), so not an inaccuracy — just two names for one quantity.
