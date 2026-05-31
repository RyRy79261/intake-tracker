# 26 — Analytics Engine (Services)

**Files covered:**
- `src/lib/analytics-service.ts`
- `src/lib/analytics-registry.ts`
- `src/lib/analytics-stats.ts`
- `src/lib/analytics-snapshot.ts`
- `src/lib/analytics-types.ts`
- `src/lib/analytics-insights.ts`
- `src/lib/insight-report-service.ts`
- `src/lib/server/insight-job-service.ts`
- `src/hooks/use-analytics-queries.ts`
- `src/hooks/use-insights.ts`
- `src/app/api/analytics/insights/route.ts`
- `src/app/api/analytics/insights/deep/route.ts`
- `src/app/api/analytics/insights/jobs/[id]/route.ts`

**Purpose:** The headless computation layer behind the analytics/history UI. It normalizes every tracked health domain into a uniform `DataPoint` time series, runs a registry of pre-built analytical queries (fluid balance, adherence, BP/weight trends, lagged correlations) plus statistics primitives (moving average, linear-regression trend, Pearson correlation, anomaly detection), reduces them to a privacy-safe numeric snapshot, and orchestrates a two-tier AI "Insights" narrative (fast sync Sonnet + async deep Opus-with-web-search batch jobs) persisted as a history of reports.

---

## Features

### Domain normalization (building blocks)
- **`getRecordsByDomain(domain, range)`** — fetches records for any of 12 domains from the relevant service/Dexie table and maps each to a uniform `DataPoint { timestamp, value, label? }`. Per-domain value semantics:
  - `water` → intake `amount` in **ml**
  - `salt` → intake `amount` in **mg** (sodium)
  - `sugar` → intake `amount` in **g**
  - `potassium` → intake `amount` in **mg**
  - `weight` → `weight` in **kg**
  - `bp` → `systolic` in **mmHg** (only systolic feeds the generic series)
  - `urination` → estimated volume in **ml** from `amountEstimate` lookup (`small`=150, `medium`=300, `large`=500; default 300 when missing)
  - `eating` → constant **1** per event (count semantics)
  - `defecation` → constant **1** per event (count semantics)
  - `caffeine` → `amountMg` in **mg** (0 if absent)
  - `alcohol` → `amountStandardDrinks` (0 if absent)
  - `medication` → returns **empty array** (no single numeric value)
- **`groupByDay(points)`** — buckets `DataPoint[]` into a `Map<"yyyy-MM-dd", DataPoint[]>` by calendar date (uses `date-fns format`, local midnight boundaries).
- **`correlate(domainA, domainB, range, lagDays?)`** — fetches both domains in parallel and runs day-aligned Pearson correlation with optional lag.

### Statistics primitives (`analytics-stats.ts`)
- **`movingAverage(data, windowSize)`** — sliding-window mean; returns `null` for the first `windowSize-1` positions (insufficient lookback). Returns `[]` for empty data or `windowSize <= 0`.
- **`trend(points)`** — linear-regression trend on index-normalized values. Returns `{ slope, direction, confidence }` where confidence = clamped R² (0..1). Direction rules: `stable` if `≤1` point, or if confidence `< 0.3` (MIN_TREND_CONFIDENCE); else `rising` if slope `> 0.01`, `falling` if slope `< -0.01`, else `stable`.
- **`correlateTimeSeries(seriesA, seriesB, lagDays=0)`** — averages each series by local day key, lag-shifts A's dates forward by `lagDays`, pairs overlapping days, and computes `sampleCorrelation`. Returns `{ coefficient, strength, seriesA, seriesB, pairs, pairedDays, lagDays }`.
- **`detectAnomalies(points, zThreshold=2.0)`** — returns points whose absolute z-score exceeds the threshold. Empty if `< 2` points or zero standard deviation.
- **`computeRegression(points)`** — returns `{ slope, intercept, predict(x) }`. Identity-zero result for `< 2` points.

### Pre-built queries (`analytics-service.ts`)
Each returns the `AnalyticsResult<T>` envelope `{ value, unit, period, dataPoints, meta? }`.
- **`fluidBalance(range)`** — daily water-intake vs estimated-urination output, intraday running cumulative balance, average balance, count of days at/above target, total days. Daily `target = urinationEstimatedMl + 500` ml.
- **`adherenceRate(range, prescriptionId?)`** — medication taken/scheduled ratio with per-day breakdown, optionally filtered to one prescription.
- **`bpTrend(range)`** — systolic & diastolic averages, per-channel regression trend, and full readings (incl. heartRate, position).
- **`weightTrend(range)`** — average, min, max, regression trend, and readings.
- **`saltVsWeight` / `sugarVsWeight` / `potassiumVsWeight(range, lagDays=2)`** — lagged Pearson correlation of each nutrient vs weight (default lag 2 days).
- **`caffeineVsBP(range)`** — caffeine (mg) vs systolic BP, no lag.
- **`alcoholVsBP(range)`** — alcohol (standard drinks) vs systolic BP, no lag.

### Query registry (`analytics-registry.ts`)
- A `queryRegistry: QueryDescriptor[]` of 10 self-describing queries with `id`, `name`, `description`, `category`, a zod `parameters` schema, and an `execute(params)` runner. Designed for AI discovery and generic invocation.
- **`getQueryById(id)`** — lookup by id.
- **`listQueries()`** — minimal metadata list (`id`, `name`, `description`, `category`) for AI discovery.

### Reactive query hooks (`use-analytics-queries.ts`)
- Dexie `useLiveQuery` wrappers (`useFluidBalance`, `useAdherenceRate`, `useBPTrend`, `useWeightTrend`, `useSaltVsWeight`, `useSugarVsWeight`, `usePotassiumVsWeight`, `useCaffeineVsBP`, `useAlcoholVsBP`, `useCorrelation`) — each seeded with a non-loading default value so the UI renders instantly with zeros instead of a spinner, then re-renders live when underlying IndexedDB data changes.
- **`useTimeScopeRange(scope)`** — converts a `TimeScope` preset into a concrete calendar-day-aligned `TimeRange` (memoized).

### Privacy-safe snapshot (`analytics-snapshot.ts`)
- **`buildAnalyticsSnapshot(range, goals, conditions?, includeMedications?, enabledTrackers?)`** — runs the predefined queries against local IndexedDB and reduces them to an aggregate-only `AnalyticsInsightsRequest` (numbers/enums only — no raw records, notes, or free text leave the device). Metric groups with no data are omitted. Disabled optional trackers (sugar/potassium) are skipped entirely (queries short-circuit to `[]`/`null`).
- **`buildMedicationSummary()`** — summarizes active prescriptions: generic name, phase type, dose string, derived dosing frequency, and days-on-phase (capped at 40 meds).
- **`insightsRange(now?)`** — the rolling 30-day analysis window (`INSIGHTS_WINDOW_DAYS = 30`).
- **`snapshotIsEmpty(req)`** — true when no metric group survived (nothing to summarise).

### AI Insights contract & prompt (`analytics-insights.ts`)
- Zod request schema (`AnalyticsInsightsRequestSchema`), response schema (`InsightResponseSchema`), the Anthropic tool definition (`INSIGHT_TOOL` = `analytics_insight`), the system prompt (`INSIGHTS_SYSTEM_PROMPT`), and `buildInsightsPrompt(req)` which renders the validated numeric snapshot into a plain-text briefing (only present metric groups are rendered).

### Two-tier insight generation
- **Fast path** (`/api/analytics/insights`, `useGenerateInsights`) — synchronous, Claude **quality** model (Sonnet-tier), `max_tokens: 2048`, `temperature: 0.3`, forced tool call. Returns narrative immediately and caches it.
- **Deep path** (`/api/analytics/insights/deep` + polling `/jobs/[id]`, `useDeepInsightJob`) — async Anthropic **Message Batch** with the **premium** model (Opus), web-search tool (`max_uses: 12`), `max_tokens: 4096`. Returns a `jobId` immediately (202); the client polls every 30s. Batches survive disconnect/reload and cost 50% of standard pricing, with a 24h SLA.

### Report history (`insight-report-service.ts`)
- Persists every generated report to the Dexie `insightReports` store (synced to Neon). CRUD: `getInsightReports`, `getLatestInsightReport`, `saveInsightReport`, `deleteInsightReport` (soft delete). `useInsightReports()` exposes the live history newest-first.

### Server job lifecycle (`server/insight-job-service.ts`)
- CRUD for `insight_jobs` (Neon Postgres). Enforces **one pending job per user** (partial unique index → `PendingJobConflictError` → HTTP 409). Reserves the slot before paying for a batch; attaches batch id afterward; finalizes via compare-and-set on `status='pending'` to handle concurrent pollers.

---

## User actions & interactions

The engine is a service layer; user-facing actions flow through the analytics UI but resolve here:

- **Select a time scope** → `useTimeScopeRange` recomputes the `TimeRange`; every live query re-runs against the new window.
- **Open any analytics tab/chart** → corresponding `useLiveQuery` hook fires, computing the result reactively; live re-render on data change.
- **Add/edit/delete any tracked record anywhere in the app** → IndexedDB change propagates through `useLiveQuery`; all open analytics views recompute automatically (no manual refresh).
- **Adjust correlation lag (lagDays)** → re-runs `correlate`/`saltVsWeight`/etc. with the new lag; pairing and coefficient recompute.
- **Filter adherence by prescription** → passes `prescriptionId` to `useAdherenceRate`; recomputes against that prescription's slots only.
- **Tap "Generate Insights" (fast)** → `useGenerateInsights` builds the snapshot, throws `NotEnoughDataError` if empty (no network call), POSTs, validates, caches the report, returns the narrative.
- **Tap "Deep Analysis"** → `useDeepInsightJob.submit()` builds the snapshot, POSTs to the deep endpoint, stores `jobId` in localStorage, begins 30s polling. Card shows submitting → pending → completed/failed. Any pre-submit throw (empty snapshot / `NotEnoughDataError`, Dexie read, fetch error, non-OK response) resets the state to `idle` (not `failed`) and re-throws the error, leaving the card re-clickable — so on the deep path `NotEnoughDataError` surfaces as idle + thrown error, distinct from the fast path.
- **Opt in to share conditions / medications / previous summary** → toggles whether `profile.conditions`, `profile.medications`, and `priorAssessments` are attached to the snapshot.
- **Close/reload the tab during a deep job** → polling resumes on mount from the localStorage `jobId`; the server-persisted report is pulled into the local cache via `schedulePull()` once complete.
- **Dismiss a completed/failed deep banner** → `useDeepInsightJob.reset()` clears state and the stored job id.
- **Delete a cached insight report** → `deleteInsightReport` soft-deletes (sets `deletedAt`), removed from the live history list, change synced.

---

## States & presentations

(Engine states the UI must represent.)

- **Default / instant** — every analytics hook ships a zeroed default value (`DEFAULT_FLUID_BALANCE`, `DEFAULT_ADHERENCE`, `DEFAULT_BP_TREND`, `DEFAULT_WEIGHT_TREND`, `DEFAULT_CORRELATION` with `EMPTY_RANGE {start:0,end:0}`), so there is **no loading spinner** for local queries — UI renders zeros immediately, then live-updates.
- **Empty data** — a query with no records returns zeros / empty arrays / `pairedDays: 0`. Trend `direction: "stable"`, `confidence: 0`. Correlation `strength: "none"`, `coefficient: 0`.
- **Insufficient correlation data** — fewer than 3 paired days returns `strength: "none"`, `coefficient: 0` but populated `pairs` and `pairedDays` (UI should label "insufficient data", NOT "no relationship").
- **Low-confidence trend** — R² `< 0.3` forces `direction: "stable"` regardless of slope (treated as inconclusive).
- **Over/under target (fluid balance)** — each day flagged `intakeMl >= target`; `daysAboveTarget` vs `daysTotal`; per-day `balance` can be negative (deficit).
- **Insights: not-enough-data** — `snapshotIsEmpty` → `NotEnoughDataError` thrown client-side before any network call.
- **Insights fast: success** — `{ narrative, observations, generatedAt }` returned and cached.
- **Insights fast: errors** — `429` rate limit ("Rate limit exceeded"); `502` truncated (`code: RESPONSE_TRUNCATED`, "AI response was cut off…"); `502` "AI response format invalid"; `502` "Failed to generate insights".
- **Deep job: submitting** — `{ status: "submitting" }` (button locked).
- **Deep job: pending** — `{ status: "pending", jobId, startedAt }`; client polls every 30s; survives reload via localStorage.
- **Deep job: completed** — `{ status: "completed", result: { narrative, observations, generatedAt } }`; triggers `schedulePull()`. The poll endpoint also returns `sources` on the completed response, but the client hook reads only `narrative`/`observations`/`generatedAt` into the completed state and drops the poll-returned `sources`, relying on the sync pull to fetch the full report (incl. sources) from the server.
- **Deep job: failed** — `{ status: "failed", error }` (batch errored, malformed/truncated output, validation failure, no results, job-not-found 404). The poll endpoint's `respondCompleted` adds two further terminal `failed` messages: "Job marked completed but has no result reference." (job flagged completed without a `resultReportId`) and "Cached result for this job is no longer available." (the referenced report can't be fetched).
- **Deep job: expired** — `{ status: "expired", error: "Batch exceeded the 24-hour SLA without completing." }`.
- **Deep job: conflict** — second submit while one pending → HTTP 409 `code: PENDING_JOB_EXISTS`.
- **Offline / sync** — all local queries run fully offline against IndexedDB. AI insight endpoints require network; reports persist via `writeWithSync` and back up/sync like any record. Completed deep reports propagate to the device on the next/forced sync pull.
- **Personalised vs generic** — `personalised: true` when conditions or medications fed the analysis (drives a "personalised" badge); reports carry `mode: "fast" | "deep"`.

---

## Enums, options & configurable values

### Domains (`DOMAINS`, 12)
`water`, `salt`, `sugar`, `potassium`, `weight`, `bp`, `eating`, `urination`, `defecation`, `caffeine`, `alcohol`, `medication`

### Domain labels (`DOMAIN_LABELS`, for prompt)
water→"water intake", salt→"sodium intake", sugar→"sugar intake", potassium→"potassium intake", weight→"weight", bp→"blood pressure", eating→"eating", urination→"urination", defecation→"defecation", caffeine→"caffeine intake", alcohol→"alcohol intake", medication→"medication adherence"

### Time scopes (`TimeScope`)
`24h`, `7d`, `30d`, `90d`, `all` — mapped to calendar-day-aligned ranges: 24h = start of today; 7d = start of 6 days ago; 30d = 29 days ago; 90d = 89 days ago; all = epoch 0. End is always `endOfDay(now)`. Default fallback = 7d.

### Trend direction
`rising` | `falling` | `stable`. Thresholds: `MIN_TREND_CONFIDENCE = 0.3` (R² floor); slope cutoffs `±0.01`.

### Correlation strength
`strong` (|r| > 0.7) | `moderate` (> 0.4) | `weak` (> 0.2) | `none` (≤ 0.2 or insufficient/zero-variance). Min paired days for a meaningful coefficient = **3**.

### Urination volume estimates (`URINATION_ESTIMATE_ML`)
`small` = 150 ml, `medium` = 300 ml, `large` = 500 ml (default 300).

### Correlation lag defaults (days)
`DEFAULT_SALT_WEIGHT_LAG_DAYS = 2`, `DEFAULT_SUGAR_WEIGHT_LAG_DAYS = 2`, `DEFAULT_POTASSIUM_WEIGHT_LAG_DAYS = 2`. Default anomaly z-threshold = `2.0`.

### Fluid balance
Daily target = estimated urination output + **500 ml**.

### Query registry IDs / names / categories
- `fluid_balance` — "Fluid Balance" — **fluid**
- `adherence_rate` — "Medication Adherence" — **medication**
- `bp_trend` — "Blood Pressure Trend" — **vitals**
- `weight_trend` — "Weight Trend" — **vitals**
- `salt_vs_weight` — "Sodium vs Weight Correlation" — **correlation**
- `sugar_vs_weight` — "Sugar vs Weight Correlation" — **correlation**
- `potassium_vs_weight` — "Potassium vs Weight Correlation" — **correlation**
- `caffeine_vs_bp` — "Caffeine vs BP Correlation" — **correlation**
- `alcohol_vs_bp` — "Alcohol vs BP Correlation" — **correlation**
- `custom_correlation` — "Custom Domain Correlation" — **custom**

Query categories: `fluid` | `medication` | `vitals` | `correlation` | `custom`.

### Result units (`AnalyticsResult.unit`)
`ml` (fluid balance), `ratio` (adherence), `mmHg` (BP), `kg` (weight), `correlation` (all correlations).

### Insights / AI config
- Rolling window: `INSIGHTS_WINDOW_DAYS = 30`.
- Tool: `analytics_insight` (`INSIGHT_TOOL`). Forced (`tool_choice: { type: "tool" }`) on fast path; `auto` on deep path so web_search can run first.
- Fast path: `CLAUDE_MODELS.quality`, `max_tokens: 2048`, `temperature: 0.3`, rate limit 10.
- Deep path: `CLAUDE_MODELS.premium` (Opus), `DEEP_MAX_TOKENS = 4096`, `temperature: 0.3`, `WEB_SEARCH_TOOL` (whose base default is `max_uses: 5`) spread-overridden at the deep route to `DEEP_WEB_SEARCH_MAX_USES = 12`, rate limit 10, mandatory ≥2 web searches.
- Deep polling: `DEEP_POLL_INTERVAL_MS = 30_000`; localStorage key `insight-deep-job-pending`.
- Batch SLA: `BATCH_SLA_MS = 24h`.
- Response caps: `summary` 1–4000 chars; `observations` array max 16, each 1–2000 chars; `sources` max 30 URLs.
- Prior assessments: max 3; conditions max 20 (each ≤120 chars); medications max 40; correlations array max 12.
- Insight output guidance: fast = 3–6 observations; deep = 4–8 observations.
- Report `mode`: `fast` | `deep`. Medication `phaseType`: `maintenance` | `titration`.

### Job lifecycle statuses (`insight_jobs.status`)
`pending` | `completed` | `failed` | `expired`. Constants: `SERVER_DEVICE_ID = "server-deep-batch"`; deep report `mode = "deep"`; custom_id pattern `insight-<jobId>`.

### Day names (`DAY_NAMES`, for medication frequency)
`Sun, Mon, Tue, Wed, Thu, Fri, Sat` (index 0–6). Frequency words come from `count = schedules.length` (number of enabled, non-deleted schedules): 1→"once", 2→"twice", N→"Nx". The `daily` flag uses `dayUnion.size >= 7` (union of `daysOfWeek` across those schedules); otherwise the explicit day list is rendered from that same union.

---

## Data model touched

### Reads (Dexie tables, via services)
- `intakeRecords` (water/salt/sugar/potassium → `amount`, `timestamp`, `type`) via `intake-service`
- `weightRecords` (`weight`, `timestamp`) via `health-service`
- `bloodPressureRecords` (`systolic`, `diastolic`, `heartRate?`, `position`, `timestamp`) via `health-service`
- `urinationRecords` (`amountEstimate`, `timestamp`) via `urination-service`
- `eatingRecords` (`timestamp`) via `eating-service`
- `defecationRecords` (`timestamp`) via `defecation-service`
- `substanceRecords` (`type`, `amountMg?`, `amountStandardDrinks?`, `timestamp`) — read via an inline `db.substanceRecords` compound-index query (`[type+timestamp]`, wrapped in try/catch for older schema versions). A `substance-service.ts` with `getSubstanceRecordsByDateRange` does exist, but `analytics-service` keeps its own inline query and still carries a stale `// no substance-service exists yet` comment.
- Dose schedule via `getDoseScheduleForDateRange` (status `taken` etc.) from `doseLogs`/`phaseSchedules`
- `prescriptions` / `medicationPhases` / `phaseSchedules` (`getActivePrescriptions`, `getActivePhaseForPrescription`; schedule `dosage`, `daysOfWeek`, `enabled`, `deletedAt`, `unit`) for the medication summary

### Writes
- **`insightReports`** (Dexie store, schema v19; `sources` added v21, `mode` added v20). Fields: `id`, `generatedAt`, `rangeStart`, `rangeEnd`, `narrative`, `observations: string[]`, `sources?: string[]`, `personalised: boolean`, `mode?: "fast"|"deep"`, `createdAt`, `updatedAt`, `deletedAt: number|null`, `deviceId`. Written via `writeWithSync` + `schedulePush`.
- **`insight_jobs`** (Neon Postgres, server-only). Fields: `id`, `userId`, `batchId: string|null`, `status`, `requestPayload` (the validated `AnalyticsInsightsRequest`), `resultReportId: string|null` (FK → `insight_reports`), `error: string|null`, `createdAt`, `completedAt: number|null`. Partial unique index `insight_jobs_one_pending_per_user_uq`; status check constraint; indexes on (user, created) and batchId.
- **`insight_reports`** (Neon mirror of the Dexie store) — written server-side by `completeInsightJob` for deep reports (`deviceId = "server-deep-batch"`), then pulled to the device.
- `usersSync` — upserted (onConflictDoNothing) before a job insert to satisfy the FK when Neon Auth replication lags.

### Core types (`analytics-types.ts`)
`Domain`, `TimeScope`, `TimeRange {start,end}`, `DataPoint {timestamp,value,label?}`, `AnalyticsResult<T> {value,unit,period,dataPoints,meta?}`, `FluidBalanceDay`, `FluidBalanceResult`, `AdherenceResult`, `TrendDirection`, `BPTrendResult`, `WeightTrendResult`, `CorrelationResult`, `TitrationReport`.

---

## Validation, edge cases & business rules

- **Privacy by construction:** the snapshot is numeric/enumerated only — no raw records, notes, or free text. `priorAssessments` (the app's own earlier AI summaries) and `profile.conditions`/`profile.medications` are the only free-text/clinical fields, attached **only** when the user explicitly opts in.
- **Disabled optional trackers** (sugar, potassium) are dropped from the snapshot entirely — their queries short-circuit to `[]`/`null` and their metric/correlation entries are omitted.
- **Day alignment:** `groupByDay` uses `date-fns format` (local time); `correlateTimeSeries` uses `toLocalDateKey`. Time scopes align to `startOfDay`/`endOfDay` so daily grouping never produces partial edge days.
- **Lag shift:** A's day keys shift forward by `lagDays` (constructed at `T12:00:00` to dodge DST edges), then matched to B's same-day average.
- **Correlation guards:** returns "none" when either series empty, `< 3` paired days, or zero standard deviation in either paired series (constant series). `pairs`/`pairedDays` still returned so the UI can explain why.
- **Trend guards:** `≤1` point → stable/0 confidence; R² clamped to [0,1]; near-flat noise reported as `stable` not a false trend.
- **Anomaly guards:** `< 2` points or zero SD → no anomalies.
- **BP/weight averages, min/max:** guarded against empty arrays (return 0). Weight `changeKg` = last − first reading (sorted by timestamp).
- **Snapshot intake metric** included only when there is some intake data AND `waterGoalMl > 0` AND `sodiumLimitMg > 0`; days = `max(1, round((end-start)/day))` to avoid divide-by-zero. Optional-tracker intake fields included only when enabled AND their limit `> 0`.
- **Trend clamping for AI:** confidence clamped [0,1], coefficient clamped [-1,1]; correlations filtered to `pairedDays > 0 && Number.isFinite(coefficient)`.
- **Insights schema rule:** at least one metric group (`bp`/`weight`/`fluidBalance`/`intake`/non-empty `correlations`) must be present or the request is rejected.
- **Fast-path truncation:** `stop_reason === "max_tokens"` returns a distinct `RESPONSE_TRUNCATED` 502 advising to retry or drop "include previous summary"; missing/invalid tool block → "AI response format invalid" 502.
- **Deep-job concurrency:** DB slot reserved *before* paying for the batch (prevents leaked paid batches on concurrent submit). Batch-create failure → delete the reserved job (releases lock for retry). Attach-failure → cancel the orphan batch + delete the job. Completion guarded by compare-and-set on `status='pending'`; CAS loser soft-deletes its orphan report and defers to the winner's persisted outcome.
- **Polling is stateless:** the GET endpoint is the only mutator of job state; no cron/worker. Expiry computed lazily (`now - createdAt > 24h`). The window & personalisation are re-read from the saved `requestPayload`, never trusted from the poll request.
- **Cache resilience:** a storage failure when caching a fast insight is swallowed (the user "paid tokens" for it); a malformed 200 must throw loudly, never cache a blank insight.
- **Usage telemetry:** both AI routes (fast endpoint and deep poll/finalisation endpoint) call `recordUsage` (provider/model/route/status/duration + token counts) wrapped in try/catch, so a telemetry write failure is logged but never turns a successful AI call into a 502.
- **Medication summary caps:** at most 40 meds; dose string dedupes & sorts dosages; the once/twice/Nx frequency word comes from `schedules.length` (count of enabled, non-deleted schedules), while the `daily` flag and explicit day list come from the union of `daysOfWeek` across those schedules.

---

## Sub-components / variants

- **`analytics-service.ts`** — domain normalization + the 9 pre-built query functions (+ `correlate`, `getRecordsByDomain`, `groupByDay`).
- **`analytics-stats.ts`** — pure stats primitives: `movingAverage`, `trend`, `correlateTimeSeries`, `detectAnomalies`, `computeRegression`.
- **`analytics-registry.ts`** — self-describing `queryRegistry` (10 queries) + zod param schemas (`TimeRangeSchema`, `AdherenceParamsSchema`, `SaltWeightParamsSchema`, `CorrelationParamsSchema`) + `getQueryById` / `listQueries`.
- **`analytics-types.ts`** — all shared interfaces, enums, and tuning constants.
- **`analytics-snapshot.ts`** — reduces local data to the privacy-safe `AnalyticsInsightsRequest`; medication summary; emptiness check.
- **`analytics-insights.ts`** — AI request/response zod schemas, `INSIGHT_TOOL`, system prompt, `buildInsightsPrompt`.
- **`use-analytics-queries.ts`** — reactive Dexie-live hooks per query + `useTimeScopeRange`.
- **`use-insights.ts`** — `useInsightReports` (history), `useGenerateInsights` (fast mutation), `useDeepInsightJob` (submit + 30s polling state machine), `NotEnoughDataError`.
- **`insight-report-service.ts`** — Dexie CRUD for the cached report history (synced).
- **`server/insight-job-service.ts`** — Neon CRUD + lifecycle (`createInsightJob`, `attachBatchToJob`, `deletePendingJob`, `getInsightJob`, `completeInsightJob`, `failInsightJob`, `expireInsightJob`, `getReportForJob`, `PendingJobConflictError`).
- **`api/analytics/insights/route.ts`** — fast sync endpoint (Sonnet-tier).
- **`api/analytics/insights/deep/route.ts`** — async deep batch submission endpoint (Opus + web search), returns 202 + jobId.
- **`api/analytics/insights/jobs/[id]/route.ts`** — stateless polling/finalisation endpoint (validates, persists, flips job status).
