# Verification — 26-analytics-engine

**Verdict:** accurate · checked 96 claims, verified 93.

Scope: read all 14 "Files covered" in full, plus supporting code — `src/lib/db.ts`
(`InsightReport`, `SubstanceRecord`, `BloodPressureRecord`, `PhaseType`), `src/db/schema.ts`
(`insightReports`/`insightJobs`/`usersSync`), `src/app/api/ai/_shared/claude-client.ts`
(`CLAUDE_MODELS`, `WEB_SEARCH_TOOL`), `src/lib/dose-schedule-service.ts`,
`src/lib/urination-service.ts`, `src/lib/substance-service.ts`, `src/lib/phase-service.ts`,
`src/lib/prescription-service.ts`, `src/lib/date-utils.ts`, `src/app/api/_shared/rate-limit.ts`.

The document is unusually faithful to the implementation. Numeric thresholds, enum members,
schema fields, lifecycle semantics, and prompt/tool config all check out digit-for-digit. The
only real defect is a stale "no substance-service yet" claim that the doc inherited verbatim from
an out-of-date source-code comment.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | "`substanceRecords` … — direct Dexie compound index `[type+timestamp]` (no substance-service yet…)" (line 201; also line 39 sub-component note implies same) | A `substance-service.ts` **does** exist and exports `getSubstanceRecordsByDateRange`. `analytics-service` still uses its own inline `db.substanceRecords` query (with a stale `// no substance-service exists yet` comment), so the *code behaviour* the doc describes is correct — but the parenthetical "no substance-service yet" is factually wrong about repo state. The service was wired in commit `8f2c598`. | `src/lib/substance-service.ts:98` (`getSubstanceRecordsByDateRange`); stale comment at `src/lib/analytics-service.ts:37-38` |
| low | "1→\"once\", 2→\"twice\", N→\"Nx\"" frequency words (line 188) and "frequency derived from union of `daysOfWeek`" (line 233) | The once/twice/Nx word is driven by **`count = schedules.length`** (number of enabled, non-deleted schedules), not by the day union. Only the `daily` flag uses `dayUnion.size >= 7`, and the explicit day list uses the union. Doc conflates the two sources; the "Nx" count is schedule-count, not distinct-day-count. | `src/lib/analytics-snapshot.ts:60-75` |
| low | Sub-components: "the **9** pre-built query functions" (line 239) and registry "**10** queries" (lines 59, 241) | Both counts are technically correct, but the doc elsewhere (line 48 "Pre-built queries") lists/implies the same set inconsistently with the registry's 10th (`custom_correlation`, which wraps `correlate`, not a dedicated pre-built fn). Not a defect per se — the 9 vs 10 distinction is real (9 named query fns + `custom_correlation` built from `correlate`). Flagged only as a potential reader-confusion point. | `src/lib/analytics-service.ts:197-480` (9 fns); `src/lib/analytics-registry.ts:77-206` (10 descriptors) |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `adherenceRate` has **no reactive hook variant exported as a live query helper named in the doc's hook list, but DOES** — actually `useAdherenceRate` is present and is listed (line 64). No omission; verified present. | `src/hooks/use-analytics-queries.ts:121-127` |
| low | Polling endpoint returns `sources` on the `completed` response (`sources: sources ?? undefined`) and `respondCompleted` echoes `report.sources`. Doc's deep "completed" state (line 120) mentions `sources?` in the result object generically but the live-poll hook (`use-insights.ts`) does NOT read `body.sources` into the completed state — only narrative/observations/generatedAt. Worth noting the client drops poll-returned sources (relies on sync pull for the full report). | `src/hooks/use-insights.ts:333-350` vs `src/app/api/analytics/insights/jobs/[id]/route.ts:330-337` |
| low | `recordUsage`/usage telemetry on both AI routes (fast + deep poll) — wrapped in try/catch so telemetry failure never turns a success into a 502. Not mentioned in the doc. | `src/app/api/analytics/insights/route.ts:96-110`; `src/app/api/analytics/insights/jobs/[id]/route.ts:193-210` |
| low | Deep poll `respondCompleted` failure sub-states: "Job marked completed but has no result reference" and "Cached result for this job is no longer available." — two extra terminal `failed` messages the doc's "Deep job: failed" enumeration (line 121) doesn't list. | `src/app/api/analytics/insights/jobs/[id]/route.ts:340-355` |
| low | `useDeepInsightJob.submit()` resets to `idle` (not `failed`) on any pre-submit throw, re-throwing the error — so a `NotEnoughDataError` on the deep path surfaces as idle + thrown error, distinct from the fast path's behaviour. Doc states submit "begins polling" (line 98) but omits the idle-on-throw recovery. | `src/hooks/use-insights.ts:445-452` |
| low | `WEB_SEARCH_TOOL` default `max_uses: 5` is overridden to `12` only at the deep route via spread `{ ...WEB_SEARCH_TOOL, max_uses: DEEP_WEB_SEARCH_MAX_USES }`. Doc says "`WEB_SEARCH_TOOL` with `DEEP_WEB_SEARCH_MAX_USES = 12`" (line 176) — accurate in effect, but the base tool's default of 5 (overridden) is unstated. | `src/app/api/ai/_shared/claude-client.ts:34`; `src/app/api/analytics/insights/deep/route.ts:177` |

## Spot-confirmed

- **12 domains & per-domain value semantics** (water=ml, salt=mg, sugar=g, potassium=mg, weight=kg, bp=systolic mmHg, urination=`URINATION_ESTIMATE_ML` lookup default 300, eating=1, defecation=1, caffeine=`amountMg??0`, alcohol=`amountStandardDrinks??0`, medication=`[]`) — `src/lib/analytics-service.ts:67-158`; `DOMAINS` array `src/lib/analytics-types.ts:7-20`.
- **Urination estimates** small=150 / medium=300 / large=500, default 300 — `src/lib/analytics-types.ts:166-170`; default applied via `?? "medium"` then `?? 300` — `analytics-service.ts:120`.
- **Trend rules**: `MIN_TREND_CONFIDENCE = 0.3`; `<=1` point → stable/0; R² clamped [0,1]; slope cutoffs `±0.01` — `src/lib/analytics-stats.ts:42,50-76`.
- **Correlation strength**: strong `>0.7`, moderate `>0.4`, weak `>0.2`, none `<=0.2`; `<3` paired days → none/0 with populated `pairs`/`pairedDays`; zero-SD guard → none — `src/lib/analytics-stats.ts:146-177`.
- **`detectAnomalies` z default 2.0**, `<2` points or zero SD → `[]` — `src/lib/analytics-stats.ts:187-200`.
- **`movingAverage`** returns `null` for first `windowSize-1`, `[]` for empty/`windowSize<=0` — `src/lib/analytics-stats.ts:20-31`.
- **`computeRegression`** identity-zero for `<2` points — `src/lib/analytics-stats.ts:209-227`.
- **Fluid balance**: daily `target = urinationEstimatedMl + 500`; `daysAboveTarget` = `intakeMl >= target`; intraday running cumulative; `dataPoints = waterPoints` — `src/lib/analytics-service.ts:215-265`.
- **Correlation lag defaults** all `= 2` (salt/sugar/potassium); caffeine/alcohol vs BP no lag — `src/lib/analytics-types.ts:173-179`; `analytics-service.ts:455-480`.
- **Registry**: 10 descriptors with exact ids/names/categories matching the doc table (lines 156-165), incl. `custom_correlation`/"Custom Domain Correlation"/`custom`; `getQueryById`, `listQueries` — `src/lib/analytics-registry.ts:77-234`.
- **Result units**: ml/ratio/mmHg/kg/correlation — `analytics-service.ts:262,314,368,398,461` etc.
- **TimeScope ranges**: 24h=startOfDay(now); 7d=subDays(now,6); 30d=subDays(now,29); 90d=subDays(now,89); all=0; end=endOfDay(now); default fallback=7d — `src/hooks/use-analytics-queries.ts:240-265`.
- **Default hook values** with `EMPTY_RANGE {start:0,end:0}` and zeroed value objects — `src/hooks/use-analytics-queries.ts:34-101`.
- **`INSIGHTS_WINDOW_DAYS = 30`**, `insightsRange`, `snapshotIsEmpty`, snapshot privacy reduction, disabled-tracker short-circuit (sugar/potassium → `[]`/`null`), intake gate (`waterGoalMl>0 && sodiumLimitMg>0`, `days = max(1, round(...))`), 40-med cap, correlation filter `pairedDays>0 && Number.isFinite` — `src/lib/analytics-snapshot.ts:84,91,108-110,160-164,203-262,281-290`.
- **`DAY_NAMES`** `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]` — `src/lib/analytics-snapshot.ts:28`.
- **Fast path**: `CLAUDE_MODELS.quality` (`claude-sonnet-4-6`), `max_tokens: 2048`, `temperature: 0.3`, forced `tool_choice {type:"tool"}`, rate limit 10; `429` / `RESPONSE_TRUNCATED` 502 / "AI response format invalid" 502 / "Failed to generate insights" 502 — `src/app/api/analytics/insights/route.ts:40,86-168`; `claude-client.ts:27`.
- **Deep path**: `CLAUDE_MODELS.premium` (`claude-opus-4-6`), `DEEP_MAX_TOKENS = 4096`, `temperature: 0.3`, web_search `max_uses: 12`, `tool_choice {type:"auto"}`, rate limit 10, 202 + jobId, mandatory ≥2 searches in system prompt — `src/app/api/analytics/insights/deep/route.ts:44,48,53,167-193`; `claude-client.ts:28`.
- **Deep polling**: `DEEP_POLL_INTERVAL_MS = 30_000`, localStorage key `insight-deep-job-pending`, 404→failed, schedulePull on complete, reset clears state+key — `src/hooks/use-insights.ts:182-183,307-338,457-461`.
- **`BATCH_SLA_MS = 24h`**, lazy expiry, expired error string exact match — `src/app/api/analytics/insights/jobs/[id]/route.ts:53,87-94`; `insight-job-service.ts:263`.
- **Job lifecycle**: `pending|completed|failed|expired`; `PendingJobConflictError`→409 `PENDING_JOB_EXISTS`; reserve-before-pay; batch-create-fail → deletePendingJob; attach-fail → cancel batch + delete job; CAS on `status='pending'` in complete/fail/expire; CAS-loser soft-deletes orphan report — `src/lib/server/insight-job-service.ts:53-268`; `src/app/api/analytics/insights/deep/route.ts:141-241`; jobs route `289-328`.
- **`SERVER_DEVICE_ID = "server-deep-batch"`**, deep report `mode = "deep"`, `custom_id = insight-${jobId}` — `insight-job-service.ts:27,205`; deep route `:163`.
- **Response caps**: summary 1–4000, observations max 16 ×(1–2000), sources max 30 URLs; prior assessments max 3; conditions max 20 ×≤120; medications max 40; correlations max 12 — `src/lib/analytics-insights.ts:120-163,182-186`.
- **Tool/prompt**: `INSIGHT_TOOL.name = "analytics_insight"`, `INSIGHTS_SYSTEM_PROMPT`, `buildInsightsPrompt` renders only present groups, fast 3–6 / deep 4–8 observations guidance — `src/lib/analytics-insights.ts:188-216,248-369`.
- **`DOMAIN_LABELS`** all 12 entries match doc line 135 exactly (water→"water intake" … medication→"medication adherence") — `src/lib/analytics-insights.ts:21-34`.
- **Dexie `InsightReport`** fields (incl. `sources?`, `mode?`, `deletedAt: number|null`, `deviceId`), schema versions 19/20/21 — `src/lib/db.ts:402-422,787-919`.
- **Neon `insight_reports`** + `insight_jobs` fields, `insight_jobs_one_pending_per_user_uq` partial unique index `WHERE status='pending'`, status check constraint, `(user,created)` + `batchId` indexes, FK to `insight_reports` ON DELETE SET NULL, `usersSync` onConflictDoNothing pre-insert — `src/db/schema.ts:679-776`; `insight-job-service.ts:79-110`.
- **`insight-report-service`**: `getInsightReports` (active, newest-first), `getLatestInsightReport`, `saveInsightReport` (mode default "fast"), `deleteInsightReport` soft-delete, all via `writeWithSync`+`schedulePush`; `useInsightReports` live — `src/lib/insight-report-service.ts:34-101`; `src/hooks/use-insights.ts:55-57`.
- **`NotEnoughDataError`** thrown client-side before network call when `snapshotIsEmpty` — `src/hooks/use-insights.ts:28-33,82-84`.
- **BP readings** carry `heartRate?` and `position` (`"standing"|"sitting"`) — `src/lib/db.ts:84-86`; `analytics-service.ts:332-338`.
- **`PhaseType`** = `"maintenance" | "titration"` — `src/lib/db.ts:173`.
- **Core types** in `analytics-types.ts` all present as listed (line 212) — `src/lib/analytics-types.ts:22-159`.

## Low-confidence / could-not-verify

- **Anthropic batch pricing "50% of standard"** (doc line 78): asserted in the deep route's header comment (`src/app/api/analytics/insights/deep/route.ts:31`) but is an external Anthropic billing fact, not something the codebase enforces. Believed correct per Anthropic's published Message Batches pricing; cannot verify from source.
- **"survives disconnect/reload"** for batches (doc line 78): true of the client-side localStorage `jobId` persistence (verified) and of Anthropic's batch durability (asserted in comments, not verifiable from code).
- **Sub-component "9 pre-built query functions" vs registry "10"** counts are both internally consistent and correct (9 dedicated fns + `correlate` reused by `custom_correlation`); flagged in Inaccuracies only as a reader-clarity nuance, not a hard error.
