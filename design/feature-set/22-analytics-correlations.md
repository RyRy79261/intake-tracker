# 22 — Analytics: Correlations

**Files covered:**
- `src/components/analytics/correlations-tab.tsx` (tab body: pre-configured cards, fluid-balance card, custom comparison)
- `src/components/analytics/correlation-chart.tsx` (dual-axis time-series overlay + coefficient readout)
- `src/lib/analytics-types.ts` (Domain enum, CorrelationResult / FluidBalance types, constants)
- `src/lib/analytics-stats.ts` (`correlateTimeSeries` — day-alignment, lag, Pearson, strength bucketing)
- `src/lib/analytics-service.ts` (`correlate`, `getRecordsByDomain`, `fluidBalance`, pre-built `*VsWeight`/`*VsBP`)
- `src/hooks/use-analytics-queries.ts` (reactive `useCorrelation`, `useSaltVsWeight`, … + `useTimeScopeRange`)
- `src/lib/optional-trackers.ts` (sugar / potassium gating)
- Context only: `src/app/analytics/page.tsx` (tab host + `TimeRange`), `src/components/analytics/time-range-selector.tsx` (range presets), `src/lib/date-utils.ts` (`toLocalDateKey`)

**Purpose:** The Correlations tab of the Analytics page lets a single user explore how two health metrics relate over a chosen time window. It renders a fixed set of pre-built correlation cards (each a dual-axis daily time-series overlay with a Pearson coefficient), a fluid-balance bar chart, and a free-form "Custom Comparison" tool for pairing any two tracked domains with an optional day lag.

---

## Features

### Pre-configured correlation cards (always-on set)
- **Weight vs Salt Intake** — salt (mg) overlaid against weight (kg); default lag **2 days** (`DEFAULT_SALT_WEIGHT_LAG_DAYS`).
- **Weight vs Sugar Intake** — sugar (g) vs weight (kg); default lag **2 days**; only rendered when the **sugar** optional tracker is enabled.
- **Weight vs Potassium Intake** — potassium (mg) vs weight (kg); default lag **2 days**; only rendered when the **potassium** optional tracker is enabled (default off).
- **Caffeine vs Blood Pressure** — caffeine (mg) vs systolic BP (mmHg); **no lag**. (Card `labelB` is the literal string `"Systolic BP"`, as is the Alcohol card's.)
- **Alcohol vs Blood Pressure** — alcohol vs systolic BP (mmHg); **no lag**. Note the pre-built card hard-codes `unitA=" units"` inline, so its left Y-axis ticks read "… units" — this differs from the custom-comparison dropdown path, which uses `DOMAIN_UNITS.alcohol = " drinks"`. The two surfaces are inconsistent.
- Each card shows: title, a `CorrelationChart` (dual Y-axis daily-mean overlay), a coefficient/strength/paired-day readout strip, and a one-line plain-language interpretation sentence.

### Fluid Balance card
- Bar chart of **daily fluid balance** = water intake (ml) − estimated urination output (ml) per calendar day.
- Horizontal **dashed target reference line** at a flat +500 ml (`FLUID_TARGET_ML`, a private local constant in `correlations-tab.tsx`) plus a zero baseline reference line. Note this dashed line is a **constant 500** unrelated to the per-day variable `target` (estimated output + 500) used by the on-target footer stat.
- Footer stats: **Avg X ml/day** (mean of daily balances, rounded) and **N/M days on target**.
- Explanatory caption: "Balance = water intake − estimated urination output. Output is estimated from logged amount categories."
- Urination output is *estimated*, not measured: derived from each urination record's `amountEstimate` category mapped via `URINATION_ESTIMATE_ML` (small=150, medium=300, large=500; default 300 ml when unset).

### Custom Comparison tool
- Two domain dropdowns (A "vs" B) + numeric **Lag (days)** input + a **Compare** button.
- Lazily runs the correlation only after **Compare** is pressed (idle query uses a no-op empty range / `water` vs `water` placeholder until activated).
- On compare, renders the same `CorrelationChart` + interpretation sentence as the pre-built cards, using labels and units derived from the selected domains.
- Any selection change (domain A, domain B, or lag) **resets** the active state, so the chart hides until Compare is pressed again.

### Correlation chart (shared `CorrelationChart`)
- Dual-axis `ComposedChart` (Recharts): series A on the **left** axis (blue line `hsl(199 89% 48%)`), series B on the **right** axis (red/rose line `hsl(346 77% 50%)`); both `type="monotone"`, `strokeWidth=2`, `dot r=3`, `connectNulls`, animation off.
- Aggregates each series to **one value per calendar day (daily mean)** before plotting, merging on the local day key (`toLocalDateKey`) so a multi-event day shows once — consistent with the day-aligned coefficient.
- X axis labels are short dates (e.g. "Jan 5"); Y axes tick-format with each domain's unit suffix.
- Below the chart, a stat strip shows `r = X.XX`, a strength+direction label, `· N days`, and (when lag > 0) a `with N-day lag` note.
- The `strengthLabel` helper emits the literal string `"No correlation"` for strength "none", or otherwise a capitalized-first-letter `"Strong|Moderate|Weak positive|negative"` (direction from `coefficient >= 0`).

### Computation pipeline
- **Day alignment:** both series grouped by local calendar day, averaged per day (`mean`).
- **Lag:** series A's day keys are shifted forward by `lagDays` before matching against series B's days (B is the "later" effect; e.g. salt today vs weight +2 days).
- **Pearson coefficient** via `simple-statistics` `sampleCorrelation` over the paired daily means.
- **Strength bucketing** from `|r|`: strong >0.7, moderate >0.4, weak >0.2, else none.
- **Zero-variance guard:** if either paired series has zero sample standard deviation (constant), result is downgraded to coefficient 0 / strength "none".
- **Minimum paired days = 3** to report a coefficient; below that the chart shows an insufficiency notice and the card shows a "not enough overlapping days" interpretation.

---

## User actions & interactions

| Action | Location | Result |
|---|---|---|
| Switch time-range preset (24h / 7d / 30d / 90d / All) | `TimeRangeSelector` (page header, shared) | Re-runs every reactive correlation query for the new `TimeRange`; all cards update live. |
| Enter a Custom date range | `TimeRangeSelector` → "Custom" + two date inputs | Same; `effectiveRange = customRange ?? scopeRange`. |
| Tap **Domain A** select | Custom Comparison | Opens shadcn Select listing visible domains; choosing a value sets `domainA` and **resets** `active=false` (hides chart). |
| Tap **Domain B** select | Custom Comparison | Same as A, sets `domainB`, resets active. |
| Type/step the **Lag (days)** number input | Custom Comparison | Sets `lagDays` (min 0, max 14), resets active. |
| Tap **Compare** button | Custom Comparison | Sets `active=true`; the lazy `useCorrelation` query runs for the selected pair/range/lag; chart + interpretation appear. |
| Toggle a sugar/potassium tracker in Settings | (external) | Adds/removes the matching pre-built card AND the matching select option from both Custom dropdowns. |
| Hover/tap a chart point | Any `CorrelationChart` / Fluid Balance bar | Recharts tooltip shows the day's series values (styled card tooltip). |

- There is **no edit / delete / undo / confirm / cancel** here — this is a read-only analytics surface. The only mutating affordances live elsewhere (record entry); changes there flow in reactively via Dexie `useLiveQuery`.

---

## States & presentations

### Per correlation card / `CorrelationChart`
- **Loading / instant default:** queries seed a `DEFAULT_CORRELATION` (coefficient 0, strength "none", empty series) so the card renders immediately with no spinner; real data swaps in reactively. (No skeleton component.)
- **Empty (no data either side):** if `seriesA.length === 0 || seriesB.length === 0`, the chart area shows centered text **"Not enough data to compare"** (height 250px); the card's interpretation reads **"Not enough overlapping days in this period to assess a relationship."**
- **Insufficient overlap (1–2 paired days):** chart renders the lines, but the stat strip shows **"Not enough overlapping days to correlate (N/3)"**; interpretation sentence reads the same "not enough overlapping days" message.
- **No meaningful relationship:** strength "none" → interpretation **"No meaningful relationship detected in this period."**; coefficient text is muted (no color).
- **Weak:** coefficient text muted (gray); interpretation qualifier "slightly".
- **Moderate:** coefficient colored — emerald (positive) / rose (negative); qualifier "tend to".
- **Strong:** coefficient colored emerald/rose; qualifier "clearly".
- **Lag present:** stat strip appends `with N-day lag`; interpretation otherwise unchanged.
- **Direction:** positive `r` → "increase together" (emerald); negative `r` → "move in opposite directions" (rose). The two helpers split at slightly different points: `interpretCorrelation` uses `coefficient > 0` (so an exact `r === 0` would map to "move in opposite directions"), while `strengthLabel` uses `coefficient >= 0` (so `r === 0` reads "positive"). This disagreement is practically unreachable — `r === 0` only occurs at strength "none", which produces a different sentence ("No meaningful relationship…") and the literal label `"No correlation"` — so it is cosmetic only.

### Fluid Balance card
- **Empty:** the condition is `!data || data.value.daily.length === 0` — so this state also covers the transient `useLiveQuery` default/undefined (before data resolves), not only the "no daily rows" case. Shows centered **"No fluid data for this period"** (height 200px), no footer stats.
- **Populated:** bar chart with per-day balance bars (blue), target dashed line at +500ml, zero baseline, footer avg + days-on-target stats, and caption.

### Custom Comparison
- **Idle (before Compare):** only the selects, lag input, and Compare button render; no chart, no interpretation.
- **Active (after Compare):** chart + interpretation block appear below the controls.
- **Active but selection changed:** chart disappears (active reset) until Compare pressed again.

### Optional-tracker gating
- **Sugar disabled:** "Weight vs Sugar Intake" card omitted; "Sugar Intake" removed from both custom dropdowns.
- **Potassium disabled (default):** "Weight vs Potassium Intake" card omitted; "Potassium Intake" removed from both dropdowns.

### Offline / sync
- All data is local-first (Dexie/IndexedDB) via `useLiveQuery`; the tab functions fully **offline** with no offline-specific banner. No syncing/disabled/error states are surfaced in this component (a `try/catch` around the substance-records query silently returns `[]` if the table is missing in older schema versions).

---

## Enums, options & configurable values

### Domain enum (`DOMAINS`, `Domain`)
`water`, `salt`, `sugar`, `potassium`, `weight`, `bp`, `eating`, `urination`, `defecation`, `caffeine`, `alcohol`, `medication`.

### Custom-comparison dropdown options (`DOMAIN_OPTIONS`)
| value | label | optional gate |
|---|---|---|
| water | Water Intake | — |
| salt | Salt Intake | — |
| sugar | Sugar Intake | sugar |
| potassium | Potassium Intake | potassium |
| weight | Weight | — |
| bp | Blood Pressure | — |
| eating | Eating | — |
| urination | Urination | — |
| defecation | Defecation | — |
| caffeine | Caffeine | — |
| alcohol | Alcohol | — |

- **`medication` is intentionally excluded** from the dropdown (no single numeric series; `getRecordsByDomain("medication")` returns `[]`).
- Custom defaults: **domainA = `salt`**, **domainB = `weight`**, **lagDays = 0**, **active = false**.

### Per-domain display units (`DOMAIN_UNITS`)
`water=" ml"`, `salt=" mg"`, `sugar=" g"`, `potassium=" mg"`, `weight=" kg"`, `bp=" mmHg"`, `eating=""`, `urination=" ml"`, `defecation=""`, `caffeine=" mg"`, `alcohol=" drinks"`, `medication=""`.
- These units drive the **custom-comparison** dropdown path. The pre-built Alcohol-vs-BP card overrides this with a hard-coded inline `unitA=" units"` (not `" drinks"`), so the pre-built card's axis label differs from the custom path's.

### Per-domain plotted value (what the line actually charts)
- water → `amount` (ml), salt → `amount` (mg), sugar → `amount` (g), potassium → `amount` (mg)
- weight → `weight` (kg), bp → `systolic` only (mmHg)
- urination → `URINATION_ESTIMATE_ML[amountEstimate]` (estimated ml)
- eating → constant `1` per event, defecation → constant `1` per event
- caffeine → `amountMg`, alcohol → `amountStandardDrinks`

### Strength buckets (from `|r|`, `analytics-stats.ts`)
- `strong` if `|r| > 0.7`
- `moderate` if `|r| > 0.4`
- `weak` if `|r| > 0.2`
- `none` otherwise

### Strength values type (`CorrelationResult["strength"]`)
`"strong" | "moderate" | "weak" | "none"`.

### Interpretation qualifiers (card sentence)
strong → "clearly", moderate → "tend to", weak → "slightly".

### Coefficient color rules
- `none` or `weak` → `text-muted-foreground` (no color)
- positive (`coefficient > 0`) → emerald (`text-emerald-600 dark:text-emerald-400`)
- negative → rose (`text-rose-600 dark:text-rose-400`)

### Time-scope presets (`TimeScope`, shared selector)
`"24h" | "7d" | "30d" | "90d" | "all"` — default scope on the page is **`7d`** (set in `analytics/page.tsx` via `useState<TimeScope>("7d")`). The `useTimeScopeRange` switch also has a `default` (fall-through) case that maps to 7d. Custom range supported via two date inputs. Ranges snap to calendar-day boundaries (`startOfDay`/`endOfDay`) so daily grouping has no partial edge days. The page computes `effectiveRange = customRange ?? scopeRange` and passes it to **all four** analytics tabs; the Correlations tab does not own the range selector.

### Default lags (`analytics-types.ts`)
- `DEFAULT_SALT_WEIGHT_LAG_DAYS = 2`
- `DEFAULT_SUGAR_WEIGHT_LAG_DAYS = 2`
- `DEFAULT_POTASSIUM_WEIGHT_LAG_DAYS = 2`
- Caffeine-vs-BP and Alcohol-vs-BP use **lag 0**.

### Lag input bounds (Custom Comparison)
`min=0`, `max=14`, default `0`.

### Fluid-balance constants
- `FLUID_TARGET_ML = 500` — **not** exported from `analytics-types.ts`; it is a private module constant declared locally in `correlations-tab.tsx` (`= 500`) and duplicated separately in `summary-tab.tsx`. Drives only the flat dashed UI reference line.
- The per-day `FluidBalanceDay.target` (= estimated output + 500 ml/day) is a *separate* value computed in the service (`analytics-service.ts`) and used only by the on-target footer stat.
- `URINATION_ESTIMATE_ML = { small: 150, medium: 300, large: 500 }`, fallback `300` (`analytics-types.ts`).

### Statistical thresholds
- `MIN_PAIRED_DAYS = 3` (chart) — coefficient hidden below this.
- Internal Pearson minimum also **3 paired days** (`analytics-stats.ts`).
- Zero-variance guard (`stdA === 0 || stdB === 0`) forces coefficient 0 / "none".

### Optional trackers (`OPTIONAL_TRACKERS`)
- `sugar` — label "Sugar", unit "g", default **enabled**.
- `potassium` — label "Potassium", unit "mg", default **disabled**.

### Chart styling tokens
- Series A line color `hsl(199 89% 48%)` (water blue); Series B `hsl(346 77% 50%)` (rose).
- Fluid balance bars `hsl(199 89% 48%)`; target line `hsl(160 84% 39%)` (emerald), dashed `4 4`.
- Tooltip: `hsl(var(--card))` bg, `hsl(var(--border))` border, radius 8px, font 12.
- Chart heights: correlation 250px, fluid balance 200px.
- Card bg `bg-white/80 dark:bg-slate-900/50`, borders `border-slate-200 dark:border-slate-800`.

---

## Data model touched

Read-only across these Dexie tables (via domain services, `src/lib/db.ts`):
- **intakeRecords** (`type`, `amount`, `timestamp`) — water/salt/sugar/potassium series.
- **weightRecords** (`weight`, `timestamp`).
- **bloodPressureRecords** (`systolic`, `diastolic`, `heartRate?`, `position`, `timestamp`) — only `systolic` charted.
- **urinationRecords** (`amountEstimate?`, `timestamp`) — `amountEstimate` ∈ small/medium/large drives estimated ml.
- **eatingRecords** (`timestamp`) — counted as 1/event.
- **defecationRecords** (`timestamp`) — counted as 1/event.
- **substanceRecords** (`type` "caffeine"|"alcohol", `amountMg?`, `amountStandardDrinks?`, `timestamp`; record also carries `volumeMl?`, `abvPercent?`, `description`, `source`, `aiEnriched?`, `sourceRecordId?` — unused by correlations) — queried via compound index `[type+timestamp]`.

Types: `Domain`, `TimeRange`, `DataPoint {timestamp, value, label?}`, `CorrelationResult {coefficient, strength, seriesA, seriesB, pairs[], pairedDays, lagDays}`, `AnalyticsResult<T> {value, unit, period, dataPoints, meta?}`, `FluidBalanceDay`, `FluidBalanceResult {daily, intraday, avgBalance, daysAboveTarget, daysTotal}`. No writes; medication/prescription tables are NOT touched here.

- **`FluidBalanceResult.intraday`** — `fluidBalance` also computes an `intraday` running-cumulative-balance `DataPoint[]` series (all water/urination events merged chronologically with a running cumulative). The Correlations tab **never renders this** (only `daily` is used); it is produced-but-unused here.
- **`SubstanceRecord`** carries more fields than correlations consume: beyond `amountMg` / `amountStandardDrinks`, it has `volumeMl`, `abvPercent`, `description`, `source`, `aiEnriched`, `sourceRecordId` (`db.ts`). None of these are charted by correlations.

---

## Validation, edge cases & business rules

- **Daily aggregation:** every domain is reduced to one mean value per local calendar day (`toLocalDateKey`) before correlating and before charting; multi-event days never double-count.
- **Lag application:** series A's day keys are shifted forward by `lagDays` (via `new Date(dateStr + "T12:00:00")` + `setDate`) and matched against series B's unshifted days. Lag is one-directional (A leads B).
- **Minimum 3 paired days** required for any coefficient; 1–2 paired days show an explicit insufficiency state; 0 overlapping series show "Not enough data to compare".
- **Zero-variance** in either paired series (e.g. constant weight) → no coefficient (strength "none").
- **Urination is estimated**, never measured: fluid balance and the urination domain both depend on the `amountEstimate` category mapping; unset estimates default to medium/300 ml.
- **BP uses systolic only** — diastolic and heart rate are ignored in correlation/charts here.
- **Eating & defecation are event counts** (value 1) — correlations against them measure event frequency per day, not magnitude.
- **Day boundaries vs day-start-hour:** correlation/chart grouping uses pure local-midnight calendar days (`toLocalDateKey` / date-fns `startOfDay`), NOT the user's configurable `dayStartHour` (that day-start setting governs other surfaces, not these analytics groupings).
- **Lag input** is bounded 0–14 in the UI but not otherwise sanitized; `Number(e.target.value)` of an empty field yields 0.
- **Lazy custom query:** until Compare is pressed, `useCorrelation` is fed `water/water` over an empty `{start:0,end:0}` range to avoid running real work.
- **Optional-tracker gating is double-enforced:** both the pre-built card and the dropdown option disappear when the tracker is disabled; disabled-tracker data is never surfaced even if present.
- **Rounding:** avg fluid balance is `Math.round`ed for display; coefficient shown to 2 decimals (`toFixed(2)`).
- **Substance table fault tolerance:** missing `substanceRecords` table (older schema) is caught and treated as empty rather than erroring.
- **Fluid-balance "on target" rule:** `daysAboveTarget` counts days where `intakeMl >= target`, where `target` is the **per-day** value `urinationEstimatedMl + 500` computed in the service (`analytics-service.ts`). This differs from the chart's **flat dashed reference line**, which is a constant `FLUID_TARGET_ML` (500) unrelated to per-day output — the footer stat and the visual line use two different "target" notions.

---

## Sub-components / variants

- **`CorrelationsTab`** — tab body; mounts the section header, 4–5 pre-built `CorrelationCard`s (gated by optional trackers), `FluidBalanceCard`, and `CustomComparison`.
- **`CorrelationCard`** (internal) — wraps a `CorrelationChart` + interpretation sentence in a titled card.
- **`FluidBalanceCard`** (internal) — daily balance bar chart with target line + footer stats, plus an empty-state variant.
- **`CustomComparison`** (internal) — two domain selects + lag input + Compare button + lazily-rendered chart.
- **`CorrelationChart`** (`correlation-chart.tsx`) — shared dual-axis daily-overlay line chart + coefficient/strength/paired-day stat strip; handles empty and insufficient-overlap variants.
- **`interpretCorrelation` / `strengthLabel` / `coefficientColor`** (helpers) — derive plain-language sentence, strength+direction label, and color class from a `CorrelationResult`.
- **Service/stat layer:** `correlate`, `getRecordsByDomain`, `fluidBalance`, `saltVsWeight`/`sugarVsWeight`/`potassiumVsWeight`/`caffeineVsBP`/`alcoholVsBP` (`analytics-service.ts`); `correlateTimeSeries` (`analytics-stats.ts`).
- **Reactive hooks:** `useCorrelation`, `useSaltVsWeight`, `useSugarVsWeight`, `usePotassiumVsWeight`, `useCaffeineVsBP`, `useAlcoholVsBP`, `useFluidBalance`, `useTimeScopeRange` (`use-analytics-queries.ts`).
- **External context:** `TimeRangeSelector` (range presets/custom range, shared across all analytics tabs) and the host `analytics/page.tsx` Tabs shell.
