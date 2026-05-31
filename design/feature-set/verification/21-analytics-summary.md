# Verification — 21-analytics-summary

**Verdict:** accurate · checked 118 claims, verified 113.

The document is a faithful, code-accurate description of the Summary tab and its
two AI cards. Every digit-level "actual value from code" claim I checked
(defaults, clamps, constants, enum members, schema caps, chart colors, model
IDs) is correct. The handful of flags below are low/medium nuances, not
substantive errors.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "AI Insights tooltip / model copy … Fast described as ~10s" — implies the `~10s` figure appears in user-facing copy alongside the dialog's deep "3-10 min, 10-20× cost" line. | `~10s` exists **only** as a JSDoc code comment, never in any rendered dialog/tooltip string. The fast confirm dialog description has no timing text at all; only the deep amber box surfaces timing ("3-10 minutes … 10-20× the cost"). | ai-insights-card.tsx:201 (comment); dialog desc ai-insights-card.tsx:469 has no timing |
| low | Deep model "named 'Opus 4.6' in dialog copy" — framed as just dialog copy. | True in dialog copy (line 468), AND the actual backing model is really `claude-opus-4-6` (`CLAUDE_MODELS.premium`), so the name is genuinely accurate, not just marketing text. Strengthens the claim rather than contradicting it; noting for completeness. | claude-client.ts:28; deep/route.ts:172; ai-insights-card.tsx:468 |
| low | KPI sub-line for Fluid Balance "or `avg / day` when no days." | Literal string is `"avg / day"` (with spaces around the slash), used as the sub when `daysTotal === 0`. Doc's rendering is correct; just confirming the exact literal. | summary-tab.tsx:338 |
| low | Default scope / "supplied by the parent analytics page's time-range selector" — doc's Time-scope section lists only `24h, 7d, 30d, 90d, All`. | Accurate for `SCOPE_OPTIONS`, but the selector ALSO renders a separate hardcoded **Custom** button (date-range inputs) not in `SCOPE_OPTIONS`; the page resolves `effectiveRange = customRange ?? scopeRange`. Doc's enum list is correct (Custom isn't in `SCOPE_OPTIONS`), but a reader could miss that a custom range can drive the tab. | time-range-selector.tsx:9-15, 90-122; analytics/page.tsx:42 |
| low | "Fluid intake below the `+500 ml` target" observation and chart reference line both tie to `FLUID_TARGET_ML = 500`. | The chart reference line is literally `FLUID_TARGET_ML = 500` (summary-tab.tsx:50,457). The *observation* sentence hardcodes `+${FLUID_TARGET_ML} ml` too (line 205) — correct. BUT the underlying `daysAboveTarget` test uses a per-day `target = urinationEstimatedMl + 500` (output + 500), not a flat 500. So "on target" days count vs a dynamic threshold even though the prose says "+500 ml". Doc's phrasing ("below the +500 ml target") matches the UI string but the actual day-classification target is output-relative. | analytics-service.ts:223,252; summary-tab.tsx:205 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | Nutrient confirm-dialog **focus echo** wording is "Findings will lead with: {focus}" and only shows when `focus.trim() !== ""` (uses raw `focus`, not the trimmed value passed to the API). Doc says "Focus echo" generically without the exact label/condition. | nutrient-analysis-card.tsx:449-461 |
| low | Fast insights route uses `max_tokens: 2048`, `temperature: 0.3`, `tool_choice` forced to `analytics_insight`, and **no** web_search tool (only `[INSIGHT_TOOL]`). Doc says "synchronous Sonnet" but doesn't state fast mode never web-searches (it's implied by "deep mode only" for sources). | insights/route.ts:86-93 |
| low | Deep route caps: `DEEP_MAX_TOKENS = 4096`, `DEEP_WEB_SEARCH_MAX_USES = 12`, deep system prompt **requires ≥2 web_search queries**, one-pending-job-per-user enforced by a DB unique index, submission rate-limited (10/window) while polling is not. Doc covers the user-facing behavior but omits these server caps. | deep/route.ts:44,48,53,55,65-66 |
| low | Nutrient route has a **two-turn retry**: if the model finishes with prose, a follow-up call with `tool_choice` forced re-requests the structured tool; only then a 422 ("didn't return a structured response"). Doc lists 429 and generic-error toasts but not the 422 path or the server's retry. | nutrient-analysis/route.ts:244-298 |
| low | Nutrient route server-side response caps: summary ≤4000, findings ≤20, each detail ≤2000, caveats ≤8 (≤600 each), exampleFoods ≤12; food items ≤500, each description ≤300 chars, grams 0–10000. Doc gives the insights schema caps but not the nutrient-route caps. | nutrient-analysis/route.ts:12-50 |
| low | `useEatingRecordsByDateRange` guards `startTime < endTime` (returns `[]` otherwise) before querying. Minor edge-case the doc doesn't mention. | use-eating-queries.ts:36 |
| low | `getOptionalTrackerEnabled` (non-reactive snapshot) exists alongside the reactive `useOptionalTrackerEnabled`. Doc only references the reactive hook. | optional-trackers.ts:73 |
| low | Deep poll response on a `completed` body that is missing `narrative`/`observations` falls through to the "unrecognised shape → keep polling" branch (not treated as completed). Doc says completion fires when status completed but doesn't note the narrative/observations guard. | use-insights.ts:333 |

## Spot-confirmed

- KPI cards, order, icons, conditional gating (sugar/potassium/caffeine/alcohol) and all sub-line formats — summary-tab.tsx:298-389. Caffeine card only when `totals.caffeineMg > 0` (line 374); Alcohol only when `totals.alcoholDrinks > 0` (line 382). Confirmed.
- `rangeDays` divisor: `range.start > 0 ? max(1, round((end-start)/MS_PER_DAY)) : max(1, activeDays)` — summary-tab.tsx:168-171. Confirmed exactly.
- Empty-state gate `records.length>0 || bpReadings>0 || weightReadings>0`, and `NutrientAnalysisCard` still renders below the empty state — summary-tab.tsx:175-176, 247-262. Confirmed.
- Observations rules incl. potassium **below-target-only asymmetry** ("no over-limit warning") — summary-tab.tsx:233-242. Confirmed (only `avgPotassium < potassiumLimit` branch exists).
- Weight observation threshold `|change| >= 0.1 kg`, increased/decreased wording — summary-tab.tsx:191-199. Confirmed.
- Chart specs: BP `LineChart` height 180, systolic `hsl(346 77% 50%)` / diastolic `hsl(330 65% 55%)` strokeWidth 2 `dot={false}`; Weight one line `hsl(160 84% 39%)` `dot={{r:3}}` domain `["dataMin - 1","dataMax + 1"]` formatter `X.X kg`; Fluid `BarChart` `hsl(199 89% 48%)` radius `[2,2,0,0]`, X `date.slice(5)`, reference lines y=0 (`hsl(var(--border))`) and y=500 dashed — summary-tab.tsx:412-465. All confirmed.
- `CHART_MARGIN = { top:5, right:5, left:-20, bottom:0 }`, `MS_PER_DAY = 86_400_000`, `FLUID_TARGET_ML = 500` — summary-tab.tsx:48-50. Confirmed.
- `INSIGHTS_WINDOW_DAYS = 30`, nutrient `WINDOW_DAYS = 30` — analytics-snapshot.ts:91; nutrient-analysis-card.tsx:36. Confirmed.
- `DeepJobState` union `idle|submitting|pending|completed|failed|expired`, `DEEP_POLL_INTERVAL_MS = 30_000`, `DEEP_LONG_RUN_THRESHOLD_MS = 15*60*1000`, localStorage key `insight-deep-job-pending` — use-insights.ts:182-225; ai-insights-card.tsx:47. Confirmed.
- Deep poll 404 → failed with "job was not found … may have been cleared"; non-404 / network / unrecognised shape → keep polling; pre-submit throw → reset to `idle` — use-insights.ts:307-374, 445-452. Confirmed.
- Source-link XSS guard: only `http:`/`https:` become anchors, else inert `<span>` with `title="Unsafe URL scheme: …"`; `sourceLabel` strips `www.`, falls back to raw URL — ai-insights-card.tsx:59-110. Confirmed.
- `DOMAINS` array (12 members) and `DOMAIN_LABELS` mapping incl. medication→"medication adherence", caffeine→"caffeine intake", etc. — analytics-types.ts:7-20; analytics-insights.ts:21-34. Confirmed all 12 labels digit-for-digit.
- `OptionalTrackerKey = "sugar" | "potassium"`, defaults `sugar:true, potassium:false` — optional-trackers.ts:23,58-61. Confirmed. (Note: `buildAnalyticsSnapshot`'s own default param is `{sugar:true, potassium:true}` at analytics-snapshot.ts:137, but the card always passes the real flags, so the false-default is what's effective.)
- Settings defaults/clamps: water 1000 (100–10000), salt 1500 (100–10000), sugar 30 (5–500), potassium 3500 "WHO" (100–20000) — settings-store.ts:185-191, 351-363. Confirmed digit-for-digit.
- Insight response caps: summary 1–4000, observations ≤16 (each 1–2000), sources ≤30 URLs, priorAssessments ≤3, correlations ≤12 — analytics-insights.ts:127-186, 145, 152. Confirmed. (Doc says "observations ≤16 items" — matches.)
- `URINATION_ESTIMATE_ML` small:150 / medium:300 / large:500; lag defaults all = 2 — analytics-types.ts:166-179. Confirmed; estimate feeds fluid balance at analytics-service.ts:120.
- `INSIGHT_TOOL`/system prompt: factual-only, no diagnosis/treatment, low-confidence trends inconclusive, `confidence < 0.3` → "no clear trend (low-confidence fit)", `pairedDays < 3` = insufficient (not "no relationship"), coefficient clamp −1…1, confidence clamp 0…1, compare-vs-most-recent-prior — analytics-insights.ts:218-237, 324-335. Confirmed.
- Medication frequency builder: `DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]`, ≥7 days → "daily", 1/2/N schedules → once/twice/Nx, cap at 40 entries, enabled & non-deleted schedules only — analytics-snapshot.ts:28, 48-85. Confirmed.
- Malformed-200 guard (fail loudly, not cache blank) and swallowed cache-write failure — use-insights.ts:126-165. Confirmed.
- Nutrient scans session-only (component `useState<ScanRecord[]>`, never persisted to Dexie); insights cached via `saveInsightReport` → `writeWithSync` + `schedulePush` — nutrient-analysis-card.tsx:196,279; insight-report-service.ts:47-78. Confirmed.
- `InsightReport` fields and Dexie index `"id, generatedAt, updatedAt"` (NOT `id, generatedAt, updatedAt` plus rangeStart — index is only those three) — db.ts:402-422, 919. Doc says "schema indexes `id, generatedAt, updatedAt`" — exact match.
- Nutrient route redaction via `sanitizeForAI` on descriptions/focus/conditions/meds; rate limit 10 → 429; model `CLAUDE_MODELS.quality` (Sonnet 4.6) + `WEB_SEARCH_TOOL` — nutrient-analysis/route.ts:122,140,186,219-224. Confirmed.
- Personalised line variants in nutrient card: "(conditions + medications)" / "(conditions)" / "(medications)" — nutrient-analysis-card.tsx:316-322. Confirmed.
- StatusBadge colors: High amber, Low sky, Balanced emerald — nutrient-analysis-card.tsx:60-74. Confirmed.

## Low-confidence / could-not-verify

- "Deep analysis … typically 3–10 min": the **dialog** literally says "typically 3-10 minutes" (ai-insights-card.tsx:480) — confirmed as copy; the actual wall-clock batch latency is environment-dependent and not assertable from source.
- "Server-side Postgres `insight_jobs` / `insight_reports`" persistence and "a sync pull surfaces it locally": tables exist in `src/db/schema.ts` (insightReports pgTable line 679, insightJobs pgTable line 730) and the client calls `schedulePull()` on completion (use-insights.ts:338); the end-to-end server completion→insert flow lives in the deep route/worker which I sampled (deep/route.ts header comment) but did not exhaustively trace. Behavior as described is consistent with the code I read.
- "Deep job 404 on poll: state → failed with 'job was not found… may have been cleared'": confirmed in client (use-insights.ts:312-315); whether the server actually returns 404 for cleared jobs vs another code was not traced into the `[id]` route handler.
