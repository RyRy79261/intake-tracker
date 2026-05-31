# 07 — TODAY / THIS WEEK Summary Widget (Text Metrics)

**Files covered:**
- `src/components/text-metrics.tsx` (the widget)
- `src/components/ui/progress.tsx` (two-stage/extended progress bar primitive it renders)
- `src/lib/progress-utils.ts` (`computeTwoStageProgress` — the budget/over-limit math)
- `src/lib/card-themes.ts` (`CARD_THEMES` — per-metric colors/labels/icons/gradients)
- `src/lib/optional-trackers.ts` (`useOptionalTrackerEnabled`, `OPTIONAL_TRACKERS` — sugar/potassium toggles)
- `src/hooks/use-intake-queries.ts` (`useDailyIntakeTotal`, `useIntakeRecordsByDateRange`, `getDayStartTimestamp`)
- `src/hooks/use-substance-queries.ts` (`useSubstanceRecordsByDateRange`)
- `src/hooks/use-now-tick.ts` (`useNowTick` — 60s day-boundary refresh)
- `src/lib/intake-service.ts` (`getDailyTotal`, `getRecordsByDateRange`)
- `src/lib/date-utils.ts` (`getDayStartTimestamp`)
- `src/lib/db.ts` (`IntakeRecord`, `SubstanceRecord`)
- `src/stores/settings-store.ts` (limits / buffers / dayStartHour / optionalTrackers defaults)
- Consumers: `src/app/page.tsx` (mounted on dashboard), `src/components/help/preview-registry.tsx` + `src/lib/help/preview-data.ts` (manual preview)

**Purpose:** A read-only, compact text dashboard with two stacked sections — a "Today" daily-budget list (per-metric progress bar + current/limit + over-limit overflow) and a "This Week (Mon-Sun)" 7-column numeric grid (one row per metric, one cell per day). It summarizes the day's and week's intake budgets for water, sodium, sugar, potassium, caffeine, and alcohol without any input controls.

---

## Features

### Overall
- Two sections inside one bordered card (`rounded-lg bg-muted/50 border p-4`):
  1. **Today** — vertical list of per-metric rows.
  2. **This Week (Mon-Sun)** — a `grid-cols-[auto_repeat(7,1fr)]` table: a label column + 7 day columns.
- Purely presentational/read-only: no buttons, inputs, or edit affordances. It reads live data and re-renders reactively.
- Self-refreshes every 60 seconds via `useNowTick()` (called with no argument; 60_000 ms is the hook's default interval param) so the "today"/"week" window rolls over at the configured day-start hour without a page reload.
- All metric rows are gated/styled from a single per-metric theme registry (`CARD_THEMES`), so each metric carries a consistent icon + color across both sections.

### Today section (daily budget rows)
Six possible rows, in this fixed order; each is one flex line (`icon · label(w-16) · bar/spacer(flex-1) · value block`). Water/sodium/sugar use a stacked `flex-col` value block; potassium instead places its value as two sibling spans directly in the flex row (`{total}` then `/ {limit} mg`):
1. **Water** — always shown.
2. **Sodium** (key `salt`, label "Sodium") — always shown.
3. **Sugar** — shown only if optional tracker `sugar` enabled.
4. **Potassium** — shown only if optional tracker `potassium` enabled.
5. **Caffeine** — always shown.
6. **Alcohol** — always shown.

Per row, budgeted metrics (water/sodium/sugar) render:
- A Lucide icon (water=Droplets, sodium=Sparkles, sugar=Candy) in the metric theme color.
- A fixed-width label (`w-16`).
- A two-stage progress bar (`<Progress>`, `h-2 flex-1`): primary fill to daily limit, second-tone "extended" segment into the buffer zone, a thin target-line marker, and full-red when past the extended zone.
- A right-aligned value stack: top line `min(total, limit) / limit <unit>`; second line (only when over target and buffer > 0) `extendedCurrent / extendedTotal <unit> extra`.

Potassium (soft target) renders:
- Banana icon, single-stage bar capped at 100% (never reds out, no buffer, no marker).
- Value `total / limit mg` (raw total, NOT clamped to the limit).

The two optional Today rows carry test hooks: the sugar row has `data-testid="metrics-sugar-row"` and the potassium row has `data-testid="metrics-potassium-row"` (used by tests, not user-facing).

Caffeine / Alcohol render (no bar, no limit):
- Coffee / Wine icon, a `flex-1` spacer instead of a bar.
- Caffeine value: `<total> mg` — the raw `caffeineTotal` (sum of `amountMg`) rendered verbatim with no rounding or `toLocaleString` (only the *weekly* caffeine cell applies `Math.round`); a non-integer or large `amountMg` would show as-is.
- Alcohol value: `<total.toFixed(1)> std drinks` (1 decimal).
- When the total is exactly 0, the value uses muted-foreground color instead of the theme color.

### This Week section (weekly grid)
- Header `This Week (Mon-Sun)`.
- Top row: an empty corner cell + 7 day-of-week headers `M T W T F S S`. Today's header column is bold (`font-semibold`).
- One row per enabled metric, with a short label in the leftmost column and 7 numeric cells:
  - Row labels (abbreviated): `Water`, `Na`, `Sug`, `K`, `Caf`, `Alc`.
  - Rows shown: water + Na always; Sug only if `sugar` enabled; K only if `potassium` enabled; Caf + Alc always. (Same enable flags as the Today rows, via `.filter(row => row.show)`.)
- Each cell holds that day's summed total for the metric, formatted per metric:
  - water/Na/Sug/K → `toLocaleString()` (thousands separators).
  - Caf → `Math.round(v)` then `toLocaleString()` (integer mg).
  - Alc → `v.toFixed(1)` (1 decimal std drinks).
- **Future days** (day index > today) render literal `---` in faded text and are not computed/colored.
- **Today's column** cells are bold.
- Cell color encodes budget state for limit-bearing rows (water/Na/Sug only — K/Caf/Alc have `limit: 0` so never colorize by budget):
  - has data, under target → metric theme `latestValueColor`.
  - in extended zone (over target, within buffer) → orange (`text-orange-600 dark:text-orange-400`).
  - over extended (over target + buffer) → red (`text-red-600 dark:text-red-400`).
  - no data (0) and not future → faded muted (`text-muted-foreground/50`).
- Cell classes are composed via `cn(...)`, so the per-state color/fade class and the today-column `font-semibold` bold can co-apply on the same cell (e.g. a no-data faded cell that is also today's column renders both muted-faded and bold).

### Computation / data flow
- **Today totals**: water/salt/sugar/potassium via `useDailyIntakeTotal(type)` → `getDailyTotal` sums non-deleted `IntakeRecord.amount` with `timestamp >= getDayStartTimestamp(dayStartHour)`. Caffeine/alcohol via `useSubstanceRecordsByDateRange(dayStart, now, type)` then summed (`amountMg` for caffeine, `amountStandardDrinks` for alcohol).
- **Weekly data**: per metric, `useIntakeRecordsByDateRange(weekStart, weekEnd, type)` / `useSubstanceRecordsByDateRange(...)`, then `bucketByDay(...)` floors each record into one of 7 buckets by `floor((timestamp - weekStart) / 86_400_000)`, summing the metric's accessor value into that bucket. Records outside `[0,7)` are dropped. The substance range query uses the compound `[type+timestamp]` index when a `type` is supplied (else a plain `timestamp` index), and both ends of the range are inclusive (`between(start, end, true, true)`).
- **Progress math** (water/salt/sugar): `computeTwoStageProgress(total, limit, buffer)` → `{ primaryPct, extendedPct, targetPct, isOverTarget, isOverExtended, isTwoStage, extendedCurrent, extendedTotal, maxAmount }`.
- **Potassium pct**: `limit > 0 ? min(100, total/limit*100) : 0` (single-stage, clamped).

---

## User actions & interactions

- **None directly.** This widget has zero interactive controls — no taps, inputs, swipes, long-press, drag, quick-add, edit, delete, undo, confirm, cancel, or navigation. It is a passive summary.
- Indirect / reactive behaviors only:
  - Logging/editing/deleting intake or substance records elsewhere (other dashboard cards, voice, AI parse) updates the totals here live via Dexie `useLiveQuery`.
  - Changing limits, buffers, `dayStartHour`, or optional-tracker toggles in Settings (Zustand `settings-store`) live-updates bar fills, value denominators, the day/week window, and which rows render.
  - The passage of time across the day-start boundary (every 60s tick) rolls the "today" and "this week" windows forward.
- Accessibility: the section has `aria-label="Daily intake summary"` (role region); each progress bar has an `aria-label` — the water/sodium/sugar budgeted bars (e.g. "Water intake progress") and also the potassium soft-target bar ("Potassium intake progress"); icons are `aria-hidden`.

---

## States & presentations

- **Default / populated**: rows render with bars + values; weekly grid shows colored numbers.
- **Loading**: no skeleton/spinner. Live-query hooks return seeded fallbacks immediately — totals default `0`, record arrays default `[]`, so the widget renders an "all-zero" view rather than a loading state.
- **Empty (no data today)**: budgeted bars at 0% (just the track), values `0 / <limit> <unit>`; caffeine/alcohol show `0 mg` / `0.0 std drinks` in muted color; weekly cells with no data show `0` faded muted (past/today) or `---` (future).
- **Under target**: primary bar fills 0–100% of `limit`; value `total / limit`; weekly cell in theme color.
- **Over target, within buffer (extended zone)**: bar switches to two-stage — primary fully fills the target portion, second-tone "extended" segment grows into the buffer, target-line marker visible at the target boundary; value top line clamps to `min(total, limit)`, second line shows `extendedCurrent / buffer <unit> extra` (extended color = muted while still in-zone). Weekly cell = orange.
- **Over extended (past target + buffer)**: bar forced full and solid red (`bg-red-500`); marker and extended segment suppressed (set to 0); top value still `limit / limit` but colored red; "extra" line shows `extendedCurrent / extendedTotal <unit> extra` in red (and `extendedCurrent` may exceed `extendedTotal`, so overshoot is visible). Weekly cell = red.
- **Potassium over limit**: never reds — bar caps at 100%, value shows true `total` (may exceed limit numerically), weekly K cells never colorize by budget.
- **Buffer disabled (buffer = 0)**: budgeted metric stays single-stage; over-target jumps straight to red (no extended/orange zone); no "extra" second line (gated on `extendedTotal > 0`); no target marker.
- **Limit = 0** (e.g. user clears a limit; also the K/Caf/Alc weekly rows): `computeTwoStageProgress` short-circuits to all-zero progress (empty bar, no over-limit), and division by zero is avoided.
- **Optional tracker disabled**: Sugar / Potassium Today rows and `Sug` / `K` weekly rows are removed entirely (not greyed) — both gated by `useOptionalTrackerEnabled`.
- **Future day cells**: `---` in `text-muted-foreground/50`.
- **Today emphasis**: today's weekly header letter and today's column cells are bold.
- **Offline / syncing / error**: no dedicated UI. Data is local-first (IndexedDB) so values render regardless of network; there is no error boundary or offline banner inside this widget.
- **Dark mode**: every color token has a `dark:` variant (theme colors, red `dark:text-red-400`, orange `dark:text-orange-400`, marker `dark:bg-foreground/50`).
- **Animation**: progress bars animate fills with `transition-all duration-300 ease-out`.

---

## Enums, options & configurable values

### Metrics rendered (Today rows, in order)
| Metric | Key | Label (Today) | Icon | Unit | Bar type | Always shown? |
|---|---|---|---|---|---|---|
| Water | `water` | "Water" | Droplets | ml | two-stage | yes |
| Sodium | `salt` | "Sodium" | Sparkles | mg | two-stage | yes |
| Sugar | `sugar` | "Sugar" | Candy | g | two-stage | only if enabled |
| Potassium | `potassium` | "Potassium" | Banana | mg | single-stage (soft) | only if enabled |
| Caffeine | `caffeine` | "Caffeine" | Coffee | mg | none (text only) | yes |
| Alcohol | `alcohol` | "Alcohol" | Wine | std drinks | none (text only) | yes |

### Weekly grid row labels
`Water`, `Na`, `Sug`, `K`, `Caf`, `Alc`.

### Day headers
`DAY_HEADERS = ["M","T","W","T","F","S","S"]` (Mon→Sun); section title "This Week (Mon-Sun)".

### IntakeRecord.type enum
`"water" | "salt" | "sugar" | "potassium"`.

### SubstanceRecord.type enum
`"caffeine" | "alcohol"` (caffeine summed on `amountMg`; alcohol on `amountStandardDrinks`).

### Settings defaults (from `settings-store.ts`)
- `waterLimit` = `1000` (ml)
- `saltLimit` = `1500` (mg)
- `sugarLimit` = `30` (g)
- `potassiumLimit` = `3500` (mg; WHO adequate-intake reference)
- `waterExtendedBuffer` = `500` (ml)
- `saltExtendedBuffer` = `500` (mg)
- `sugarExtendedBuffer` = `10` (g)
- `dayStartHour` = `2` (2am)
- `optionalTrackers` = `{ sugar: true, potassium: false }`

### Settings input bounds (clamps; relevant to denominators the widget shows)
- `waterLimit`: 100–10000; `saltLimit`: 100–10000; `sugarLimit`: 5–500.
- `waterExtendedBuffer`/`saltExtendedBuffer`: 0–10000; `sugarExtendedBuffer`: 0–500.
- `potassiumLimit`: 100–20000.
- `dayStartHour`: 0–23.

### Color-state tokens
- Theme per-metric `latestValueColor` (e.g. water `text-sky-700 dark:text-sky-300`, sodium amber, sugar pink, potassium purple, caffeine yellow, alcohol fuchsia).
- Over-extended/red: `bg-red-500` (bar), `text-red-600 dark:text-red-400` (text).
- Extended-zone weekly: `text-orange-600 dark:text-orange-400`.
- Faded/empty/future: `text-muted-foreground/50`.
- Progress gradients: water `from-sky-400 to-cyan-500` / extended `from-blue-500 to-indigo-600`; salt `from-amber-400 to-orange-500` / extended `from-orange-600 to-amber-700`; sugar `from-pink-400 to-rose-500` / extended `from-rose-600 to-fuchsia-700`; potassium `from-purple-400 to-indigo-500`; caffeine `from-yellow-400 to-amber-500`; alcohol `from-fuchsia-400 to-pink-500`.

### Misc constants
- `ONE_DAY_MS = 86_400_000`; `weekEnd = weekStart + 7 * ONE_DAY_MS`.
- Tick interval: `60_000` ms.
- Number format: `value.toLocaleString()`; caffeine weekly rounds via `Math.round`; alcohol `toFixed(1)`.

---

## Data model touched (read-only)

### `IntakeRecord` (`src/lib/db.ts`, table `intakeRecords`)
Reads: `type` ("water"|"salt"|"sugar"|"potassium"), `amount` (ml/mg/g/mg by type), `timestamp`, `deletedAt` (only `null` counted). Writes: none.

### `SubstanceRecord` (`src/lib/db.ts`, table `substanceRecords`)
Reads: `type` ("caffeine"|"alcohol"), `amountMg` (caffeine), `amountStandardDrinks` (alcohol), `timestamp`, `deletedAt`. Writes: none.

### Services
- `getDailyTotal(type, dayStartHour)` — `intakeRecords` where `timestamp >= dayStart`, filtered `type` + `deletedAt === null`, summed `amount`.
- `getRecordsByDateRange(start, end, type?)` — `intakeRecords` `timestamp.between(start,end)`, filtered `deletedAt === null` (+ optional type).
- `getSubstanceRecordsByDateRange(start, end, type?)` — substance equivalent; when `type` is given it queries the compound `[type+timestamp]` index, otherwise the plain `timestamp` index, with inclusive bounds (`between(..., true, true)`), then filters `deletedAt === null`.

### Settings store (Zustand, persisted to localStorage)
Reads: `dayStartHour`, `waterLimit`, `saltLimit`, `sugarLimit`, `potassiumLimit`, `waterExtendedBuffer`, `saltExtendedBuffer`, `sugarExtendedBuffer`, `optionalTrackers.{sugar,potassium}`.

---

## Validation, edge cases & business rules

- **Day-start boundary**: a "day" begins at `dayStartHour` (default 2am), not midnight. Before that hour, the current logical day is still "yesterday" — applied in `getDayStartTimestamp`, `getWeekStartTimestamp`, and `getTodayDayIndex`. Records logged after midnight but before 2am count toward the prior day.
- **Week start = logical Monday**: `getWeekStartTimestamp` finds Monday `00:00` set to `dayStartHour` (Sun maps to `daysSinceMonday = 6`).
- **Today index**: `getTodayDayIndex` → 0=Mon … 6=Sun (Sun → 6), also boundary-adjusted.
- **Soft delete**: only `deletedAt === null` records count anywhere.
- **Two-stage progress rules** (`computeTwoStageProgress`):
  - `target <= 0` → all-zero result (no bar, no over-limit) — guards divide-by-zero.
  - `buffer = Math.max(0, extendedBuffer)` (negative buffers floored to 0).
  - `isTwoStage` only when `isOverTarget && buffer > 0`; below target the bar stays single-stage (`0..target`), hiding the buffer entirely.
  - Single-stage: `primaryPct = min(total/target*100, 100)`, no extended segment, no marker.
  - Two-stage: `maxAmount = target + buffer`; `primaryPct = target/maxAmount*100`; extended fill = `min(extendedCurrent, buffer)/maxAmount*100`; `targetPct = primaryPct`.
  - `isOverExtended`: `buffer>0 ? total>target+buffer : total>target`.
  - `extendedCurrent = max(0, total - target)` (can exceed `extendedTotal` once past the buffer — displayed verbatim).
- **Display clamping**: Today top value uses `min(total, limit)` for water/salt/sugar (overflow shown only in the "extra" line). Potassium shows raw total (not clamped). The `<Progress>` primitive also clamps `value`/`extended` into `[0,100]` and constrains extended width to `100 - primary`.
- **Potassium is a soft target**: never reds; bar capped at 100%; no buffer/marker/overflow line.
- **Caffeine/alcohol have no limits in this widget** (no bar, no over-limit) — purely informational totals; weekly rows pass `limit: 0` so cells never colorize by budget.
- **Bucket guard**: weekly buckets only accept indices `0..6`; out-of-range records are silently dropped (defensive against clock drift / records on the week boundary).
- **Marker visibility**: target-line only drawn when `0 < targetMarkerPct < 100`.
- **Future cells**: never computed/colored — literal `---`.
- **Rounding**: caffeine weekly cells `Math.round`; alcohol `toFixed(1)`; everything else `toLocaleString()` (no rounding, locale grouping).
- **Empty-total muting**: caffeine/alcohol Today values turn muted when exactly 0.

---

## Sub-components / variants

- `TextMetrics` (`text-metrics.tsx`) — the widget itself; the only exported component.
- `Progress` (`ui/progress.tsx`) — Radix-based bar primitive supporting `value`, `extendedValue`, `extendedIndicatorClassName`, `targetMarkerPct`/`targetMarkerClassName`; renders single-stage (Indicator transform) or two-stage (two absolute segments) + optional target marker line.
- Helper functions (module-local, not exported): `getWeekStartTimestamp(dayStartHour)`, `getTodayDayIndex(dayStartHour)`, `formatValue(value)` (locale string), `bucketByDay(records, weekStart, accessor)` (7-bucket day summation).
- `computeTwoStageProgress` (`progress-utils.ts`) — budget/over-limit math returning `TwoStageProgress`.
- `CARD_THEMES` (`card-themes.ts`) — per-metric label/icon/color/gradient registry (keys: water, salt, sugar, potassium, weight, bp, eating, urination, defecation, caffeine, alcohol).
- `useOptionalTrackerEnabled` / `OPTIONAL_TRACKERS` (`optional-trackers.ts`) — sugar/potassium visibility gating (defaults sugar=true, potassium=false). A non-reactive snapshot variant `getOptionalTrackerEnabled` also exists in the same module (one-shot reads inside callbacks), but the widget uses only the reactive hook.
- Data hooks: `useDailyIntakeTotal`, `useIntakeRecordsByDateRange`, `getDayStartTimestamp` (`use-intake-queries.ts`); `useSubstanceRecordsByDateRange` (`use-substance-queries.ts`); `useNowTick` (`use-now-tick.ts`, called with no argument so it uses its default 60s interval; the hook defensively clamps any non-finite or `≤ 0` interval back to `60_000` ms via `safeIntervalMs`).
- Consumers / previews: `page.tsx` mounts it on the dashboard; `preview-registry.tsx` + `seedTextMetricsPreview` (`preview-data.ts`) render it in the in-app help manual; `text-metrics.dom.test.tsx` asserts the "Today"/"This Week (Mon-Sun)" headings and seeded-water rendering.
