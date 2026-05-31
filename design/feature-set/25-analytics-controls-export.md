# 25 — Analytics Controls + Export

**Files covered:**
- `src/components/analytics/time-range-selector.tsx`
- `src/components/analytics/export-controls.tsx`
- `src/components/analytics/analytics-intro-dialog.tsx`
- `src/lib/export-service.ts`
- `src/hooks/use-analytics-queries.ts`
- `src/app/analytics/page.tsx` (host page — how the controls compose)
- `src/lib/analytics-types.ts` (types, enums, constants)
- `src/lib/analytics-service.ts` (`getRecordsByDomain`, computations behind export/PDF)
- `src/lib/date-utils.ts` (`toLocalDateKey` used by date inputs)
- `src/stores/settings-store.ts` (`analyticsIntroSeen` flag)

**Purpose:** The shared control strip and export surface for the Analytics page. It lets the user pick a time window (preset scopes or a custom calendar-day range), drives every analytics tab off that window via a memoized range, exports all health data as CSV or a structured PDF health report (fully client-side, offline-capable), and shows a one-time intro dialog explaining local vs. CloudSync analytics.

---

## Features

### Time-range selection (`TimeRangeSelector`)
- Presents a row of 5 preset scope chips plus a "Custom" chip: `24h`, `7d`, `30d`, `90d`, `All`, `Custom`.
- Selecting a preset sets the active `scope`, clears any custom range, and hides the custom date inputs.
- Selecting "Custom" reveals two `<input type="date">` fields (start → end). If no custom range exists yet, it seeds a default 7-day window (`end = now`, `start = now − 7 days`).
- The selected chip is visually highlighted (filled/`default` variant); all others are outline.
- Preset scopes are converted to a concrete `TimeRange` by `useTimeScopeRange`, which snaps to **calendar-day boundaries** so daily grouping never produces partial edge days.
- The effective range used by all tabs and the export controls is `customRange ?? scopeRange` (custom takes precedence when set).

### Export controls (`ExportControls`)
- Two buttons: **Export PDF** and **Export CSV**, both operating on the current effective `TimeRange`.
- **PDF** (`exportToPDF`): generates a multi-section structured "Health Report" PDF via jsPDF + jspdf-autotable, fully client-side, and triggers a browser download.
- **CSV** (`exportAllRecordsCSV`): collects every domain record in range into a single normalized CSV (one row per record, sorted by timestamp) and triggers a download.
- Both show inline progress text while running and a toast on success/failure.

### PDF report content (`exportToPDF`)
Sections, in order:
1. **Title block** — centered "Health Report" + date range subtitle (`MMM d, yyyy - MMM d, yyyy`).
2. **Summary** — period line + total data points (sum of fluid + bp + weight + adherence data points).
3. **Blood Pressure** — average `systolic/diastolic mmHg`, systolic trend (direction + slope to 3dp), diastolic trend (direction + slope), reading count. Falls back to "No blood pressure readings in this period." when empty.
4. **Weight** — average kg (1dp), min–max range (1dp), trend direction + slope (3dp). Fallback line when empty.
5. **Fluid Balance** — average daily balance (ml, 0dp), days above target / days total. Fallback line when empty.
6. **Medication Adherence** — overall rate as `%` (1dp), taken / total doses. Fallback line when empty.
7. **Recent Records** — a grid table (`Date | Domain | Value`) gathered from 8 domains, last 10 per domain, re-sorted descending by formatted date, capped at 50 rows.
- Page-break handling: section headers break when `y > 260`, body lines break when `y > 275`.
- Footer page numbers (`Page i of N`) stamped on every page.
- File name: `health-report-<startYYYY-MM-DD>-<endYYYY-MM-DD>.pdf`.

### CSV export content (`exportAllRecordsCSV`)
- Iterates 11 domains (no `medication`), pulls all records in range via `getRecordsByDomain`.
- Header row: `timestamp,domain,value,unit,note`.
- Each row: ISO-8601 timestamp, domain name, numeric value, unit (per `domainUnit`), and note/label (empty string if none).
- All rows sorted ascending by ISO timestamp string.
- CSV fields escaped (wrapped in quotes, internal quotes doubled) when they contain comma/quote/newline.
- File name: `health-data-<startYYYY-MM-DD>-<endYYYY-MM-DD>.csv`.
- Returns early without downloading if there are zero rows.

### Generic single-result CSV (`exportToCSV`, exported helper)
- Exports an arbitrary `AnalyticsResult.dataPoints` array to CSV, deriving headers from the keys of the first data point. Returns early (no download) if `dataPoints` is empty. (Used for per-chart/per-result exports rather than the all-records button.)

### Intro dialog (`AnalyticsIntroDialog`)
- One-time modal shown the first time the analytics page is opened (gated on the persisted `analyticsIntroSeen` flag).
- Two informational blocks:
  - **On this device** (BarChart3 icon, sky tint) — local, private analytics: key metrics, BP & weight trends, fluid balance, pre-built correlations.
  - **With CloudSync** (Cloud icon + Sparkles, violet tint) — server-side analysis unlocking AI-enhanced analytics and deeper predefined queries; explicitly noted as optional and enabled only from Settings.
- Intentionally provides **no shortcut to enable CloudSync** — that stays in Settings.
- Dismissed via "Got it" button or closing the dialog; either sets `analyticsIntroSeen = true`.

### Analytics queries (`use-analytics-queries.ts`)
- `useTimeScopeRange(scope)` — memoized scope→range converter (the engine behind preset chips).
- Reactive `useLiveQuery` hooks (re-run on Dexie changes) returning instant defaults to avoid loading flashes: `useFluidBalance`, `useAdherenceRate` (optional `prescriptionId`), `useBPTrend`, `useWeightTrend`, `useSaltVsWeight` / `useSugarVsWeight` / `usePotassiumVsWeight` (optional `lagDays`), `useCaffeineVsBP`, `useAlcoholVsBP`, `useCorrelation(domainA, domainB, range, lagDays?)`.

---

## User actions & interactions

| Action | Result |
| --- | --- |
| Tap a preset chip (`24h`/`7d`/`30d`/`90d`/`All`) | Sets scope, clears custom range, hides date inputs, re-derives range to calendar-day boundaries; all tabs + export update. |
| Tap "Custom" | Shows two date inputs; seeds a 7-day range if none exists; chip becomes highlighted. |
| Change the start date input | Sets `start = start-of-that-day` (00:00:00.000); clamps `end` to at least `start` (`end = max(start, prevEnd)`). |
| Change the end date input | Sets `end = end-of-that-day` (23:59:59.999); clamps `start` to at most `end` (`start = min(prevStart, end)`). |
| Clear a date input (empty value) | Ignored (no-op; range unchanged). |
| Tap "Export PDF" | Disables button, shows "Generating…", builds + downloads PDF, then success toast ("PDF exported"). On error: error toast ("Export failed / Could not generate PDF report."). |
| Tap "Export CSV" | Disables button, shows "Exporting…", builds + downloads CSV, then success toast ("CSV exported"). On error: error toast ("Export failed / Could not generate CSV export."). |
| Open analytics page first time | Intro dialog appears automatically. |
| Tap "Got it" / dismiss intro dialog | Persists `analyticsIntroSeen = true`; dialog never auto-shows again. |
| Switch tab (Summary/Correlations/Records/Titration) | Active tab content swaps; the shared range + export strip persist above the tabs. |

---

## States & presentations

- **Default** — preset row with `7d` selected (page default scope); export buttons enabled with idle labels "Export PDF" / "Export CSV".
- **Custom active** — "Custom" chip highlighted, two date inputs visible (start "to" end), all preset chips outline.
- **PDF generating** — PDF button disabled, label "Generating…"; CSV button unaffected.
- **CSV exporting** — CSV button disabled, label "Exporting…"; PDF button unaffected.
- **Export success** — success toast (default variant).
- **Export error** — destructive-variant toast; error logged to console.
- **Empty data on export** — CSV/PDF still run; CSV silently returns with no download when zero records; PDF still produces a document with per-section "No … in this period." fallback lines.
- **Intro dialog visible** — modal overlay; only when mounted AND `!analyticsIntroSeen` (guarded by a `mounted` flag to avoid SSR/hydration flash).
- **Intro dialog hidden** — once `analyticsIntroSeen` is true.
- **Loading (queries)** — there is effectively no spinner state; every `useLiveQuery` hook supplies a zeroed default object so the UI renders instantly and reactively updates when data arrives.
- **Offline** — fully functional: all computation, CSV, and PDF generation are client-side (no network).
- **Selected/active chip** — `default` (filled) button variant; unselected chips use `outline`.
- Chips are full-width-distributed (`flex-1`, `min-w-[3rem]`) and wrap (`flex-wrap`) on narrow screens.

---

## Enums, options & configurable values

**Time scopes (`TimeScope`):** `"24h" | "7d" | "30d" | "90d" | "all"` (+ a "Custom" mode that is not a scope value but a separate UI state).

**Scope chip labels (`SCOPE_OPTIONS`):** `24h → "24h"`, `7d → "7d"`, `30d → "30d"`, `90d → "90d"`, `all → "All"`; plus literal "Custom".

**Scope → range mapping (`useTimeScopeRange`, all snapped to calendar days, `end = endOfDay(now)`):**
- `24h` → `start = startOfDay(now)`
- `7d` → `start = startOfDay(now − 6 days)`
- `30d` → `start = startOfDay(now − 29 days)`
- `90d` → `start = startOfDay(now − 89 days)`
- `all` → `start = 0` (epoch)
- default fallback → 7-day window

**Default custom range (when first opening Custom):** `end = Date.now()`, `start = end − 7×24×60×60×1000`.

**Page default scope:** `"7d"`. **Default active tab:** `"summary"`.

**Analytics tabs (`AnalyticsTab` / `TAB_VALUES`):** `"summary" | "correlations" | "records" | "titration"` (URL `?tab=` syncs the active tab).

**CSV export domains (11, order matters):** `water, salt, sugar, potassium, weight, bp, eating, urination, defecation, caffeine, alcohol`. (`medication` is excluded — it has no single numeric value.)

**PDF "Recent Records" domains (8):** `water, salt, sugar, potassium, weight, bp, caffeine, alcohol`.

**All domains (`DOMAINS`):** `water, salt, sugar, potassium, weight, bp, eating, urination, defecation, caffeine, alcohol, medication`.

**Domain units (`domainUnit`):** `water → ml`, `salt → mg`, `sugar → g`, `potassium → mg`, `weight → kg`, `bp → mmHg`, `urination → ml`, `eating → event`, `defecation → event`, `caffeine → mg`, `alcohol → std_drinks`, `medication → dose`, default → `""`.

**Domain value semantics (`getRecordsByDomain`):** water=`amount` ml; salt=`amount` mg; sugar=`amount` g; potassium=`amount` mg; weight=`weight` kg; bp=`systolic` mmHg; urination=estimated ml via `URINATION_ESTIMATE_ML[amountEstimate]`; eating=`1`/event; defecation=`1`/event; caffeine=`amountMg ?? 0`; alcohol=`amountStandardDrinks ?? 0`; medication=`[]` (empty).

**Urination volume estimates (`URINATION_ESTIMATE_ML`):** `small → 150`, `medium → 300` (default), `large → 500` ml.

**Trend directions (`TrendDirection.direction`):** `"rising" | "falling" | "stable"`.

**Correlation strength (`CorrelationResult.strength`):** `"strong" | "moderate" | "weak" | "none"`.

**Correlation lag defaults:** `DEFAULT_SALT_WEIGHT_LAG_DAYS = 2`, `DEFAULT_SUGAR_WEIGHT_LAG_DAYS = 2`, `DEFAULT_POTASSIUM_WEIGHT_LAG_DAYS = 2`. Meaningful correlation requires `pairedDays >= 3`.

**Result units (default hook objects):** fluid → `ml`, adherence → `ratio`, bp → `mmHg`, weight → `kg`, correlation → `correlation`.

**PDF rounding/format:** BP avg `toFixed(0)`, slopes `toFixed(3)`, weight avg/min/max `toFixed(1)`, fluid balance `toFixed(0)`, adherence `(rate*100).toFixed(1)%`. Date formats: title `MMM d, yyyy`, table rows `MMM d, HH:mm`. Table styling: grid theme, header fill `[66,66,66]`, font size 8.

**PDF layout thresholds:** section break at `y > 260`, line break at `y > 275`, page-number baseline `y = 290`, start `y = 20`.

**PDF "Recent Records" limits:** last **10** records per domain, overall cap **50** rows.

**Intro dialog flag (`settings-store`):** `analyticsIntroSeen: boolean` (default `false`), setter `setAnalyticsIntroSeen(seen)`; persisted to localStorage.

**Intro dialog copy/icons:** title "Your analytics"; description "A quick look at what this page can do."; block 1 "On this device" (BarChart3, `text-sky-600 dark:text-sky-400`); block 2 "With CloudSync" (Cloud `text-violet-600 dark:text-violet-400` + Sparkles `text-violet-500`); CTA "Got it".

**Export button icons:** PDF → `FileText`, CSV → `Download` (both `lucide-react`, `h-4 w-4 mr-1`); buttons are `variant="outline" size="sm"`.

---

## Data model touched

Reads only (no writes to health tables); writes only the intro flag to the settings store.

- **`TimeRange`** `{ start: number; end: number }` (Unix ms) — the central window object.
- **`DataPoint`** `{ timestamp: number; value: number; label?: string }`.
- **`AnalyticsResult<T>`** `{ value, unit, period, dataPoints, meta? }`.
- **Source Dexie tables** (read via service helpers behind `getRecordsByDomain`): `intakeRecords` (water/salt/sugar/potassium → `amount`, `timestamp`), `weightRecords` (`weight`, `timestamp`), `bloodPressureRecords` (`systolic`/`diastolic`/`heartRate`/`position`/`timestamp`), `urinationRecords` (`amountEstimate`, `timestamp`), `eatingRecords`, `defecationRecords`, `substanceRecords` (`amountMg` for caffeine, `amountStandardDrinks` for alcohol), and medication/adherence/phase data (via `adherenceRate`).
- **Result types:** `FluidBalanceResult` (`daily[]`, `intraday[]`, `avgBalance`, `daysAboveTarget`, `daysTotal`), `AdherenceResult` (`rate`, `taken`, `total`, `daily[]`), `BPTrendResult` (`readings[]`, `trend.systolic/diastolic`, `avg`), `WeightTrendResult` (`readings[]`, `trend`, `avg`, `min`, `max`), `CorrelationResult` (`coefficient`, `strength`, `seriesA/B`, `pairs`, `pairedDays`, `lagDays`).
- **Settings store:** `analyticsIntroSeen` (localStorage-persisted).

---

## Validation, edge cases & business rules

- **Calendar-day snapping:** preset scopes always end at `endOfDay(now)` and start at `startOfDay(...)` so daily grouping never yields partial edge days. `all` starts at epoch `0`.
- **Custom range clamping:** start change clamps `end = max(start, end)`; end change clamps `start = min(start, end)` — guarantees `start <= end`. Start uses 00:00:00.000, end uses 23:59:59.999.
- **Empty date input:** ignored (early return), range unchanged.
- **Date input value formatting:** uses `toLocalDateKey` (local `getFullYear/Month/Date`, not `toISOString`) so the displayed day reflects the viewer's local calendar day.
- **Effective range precedence:** `customRange ?? scopeRange` — a non-null custom range always overrides the preset.
- **CSV empty guard:** `exportAllRecordsCSV` returns with no download when zero records; `exportToCSV` returns when `dataPoints` empty.
- **CSV escaping:** fields containing `,`, `"`, or `\n` are quoted and embedded quotes doubled.
- **CSV ordering:** ascending by ISO timestamp string; **PDF table ordering:** descending by formatted-date string, then capped at 50.
- **PDF emptiness:** still generates a full document; each section prints a "No … in this period." fallback when its dataset is empty.
- **Medication exclusion:** `medication` has no single numeric value → returns `[]` in `getRecordsByDomain`, is excluded from CSV/PDF record domains (adherence is surfaced as its own PDF section, not as records).
- **Urination volume:** never a real measurement — always estimated from category (`small/medium/large` → 150/300/500), defaulting to `medium`/300 when `amountEstimate` is missing.
- **Correlation meaningfulness:** `pairedDays < 3` means the coefficient is not meaningful (consumer of `CorrelationResult` should treat it as unreliable).
- **Fluid balance target rule:** daily `target = urinationEstimatedMl + 500` (intake target is 500 ml above estimated output); `balance = intakeMl − urinationEstimatedMl`.
- **No loading state by design:** every live-query hook seeds a zeroed default object, so consumers render instantly and update reactively.
- **Intro hydration guard:** dialog only opens after client mount (`mounted` flag) to avoid an SSR/hydration flash before the persisted store settles.
- **Offline-first:** PDF/CSV generation and all analytics computation are 100% client-side; downloads use an in-memory `Blob` + object URL that is revoked after the click.
- **Async export safety:** export buttons are disabled while their operation is in flight to prevent double-clicks; failures are caught, logged, and surfaced via destructive toast.

---

## Sub-components / variants

- **`TimeRangeSelector`** — preset scope chips + custom date-range inputs; owns the `showCustom` toggle and emits `onScopeChange` / `onCustomRangeChange`.
- **`ExportControls`** — the PDF + CSV export button pair with per-button loading state and toasts; operates on a passed `range`.
- **`AnalyticsIntroDialog`** — one-time local-vs-CloudSync explainer modal gated on `analyticsIntroSeen`.
- **`export-service.ts`** functions:
  - `exportToPDF(range)` — structured multi-section health-report PDF.
  - `exportAllRecordsCSV(range)` — single normalized all-domains CSV.
  - `exportToCSV(data, filename)` — generic single-`AnalyticsResult` CSV.
  - `escapeCSVField` (re-exported as `_escapeCSVField` for tests), `dataPointsToCSVRows`, `triggerDownload`, `domainUnit` — internal helpers.
- **`use-analytics-queries.ts`** hooks — `useTimeScopeRange` (range engine for chips) plus the reactive data hooks (`useFluidBalance`, `useAdherenceRate`, `useBPTrend`, `useWeightTrend`, `useSaltVsWeight`, `useSugarVsWeight`, `usePotassiumVsWeight`, `useCaffeineVsBP`, `useAlcoholVsBP`, `useCorrelation`).
- **`analytics/page.tsx`** — host that wires the control strip (`TimeRangeSelector` + `ExportControls` in one flex row) above a 4-tab `Tabs` shell, computes `effectiveRange = customRange ?? scopeRange`, and renders `AnalyticsIntroDialog`.
