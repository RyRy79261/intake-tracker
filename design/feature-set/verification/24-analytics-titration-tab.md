# Verification — 24-analytics-titration-tab

**Verdict:** accurate · checked 78 claims, verified 75.

The document is a high-fidelity description of the Titration tab. Nearly every feature, state,
enum, threshold, label, and calculation is confirmed digit-for-digit against the source. The few
flagged items are minor (one wrong import-path attribution in the "Files covered" header, and one
imprecise enum mapping where the adherence filter operates on `DoseSlotStatus`, not `DoseStatus`).
No medium/high inaccuracies. A handful of small omissions noted.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Files covered" lists `prescription-service.ts (getPrescriptions)` and `phase-service.ts (getPhasesForPrescription)` as the source the component pulls from | The component imports both from `@/lib/medication-service` (a barrel that re-exports from prescription-service/phase-service). Attribution is functionally correct (the implementations do live there) but the component never imports those files directly. | titration-tab.tsx:16; medication-service.ts:13-35; prescription-service.ts:41; phase-service.ts:59 |
| low | Enum "Dose status (`DoseStatus`, drives adherence): `taken`/`skipped`/`rescheduled`/`pending`. Adherence counts a slot as adherent only when `status === 'taken'`." Also edge-rule: "Dose status 'taken' is the only adherent state; 'skipped'/'rescheduled'/'pending' count against the rate." | `adherenceRate` filters over **`DoseSlot.status`** whose type is `DoseSlotStatus = "taken" | "skipped" | "pending" | "missed"` — NOT `DoseStatus`. A `rescheduled` *DoseLog* is mapped to slot status `"skipped"` and a missing log on a past date becomes `"missed"`. Net adherent-only-on-"taken" behavior is correct, but the slot universe that "counts against" is `skipped/pending/missed` (rescheduled never appears as a slot status), so the enum cited is the dose-log enum, not the slot enum the filter actually reads. | analytics-service.ts:290; dose-schedule-service.ts:17,59-78 |
| low | "Average blood pressure — ... a trend direction (rising/falling/stable) for systolic, shown as an arrow." (implies BP arrow uses systolic trend) — correct, but the doc's snapshot maps `bpResult.value.trend.systolic`; diastolic trend is computed and discarded. Worth noting the *diastolic* trend is fully computed yet never surfaced. | `bpTrend` computes both `trend.systolic` and `trend.diastolic`; the snapshot only stores `bpResult.value.trend.systolic`. Claim is accurate; flagged only as a documentation-of-discard nuance. | titration-tab.tsx:97; analytics-service.ts:350-351,365 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The "has data" gate uses `adhResult.value.total` (scheduled slots), not "doses taken". A phase with scheduled doses but zero taken still counts as "has data" and renders the adherence cell (0%). Doc says "adherence total > 0" which is technically correct, but does not call out that this means *scheduled slots exist*, independent of whether any were taken. | titration-tab.tsx:87-90; analytics-service.ts:292,308 |
| low | The adherence metric cell renders whenever `adherenceTotal > 0` even if `rate === 0` (e.g. all skipped/missed) — would show a rose "0%" badge. Doc covers the gate but not this 0% edge. | titration-tab.tsx:227-234,152-161 |
| low | `fluidBalance` also returns `daysAboveTarget`, `daysTotal`, full `daily[]`, and `intraday[]` running-cumulative series; only `avgBalance` is consumed. Doc notes "tab surfaces only avgBalance" but doesn't enumerate the discarded `daysAboveTarget`/`intraday` fields. (Cosmetic — doc's framing is fine.) | analytics-service.ts:252-265 |
| low | Active-phase emphasis classes: emerald border is `border-emerald-200 dark:border-emerald-800`, background `bg-emerald-50/50 dark:bg-emerald-900/10`; non-active full-data card uses `bg-muted/30`. Doc says "emerald border + emerald-tinted background" (accurate) but omits that the no-data card is always `bg-muted/30` even when the phase is active (the active emerald styling applies ONLY to the full-data card; the no-data branch never gets emerald bg, only the pulsing dot). | titration-tab.tsx:189-213 |
| low | `urination` DataPoint mapping falls back to literal `300` if `URINATION_ESTIMATE_ML[...]` lookup misses AND `amountEstimate` is nullish defaults to `"medium"`. Doc lists the 150/300/500 map but not the `?? "medium"` default nor the `?? 300` secondary fallback. | analytics-service.ts:120 |
| low | `correlateTimeSeries` strength buckets (strong >0.7 / moderate >0.4 / weak >0.2 / none) and `pairedDays < 3` guard exist in analytics-stats but are not used by this tab (correlate is not called here) — correctly out of scope; noted for completeness. | analytics-stats.ts:146-167 |

## Spot-confirmed

- Phase window derivation `start = phase.startDate`, `end = phase.endDate ?? Date.now()`; zero-length guard `if (phaseRange.end <= phaseRange.start)` → `emptySnapshot(phase)`. titration-tab.tsx:65-74. ✔
- Per-phase parallel calls in `Promise.all([adherenceRate(phaseRange, rx.id), bpTrend, weightTrend, fluidBalance, getRecordsByDomain("weight",…)])`; `catch {}` → `emptySnapshot`. titration-tab.tsx:77-106. ✔
- Adherence is prescription-scoped (`rx.id` passed); BP/weight/fluid are date-range only (no rx filter). titration-tab.tsx:79-83; analytics-service.ts:285-287 (only adherence filters by prescriptionId). ✔
- `hasData = adhResult.value.total > 0 || bpResult.value.readings.length > 0 || wtResult.value.readings.length > 0`. titration-tab.tsx:87-90. ✔ (Fluid/anomalies excluded from gate — matches doc.)
- Conditional metric cells: adherence `adherenceTotal > 0` (227); BP `bpAvg.systolic > 0` (237); weight `weightAvg > 0` (250); fluid `fluidAvgBalance !== 0` (263); anomaly `anomalyCount > 0` (276). All exact. ✔
- AdherenceBadge thresholds: `pct >= 90` emerald, `>= 70` amber, else rose; `pct = Math.round(rate * 100)`, displayed `{pct}%`. titration-tab.tsx:153-160. ✔
- PhaseTypeBadge colors: maintenance = blue (`bg-blue-100 text-blue-700` / dark variants), titration = amber. titration-tab.tsx:168-170. ✔ (Renders raw `{type}` text, uppercased via CSS `uppercase` class — matches test note.)
- TrendArrow: rising → `TrendingUp` `text-rose-500`; falling → `TrendingDown` `text-emerald-500`; stable → `Minus` `text-muted-foreground`. titration-tab.tsx:142-150. ✔
- Active-phase: `phase.status === "active"` → emerald border/bg + `animate-pulse` emerald dot `w-1.5 h-1.5 ... bg-emerald-500`. titration-tab.tsx:184,194-195,210-212,218-219. ✔
- Default expand state `useState(report.prescription.isActive)`; inactive → "(inactive)" `text-[10px]` label; chevron `ChevronDown` (expanded) / `ChevronRight` (collapsed). titration-tab.tsx:293,308-316. ✔
- Date label `formatDate` = `toLocaleDateString("en-US", { month: "short", day: "numeric" })`; ongoing end → literal `"present"`. titration-tab.tsx:135-139,185-187. ✔
- BP rendered `{Math.round(systolic)}/{Math.round(diastolic)}`; weight `{weightAvg.toFixed(1)} kg`; fluid `{Math.round(fluidAvgBalance)} ml`. titration-tab.tsx:242,255,268. ✔
- Anomaly pluralization: `anomal{count === 1 ? "y" : "ies"} detected`, amber row + `Activity` icon. titration-tab.tsx:276-283. ✔ (Note: code is `count === 1 ? "y" : "ies"` so 0 would read "anomalies"; only renders when `> 0`, so 1 vs n≠1 framing holds.)
- Loading: `if (!reports)` → "Loading titration data..." centered muted text. titration-tab.tsx:344-350. ✔
- Empty: `reports.length === 0` → `Pill` icon + "No prescriptions to analyze" + "Add prescriptions in the Medications tab to see titration reports". titration-tab.tsx:352-363. ✔
- "No phases configured" when `report.phases.length === 0`. titration-tab.tsx:322-325. ✔
- No-data phase card: type badge + optional active dot + dateLabel + "No health data recorded during this phase", `bg-muted/30`. titration-tab.tsx:189-203. ✔
- `MIN_TREND_CONFIDENCE = 0.3`; R² < 0.3 → stable; slope `> 0.01` rising, `< -0.01` falling, else stable; ≤1 point → stable/0 confidence. analytics-stats.ts:42,49-77. ✔
- `detectAnomalies` z-threshold default `2.0`, needs `length >= 2`, returns `[]` if `sd === 0`, filters `Math.abs(zScore) > zThreshold`. analytics-stats.ts:187-200. ✔
- Fluid target rule `target = urinationEstimatedMl + 500`; `avgBalance` = mean of daily `balance` (intakeMl − urinationEstimatedMl). analytics-service.ts:221-223,247-250. ✔
- `URINATION_ESTIMATE_ML`: small 150 / medium 300 / large 500. analytics-types.ts:166-170. ✔
- `getPrescriptions()`: `orderBy("createdAt").reverse()`, filters out `deletedAt` set (soft-deleted excluded) → newest-first. prescription-service.ts:41-44. ✔
- `getPhasesForPrescription(id)`: `sortBy("createdAt")` then `.reverse()` → newest-created first. phase-service.ts:59-64. ✔
- `useLiveQuery(..., [])` — Dexie React hooks live reactivity. titration-tab.tsx:56,113. ✔
- Page-level: `AnalyticsTab = "summary" | "correlations" | "records" | "titration"`; default tab `"summary"` when no/invalid `?tab=`; `?tab=titration` deep-link; tab labels "Summary/Correlations/Records/Titration"; scope default `"7d"`; `TimeScope = "24h"|"7d"|"30d"|"90d"|"all"`; `ExportControls` + `TimeRangeSelector` at page level. page.tsx:16-28,38,49-55,63-74. ✔
- `TitrationTab({ range })` receives the range prop but never uses it in compute (only `phaseRange` from phase dates drives analytics). titration-tab.tsx:341-342. ✔
- Read-only: no add/edit/delete/mutation in the tab; only `useState` toggles expand. titration-tab.tsx (entire file). ✔
- `PhaseType = "maintenance" | "titration"`; `FoodInstruction = "before" | "after" | "none"`; `DoseStatus = "taken" | "skipped" | "rescheduled" | "pending"`; `MedicationPhase.status = "active"|"completed"|"cancelled"|"pending"`. db.ts:137-138,173,182,185. ✔
- `emptySnapshot` zeroes all metrics, `hasData: false`, both trends `{ slope: 0, direction: "stable", confidence: 0 }`. titration-tab.tsx:116-129. ✔

## Low-confidence / could-not-verify

- The doc's narrative claim that the BP "rising = warning / falling = good" color choice is "consistent with BP/weight where lower is generally better" is an editorial rationale, not a code assertion — the code simply colors rising rose and falling emerald unconditionally (titration-tab.tsx:144-147); there is no per-metric polarity logic. Not an inaccuracy, just an interpretive note that is not encoded.
- "Timezone/day handling: adherence groups by `yyyy-MM-dd` ... fluid balance groups by local day key." Adherence uses `format(new Date(range.start), "yyyy-MM-dd")` boundaries and `getDoseScheduleForDateRange` which iterates `toLocalDateKey` days (dose-schedule-service.ts:258-269); fluid balance `dayKey` uses `format(new Date(ts), "yyyy-MM-dd")` (analytics-service.ts:56-58) which is local-time `date-fns format`, while correlate paths use `toLocalDateKey`. Both are local-day grouping; the subtle mix of `date-fns format` vs `toLocalDateKey` is not material to this tab's output and was not exhaustively reconciled across DST edges.
