# 21 — Analytics: Summary

**Files covered:**
- `src/components/analytics/summary-tab.tsx`
- `src/components/analytics/ai-insights-card.tsx`
- `src/components/analytics/nutrient-analysis-card.tsx`
- `src/hooks/use-insights.ts`
- `src/lib/analytics-insights.ts`
- Supporting (read for accuracy): `src/lib/analytics-snapshot.ts`, `src/lib/analytics-types.ts`, `src/hooks/use-analytics-queries.ts`, `src/hooks/use-records-tab-queries.ts`, `src/lib/optional-trackers.ts`, `src/lib/insight-report-service.ts`, `src/lib/db.ts` (InsightReport), `src/components/analytics/time-range-selector.tsx`, `src/stores/settings-store.ts`

**Purpose:** The Summary tab is the at-a-glance overview of the analytics page: AI-written narrative insights (fast/deep), an on-demand AI food-nutrient scan, a grid of KPI stat cards, rule-based factual observations, and trend mini-charts (BP, weight, daily fluid balance) for the currently selected time range.

---

## Features

### Overall layout (SummaryTab)
Renders, top to bottom, inside a `space-y-4` column:
1. **AI Insights card** (`AiInsightsCard`) — always shown (when data exists).
2. **Food nutrient check card** (`NutrientAnalysisCard`) — always shown (uses its own fixed 30-day window, independent of the page range).
3. **KPI grid** — 2-column grid of stat cards.
4. **Observations card** — rule-based factual statements (only when at least one rule fires).
5. **Charts** — Blood Pressure (line), Weight (line), Daily Fluid Balance (bar) — each only when it has data.

The whole tab is driven by a `range: TimeRange` prop (`{ start, end }` Unix ms) supplied by the parent analytics page's time-range selector. The nutrient card is the lone exception — it pins its own rolling 30-day window at mount and ignores the range.

### KPI stat cards (computed)
Each `KpiCard` shows: icon + label (muted), a large mono value, an optional trend arrow, and an optional sub-line. Cards (in order; some conditional):

- **Avg Blood Pressure** (Heart icon) — `Math.round(systolic)/Math.round(diastolic)` (e.g. `128/82`) or `—`. Sub: `N reading(s)` or `No readings`. Trend arrow when ≥2 readings (systolic direction).
- **Avg Weight** (Scale icon) — `XX.X kg` or `—`. Sub: `+/-X.X kg over period` (≥2 readings), `1 reading`, or `No readings`. Trend arrow when ≥2 readings.
- **Fluid Balance** (Droplets icon) — `Math.round(avgBalance) ml`. Sub: `daysAboveTarget/daysTotal days on target`, or `avg / day` when no days.
- **Water Intake** (Droplets icon) — `Math.round(waterMl / rangeDays) ml` avg/day. Sub: `X.X L total · avg/day`.
- **Sodium Intake** (Activity icon) — `Math.round(saltMg / rangeDays) mg` avg/day. Sub: `N mg total · avg/day`.
- **Sugar Intake** (Candy icon) — only when sugar tracker enabled. `Math.round(sugarG / rangeDays) g` avg/day. Sub: `N g total · avg/day`.
- **Potassium Intake** (Banana icon) — only when potassium tracker enabled. `Math.round(potassiumMg / rangeDays) mg` avg/day. Sub: `N mg total · avg/day`.
- **Activity** (Activity icon) — `N meals`. Sub: `N urination · N defecation`.
- **Caffeine** (Activity icon) — only when total caffeine > 0. `Math.round(caffeineMg) mg`. Sub: `Math.round(caffeineMg / rangeDays) mg avg/day`.
- **Alcohol** (Activity icon) — only when total drinks > 0. `X.X drinks`. Sub: `X.X avg/day`.

### Observations (rule-based, factual — never medical advice)
A `useMemo` builds a string list. Each rule appends a sentence when its condition holds:
- Systolic BP trending **upward**/**downward** (when ≥2 BP readings and trend direction is rising/falling).
- Weight increased/decreased by `X.X kg` across the period (when ≥2 weight readings and |change| ≥ 0.1 kg).
- Fluid intake below the `+500 ml` target on `M of N day(s)` (when `daysTotal > 0` and below > 0). The observation/chart string hardcodes `+500 ml` (`FLUID_TARGET_ML`), but the underlying `daysAboveTarget` day-classification compares `intakeMl >= target` where `target = urinationEstimatedMl + 500` (i.e. output-relative, not a flat 500).
- Average daily water (`N ml`) is below your `{waterGoal} ml` goal (when total water > 0 and avg < goal).
- Average daily sodium (`N mg`) is above your `{saltLimit} mg` limit (when total salt > 0 and avg > limit).
- Average daily sugar (`N g`) is above your `{sugarLimit} g` limit (when sugar enabled, total > 0, avg > limit).
- Average daily potassium (`N mg`) is below your `{potassiumLimit} mg` target — note potassium estimates are rough (when potassium enabled, total > 0, limit > 0, avg < limit). **No over-limit warning** for potassium — only the below-target deficit case.

### Trend charts (Recharts)
- **Blood Pressure** — `LineChart`, height 180. Two lines: systolic (`hsl(346 77% 50%)`) and diastolic (`hsl(330 65% 55%)`), strokeWidth 2, no dots. X-axis = `MMM D` date, Y-axis auto. Tooltip with custom card style. Only rendered when ≥1 BP reading.
- **Weight** — `LineChart`, height 180. One line `weight` (`hsl(160 84% 39%)`), strokeWidth 2, dots r=3. Y-axis domain `["dataMin - 1", "dataMax + 1"]`. Tooltip formatter `X.X kg`. Only when ≥1 weight reading.
- **Daily Fluid Balance** — `BarChart`, height 180. Bars `balance` (`hsl(199 89% 48%)`, radius `[2,2,0,0]`). X = `date.slice(5)` (MM-DD). Two reference lines: y=0 (border color) and y=500 (`hsl(160 84% 39%)`, dashed) marking the `FLUID_TARGET_ML` visual target. Tooltip formatter `N ml`. Only when ≥1 fluid-balance day. (Note: the dashed line is a flat +500 marker, but the "days on target" count uses an output-relative per-day target — see business rules.)

### AI Insights card (AiInsightsCard)
On-demand AI narrative of the last **30 days** of tracked data. Two flavours:
- **Fast analysis** — synchronous Sonnet summary (typically returns in seconds). Cached to IndexedDB on success. (The "~10s" figure is only a JSDoc code comment — it does **not** appear in any user-facing copy.) Fast mode never web-searches: the route sends only `[INSIGHT_TOOL]` (no web_search tool), with `max_tokens: 2048`, `temperature: 0.3`, and `tool_choice` forced to `analytics_insight`.
- **Deep analysis** — Opus 4.6 + web search, submitted as an Anthropic batch job; returns minutes later (typically 3–10 min). User may close the page and return; job state survives reload via localStorage + server-side Postgres `insight_jobs`. On completion the server has already persisted the report and a sync pull surfaces it locally.

Card content:
- Latest report shown as a tappable one-row **preview** (relative time, optional "Deep" badge, 2-line clipped narrative, "Read" affordance). When none exist: prompt text `Generate an AI summary of your last 30 days of tracked data.`
- Deep-job **in-progress banner** (violet) when a deep job is pending, with relative "Started X ago" and copy that swaps after a long-run threshold.
- Two buttons: **Fast analysis** and **Deep analysis** (each opens a confirm dialog spelling out exactly what data is sent).
- **"Personalised with your medical profile."** note when conditions or medications sharing is on.
- **Previous summaries (N)** collapsible — list of older report previews.
- A **reading dialog** opens the full report (narrative + observations bullets + sources list).

Confirm dialog (per mode):
- Header/desc differs fast vs deep. Deep shows an amber **cost warning** ("a costly request… roughly 10–20× the cost… 3–10 minutes").
- **Tracked data (last 30 days)** checklist — built dynamically from enabled trackers; each item framed as conditional ("included only when the window holds enough data").
- **Your medical profile** section — Conditions (check/X + comma-joined list) and Medications (check/X) reflecting profile opt-ins.
- **Compare with history** checkbox (only when a prior report exists) — sends previous summary text so AI can describe what changed.
- Privacy footer: "Only aggregated numbers are sent — individual entries, notes, and timestamps never leave your device." (plus extra line when including previous).
- Footer buttons: **Cancel** / **Generate insights** | **Regenerate** | **Start deep analysis**.

Result handling: deep completion fires a success toast ("Deep analysis ready"); failed/expired fires a destructive toast; both reset the hook's sticky state.

### Food nutrient check card (NutrientAnalysisCard)
On-demand AI scan of the eating log for nutrient biases (e.g. "too much potassium", "low fiber"). Sends only food **descriptions + portions in grams** — no timestamps, no PII, no other categories. Server redacts common PII (emails, phone numbers, ID-like sequences) before the model sees descriptions. The model may web-search unrecognised branded/regional items (scan takes ~5–15s). **Results are session-only** (in-memory React state, not persisted to Dexie).

Card content:
- Latest scan preview (relative time, optional focus badge, 2-line clipped summary, "Read"). When none: explainer text.
- "Personalised with your medical profile (conditions + medications | conditions | medications)." note when sharing is on.
- Count line: `N food entr(y/ies) in the last 30 days` + a **Focus a nutrient / Hide focus** toggle.
- Focus **Input** (when expanded) — placeholder `e.g. potassium, iron, fiber`, max 200 chars.
- **Analyze** button — label varies: `Analyzing…` / `No food entries yet` / `Run another scan` / `Analyze nutrient balance`.
- **Previous scans (N)** collapsible.
- Confirm dialog ("What goes into this scan") — food-data checklist (count + what's excluded), Focus echo (`Findings will lead with: {focus}` — shown only when `focus.trim() !== ""`, displaying the trimmed value), medical-profile section, server-redaction footer.
- Reading dialog — summary + findings list (each: nutrient name + status badge + detail + "From: foods") + amber **Caveats** box + "Observational only — not medical advice" disclaimer.

---

## User actions & interactions

### SummaryTab
- **Scroll** the column of cards/charts.
- **Hover/touch chart points** → Recharts tooltip with exact values.
- All KPI cards, observations, and charts are **read-only** (no taps).
- (Time range is changed by the parent page's selector, not within this tab.)

### AI Insights card
- **Tap "Fast analysis"** → opens fast confirm dialog.
- **Tap "Deep analysis"** → opens deep confirm dialog.
- In confirm dialog: **toggle "Include my previous summary"** checkbox (only if a prior report exists); **Cancel**; **Generate insights / Regenerate / Start deep analysis** (triggers the request).
- **Tap latest report preview** → opens reading dialog with full report.
- **Tap "Previous summaries (N)"** → expand/collapse history list; tap any history row → reading dialog.
- **Tap source link** in reading dialog → opens URL in new tab (only when http/https; otherwise rendered as inert text).
- **Close reading dialog** (overlay/X) → returns to card.
- Deep job: user may **navigate away / reload** while pending — polling resumes on return.

### Food nutrient check card
- **Tap "Focus a nutrient" / "Hide focus"** → reveal/hide the focus input.
- **Type focus** (≤200 chars).
- **Tap Analyze button** → opens "What goes into this scan" confirm dialog.
- In confirm dialog: **Cancel**; **Run scan / Start analysis** (fires the fetch).
- On success the scan auto-opens in the reading dialog.
- **Tap latest/previous scan preview** → reading dialog.
- **Tap "Previous scans (N)"** → expand/collapse.

---

## States & presentations

### SummaryTab
- **Default (has data):** AI cards + KPI grid + observations + charts.
- **Empty (no data at all):** when `records.length === 0 && bpReadings.length === 0 && weightReadings.length === 0` → a centered empty state: `BarChart3` icon (opacity 50), `No data for this period`, `Log entries or widen the time range to see your summary.` — **plus the NutrientAnalysisCard still renders below it** (it uses its own 30-day window and may still have food entries).
- **Loading:** no skeleton/spinner — `useLiveQuery` hooks return populated default objects (empty arrays / zeros), so the tab renders instantly with `—` / `0` values rather than a loading state.
- **Partial data:** individual charts/cards self-hide when their series is empty; KPI cards show `—` / `No readings`.
- **Over-limit / below-target:** surfaced as observation sentences (sodium/sugar over-limit, water/potassium below target), not as colored UI.

### AI Insights card
- **No report yet:** prompt text + primary "Fast analysis" button (variant `default`).
- **Has latest report:** preview row shown; Fast button becomes `outline`, "Regenerate" wording in dialog.
- **Fast pending:** Fast button reads `Analysing…`, both buttons disabled.
- **Deep submitting:** Deep button shows spinner + `Submitting…`.
- **Deep pending:** violet in-progress banner; Deep button shows spinner + `In progress`; Fast button disabled.
- **Deep long-running** (> 15 min): banner copy swaps to "Taking longer than usual — still working in the background…".
- **Deep completed:** only treated as completed when the body has status `completed` **and** non-empty `narrative` **and** `observations`; then success toast, result appears via live query, hook resets to idle. A `completed` body missing `narrative`/`observations` falls through to the "unrecognised shape → keep polling" branch rather than being surfaced as a (blank) completion.
- **Deep failed / expired:** destructive toast ("Deep analysis failed" / "Deep analysis timed out"); resets to idle.
- **Not-enough-data error:** toast "Not enough data".
- **Deep job 404 on poll:** state → failed with "job was not found… may have been cleared".
- **Personalised:** extra "Personalised with your medical profile." line.
- **History present:** collapsible (expanded/collapsed states with rotating chevron).
- **Deep badge:** violet pill with Search icon on deep-mode previews and reading-dialog title.
- **Reading dialog:** scrollable (max-h 85vh); empty observations/sources sections are omitted.

### Food nutrient check card
- **No food entries:** button disabled, reads `No food entries yet`; explainer text shown.
- **Has entries, no scan yet:** primary "Analyze nutrient balance" button.
- **Pending:** spinner + `Analyzing…`, button disabled, focus input disabled.
- **Has scan:** preview row; button becomes `outline` "Run another scan".
- **Error (429):** toast "Try again in a minute".
- **Error (422):** raised when the model never returns the structured tool even after the server's retry (see below) — surfaced via the generic "Couldn't analyze your food log" toast.
- **Error (other / network):** toast "Couldn't analyze your food log".
- **Focus collapsed/expanded:** input hidden/shown; toggle label + chevron flip.
- **Status badges** per finding: High (amber), Low (sky), Balanced (emerald).
- **Caveats** box: amber, with AlertCircle icon — only when caveats exist.

### Card chrome (all)
- Cards use `bg-white/80 dark:bg-slate-900/50` with slate borders. Full dark-mode variants throughout. Violet/emerald accent colors for AI/food respectively.

---

## Enums, options & configurable values

### Time scope presets (parent selector, `SCOPE_OPTIONS`)
`24h`, `7d`, `30d`, `90d`, `All` → `TimeScope = "24h" | "7d" | "30d" | "90d" | "all"`. Mapped to ranges aligned to calendar-day boundaries; `all` → `start = 0`. The selector ALSO renders a separate hardcoded **Custom** button (date-range inputs) that is *not* in `SCOPE_OPTIONS`; the page resolves `effectiveRange = customRange ?? scopeRange`, so a user-set custom range can also drive the tab.

### Insights window
`INSIGHTS_WINDOW_DAYS = 30` (AI Insights always analyses a rolling 30-day window ending now). Nutrient card `WINDOW_DAYS = 30`.

### Insight report modes
`mode: "fast" | "deep"` (defaults to `"fast"`).

### Deep-job state machine (`DeepJobState`)
`idle | submitting | pending | completed | failed | expired`. Poll interval `DEEP_POLL_INTERVAL_MS = 30_000`. Long-run threshold `DEEP_LONG_RUN_THRESHOLD_MS = 15 * 60 * 1000`. localStorage key `insight-deep-job-pending`.

### Deep route server caps (`insights/deep/route.ts`)
`DEEP_MAX_TOKENS = 4096`, `DEEP_WEB_SEARCH_MAX_USES = 12`. The deep system prompt **requires ≥2 `web_search` queries** before the model may call `analytics_insight`. Exactly **one pending deep job per user** is enforced by a DB unique index. The submission endpoint is rate-limited (`createRateLimiter(10)`); the polling endpoint is intentionally cheap and **not** rate-limited.

### Domains (`DOMAINS`)
`water, salt, sugar, potassium, weight, bp, eating, urination, defecation, caffeine, alcohol, medication`.

### Domain labels (insights prompt)
water→"water intake", salt→"sodium intake", sugar→"sugar intake", potassium→"potassium intake", weight→"weight", bp→"blood pressure", eating→"eating", urination→"urination", defecation→"defecation", caffeine→"caffeine intake", alcohol→"alcohol intake", medication→"medication adherence".

### Trend direction
`"rising" | "falling" | "stable"`. Confidence 0–1. `confidence < 0.3` → described as "no clear trend (low-confidence fit)". Arrow icons: rising→TrendingUp, falling→TrendingDown, stable→Minus.

### Correlation strength
`"strong" | "moderate" | "weak" | "none"`. `pairedDays < 3` treated as insufficient data, not "no relationship".

### Phase types (medication context)
`"maintenance" | "titration"`.

### Nutrient finding status
`"high" | "low" | "balanced"` → badges High (amber) / Low (sky) / Balanced (emerald).

### Optional trackers
`OptionalTrackerKey = "sugar" | "potassium"`. Defaults: `sugar: true`, `potassium: false`. Disabled trackers are dropped from snapshot, KPI grid, observations, and AI tracked-data list. Enabled state is read via the reactive `useOptionalTrackerEnabled(key)` hook; a non-reactive `getOptionalTrackerEnabled(key)` snapshot (reads `useSettingsStore.getState()`) also exists for one-shot reads inside callbacks.

### Intake goals / limits (defaults + clamps, from settings-store)
- `waterLimit`: default **1000** ml (clamp 100–10000).
- `saltLimit`: default **1500** mg (clamp 100–10000).
- `sugarLimit`: default **30** g (clamp 5–500).
- `potassiumLimit`: default **3500** mg, WHO adequate intake (clamp 100–20000). Treated as a soft target.

### Constants in SummaryTab
- `FLUID_TARGET_ML = 500` (fluid-balance daily target / reference line).
- `MS_PER_DAY = 86_400_000`.
- `CHART_MARGIN = { top: 5, right: 5, left: -20, bottom: 0 }`, chart height 180.
- Chart colors: systolic `hsl(346 77% 50%)`, diastolic `hsl(330 65% 55%)`, weight/target `hsl(160 84% 39%)`, fluid bar `hsl(199 89% 48%)`.

### AI Insights tooltip / model copy
- Deep model named "Opus 4.6" in dialog copy — and this is genuinely accurate, not just marketing: the deep route's backing model is really `claude-opus-4-6` (`CLAUDE_MODELS.premium`). No fast-mode timing text is rendered anywhere; only the deep amber box surfaces timing ("typically 3-10 minutes … roughly 10-20× the cost of a fast summary").
- Tracked-data list items: Water intake; Salt / sodium intake; (Sugar intake); (Potassium intake); Blood pressure readings; Weight readings; Fluid balance (in vs. out); Correlations (salt vs. weight\[, sugar vs. weight]\[, potassium vs. weight], caffeine & alcohol vs. blood pressure); "Your water goal, sodium limit\[, sugar limit]\[ & potassium target]".

### Correlation lag defaults (`analytics-types`)
`DEFAULT_SALT_WEIGHT_LAG_DAYS = 2`, `DEFAULT_SUGAR_WEIGHT_LAG_DAYS = 2`, `DEFAULT_POTASSIUM_WEIGHT_LAG_DAYS = 2`.

### Urination volume estimates (feed fluid balance)
`small: 150`, `medium: 300`, `large: 500` (ml).

### Insight response contract caps (`analytics-insights`)
`summary` 1–4000 chars; `observations` ≤16 items, each 1–2000 chars; `sources` ≤30 URLs. Prompt asks for 2–4 sentence summary (3–5 deep), 3–6 observations (4–8 deep). `priorAssessments` ≤3.

### Nutrient route schema caps (`nutrient-analysis/route.ts`)
Request: `windowDays` 1–90; `focus` ≤200 chars; `foods` 1–500 items, each `description` 1–300 chars and `grams` 0–10000 (optional); `conditions` ≤20 (each ≤120); `medications` ≤40. Response: `summary` ≤4000; `findings` ≤20 (each `detail` ≤2000, `exampleFoods` ≤12 of ≤200 chars); `caveats` ≤8 (each ≤600).

---

## Data model touched

**Reads (Dexie, via live queries / services):**
- `intakeRecords` (water/salt/sugar/potassium `amount`), `eatingRecords`, `urinationRecords`, `defecationRecords`, `substanceRecords` (caffeine `amountMg`, alcohol `amountStandardDrinks`) — aggregated by `useRecordsTabData(range)` into a unified `{ type, record }[]`.
- `bloodPressureRecords` → `useBPTrend` (systolic/diastolic/heartRate/position, trend, avg).
- `weightRecords` → `useWeightTrend` (readings, trend, avg/min/max).
- Fluid balance derived from intake + urination → `useFluidBalance` (`daily[]`, `avgBalance`, `daysAboveTarget`, `daysTotal`).
- `eatingRecords` (nutrient card) via `useEatingRecordsByDateRange` — uses `originalInputText`/`note` and `grams`. The hook guards `startTime < endTime`, returning `[]` (no query) when the range is empty/inverted.
- `prescriptions` / `medicationPhases` / `phaseSchedules` via `buildMedicationSummary` (active rx → active phase → enabled, non-deleted schedules → dosages + day-of-week union → frequency string).
- User profile (`useUserProfile`): `shareConditionsWithAI`, `conditions`, `shareMedicationsWithAI`.
- Settings store: `waterLimit`, `saltLimit`, `sugarLimit`, `potassiumLimit`.

**Writes:**
- `insightReports` (Dexie, schema indexes `id, generatedAt, updatedAt`) via `saveInsightReport` → `writeWithSync` + `schedulePush`. Fields: `id, generatedAt, rangeStart, rangeEnd, narrative, observations[], sources?[], personalised, mode("fast"|"deep"), createdAt, updatedAt, deletedAt, deviceId`.
- Deep jobs: server-side Postgres `insight_jobs` / `insight_reports`; client stores `{ jobId, startedAt }` in localStorage; on completion `schedulePull()` syncs the report into Dexie.

**API:**
- `POST /api/analytics/insights` (fast), `POST /api/analytics/insights/deep` (deep submit), `GET /api/analytics/insights/jobs/:id` (poll), `POST /api/ai/nutrient-analysis` (food scan).
- Request schema (`AnalyticsInsightsRequestSchema`): `range`, optional `profile {conditions[], medications[]}`, optional `priorAssessments[]`, `metrics {bp?, weight?, fluidBalance?, intake?, correlations?[]}` — at least one metric group required.

---

## Validation, edge cases & business rules

- **Per-day divisor (`rangeDays`):** when range has a real start, `round((end-start)/MS_PER_DAY)` (min 1); for the `all` preset (`start === 0`), uses the count of distinct active days seen in records (min 1). All "avg/day" KPI values divide by this.
- **Empty-state gating** separates "no records and no BP and no weight" from per-card emptiness. The nutrient card always renders regardless of the page range.
- **Snapshot emptiness:** `snapshotIsEmpty` → `NotEnoughDataError` thrown **before any network call** when no metric group survives.
- **Optional tracker gating:** sugar/potassium data, correlations, KPI cards, observations, and AI tracked-data list all gate on the enabled flags; disabled trackers are entirely excluded from the snapshot.
- **Potassium asymmetry:** observation only warns when **below** target (deficit), never over-limit; snapshot frames it as a "soft target" with a "estimates are rough" caveat.
- **Intake metric inclusion** requires `waterGoalMl > 0 && sodiumLimitMg > 0` and at least one of water/salt/sugar/potassium having data. Optional intake fields included only when enabled AND limit > 0.
- **Trend confidence:** `< 0.3` rendered as inconclusive; KPI trend arrow only shows with ≥2 readings.
- **Weight change** threshold for an observation: |Δ| ≥ 0.1 kg; weight readings sorted by timestamp before computing first/last delta.
- **Correlation rules (prompt):** `pairedDays < 3` = insufficient, not "no relationship"; "correlation is not causation"; coefficient clamped −1…1; confidence clamped 0…1.
- **AI safety prompt:** factual only, never diagnose or recommend treatment/medication/dosage; neutral non-alarming tone; if a reading is notable, state the number and suggest discussing with a healthcare provider; compare against most recent prior assessment when supplied.
- **PII protection:** insights snapshot is aggregate-only by construction (no raw records/notes/timestamps). Nutrient scan sends only food descriptions + grams; server redacts emails/phones/ID-like sequences. Prior-assessment free text only sent on explicit opt-in.
- **Nutrient route two-turn retry:** if the first model turn finishes with prose instead of a tool call, the server issues a **follow-up call** with `tool_choice` forced to `report_nutrient_analysis` to re-request the structured tool. Only if that second turn still has no tool block does it return **422** ("The AI didn't return a structured response"); a tool block whose input fails schema validation also returns 422 ("didn't match the expected shape").
- **Source-link XSS guard:** model-generated URLs only become clickable anchors for `http:`/`https:`; `javascript:`/`data:`/unparseable schemes render as inert muted text with an "Unsafe URL scheme" title. Hostname pretty-print strips `www.`, falls back to raw URL.
- **Deep job resilience:** polling treats non-404 failures as transient and keeps retrying; 404 → failed; unrecognised body shape → keep polling rather than wedge UI. Any pre-submit throw resets state to `idle` so the button is re-clickable. Long-run wording recomputes each minute via a forced tick.
- **Malformed 200 from insights API** must fail loudly (not be cached as a blank insight). Cache write failures are swallowed so a paid result is never discarded over a storage error.
- **Focus input** capped at 200 chars; medication summary capped at 40 entries; conditions ≤20.
- **Nutrient scans are not persisted** — they live only in component state for the session (lost on reload), unlike AI insights which are cached + synced.
- **Day-of-week** mapping for medication frequency: `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]`; ≥7 distinct days → "daily", else lists day names; 1/2/N schedules → "once"/"twice"/"Nx".

---

## Sub-components / variants

- **`SummaryTab`** — orchestrates the whole tab; aggregates records, computes KPIs/observations, renders charts.
- **`KpiCard`** — single stat tile (icon, label, mono value, optional trend arrow + sub-line).
- **`TrendArrow`** — rising/falling/stable arrow icon.
- **`ChartSection`** — titled card wrapper around a Recharts chart.
- **`AiInsightsCard`** — AI narrative generator (fast/deep), history, dialogs.
- **`ReportPreview`** — one-row tappable teaser for a cached report (time, deep badge, clipped narrative).
- **`ReportContent`** — full report body (narrative + observations + sources) for the reading dialog.
- **`SourceLink`** — safe/inert rendering of a model-generated source URL.
- **`NutrientAnalysisCard`** — AI food-nutrient scan (session-only), focus input, history, dialogs.
- **`ScanPreview`** — one-row tappable teaser for a scan (time, focus badge, clipped summary).
- **`ScanContent`** — full scan body (summary + findings + caveats + disclaimer).
- **`StatusBadge`** — High/Low/Balanced nutrient finding badge.
- **`use-insights.ts`** hooks: `useInsightReports` (live history), `useGenerateInsights` (fast mutation), `useDeepInsightJob` (submit/poll/reset state machine), `NotEnoughDataError`.
- **`analytics-insights.ts`** — request/response Zod schemas, `INSIGHT_TOOL`, `INSIGHTS_SYSTEM_PROMPT`, `buildInsightsPrompt`.
