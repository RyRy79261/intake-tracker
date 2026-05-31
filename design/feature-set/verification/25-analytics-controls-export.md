# Verification — 25-analytics-controls-export

**Verdict:** accurate · checked 78 claims, verified 77.

This document is an unusually faithful description of the actual code. Every enum, preset,
default, threshold, label, rounding format, and edge-case rule was checked against the source and
matched. The single deviation found is a low-severity wording nuance (an internal helper described
as part of the surface is actually dead code). No medium/high inaccuracies.

## Inaccuracies

| severity | doc claim | code reality | file:line |
| --- | --- | --- | --- |
| low | Lists `dataPointsToCSVRows` among `export-service.ts` "internal helpers" (line 207) implying it participates in the export surface. | The function is defined but **unused** — not referenced anywhere in `src/`. It is dead code, not a live helper of the export path. | `src/lib/export-service.ts:30`; grep confirms no other reference |
| low | "Recent Records … re-sorted descending by formatted date" (PDF). Implies a chronological/date sort. | The sort is a **lexical** `localeCompare` on the formatted string `"MMM d, HH:mm"` (e.g. "May 31, 14:30"), so it is alphabetical by month name + day, not true chronological order. The doc does also say "descending by formatted-date string" in the edge-case section (line 185), so it is internally hedged — flagging only because the Features-section phrasing (line 43) reads as a real date sort. | `src/lib/export-service.ts:284,292` |

## Omissions

| severity | missing behavior/state/enum | file:line |
| --- | --- | --- |
| low | PDF `Recent Records` table value cell is formatted as `"${p.value} ${domainUnit(domain)}"` — raw value with unit appended (no rounding). Doc describes the table columns (`Date \| Domain \| Value`) but not that the Value cell embeds the unit string. | `src/lib/export-service.ts:283-287` |
| low | `useCorrelation`'s `dataPoints` is set to `result.seriesA` (series A only), and its returned object is assembled inline (not via a DEFAULT object). Doc lists the hook but not that its `dataPoints` mirrors seriesA. | `src/hooks/use-analytics-queries.ts:217-223` |
| low | `escapeCSVField` is applied to the all-records CSV both to the header row (`headers.join(",")` is plain, but data rows use `r.map(escapeCSVField)`) — header is NOT escaped in `exportAllRecordsCSV`, whereas `exportToCSV` DOES escape headers (`headers.map(escapeCSVField)`). Doc's "CSV escaping" rule (line 184) is stated generically and does not call out this asymmetry. | `src/lib/export-service.ts:73,120-122` |
| low | `fluidBalance` `daysAboveTarget` is computed as `d.intakeMl >= d.target` (intake ≥ target), i.e. a `>=` not strictly-above test. Doc says "days above target" without specifying the inclusive comparison. | `src/lib/analytics-service.ts:252` |
| low | Correlation strength thresholds (the exact cutoffs behind the `strong/moderate/weak/none` enum) are `absR > 0.7 → strong`, `> 0.4 → moderate`, `> 0.2 → weak`, else `none`. Doc lists the enum members but not the numeric thresholds. | `src/lib/analytics-stats.ts:160-167` |
| low | `intraday` running cumulative balance series in `FluidBalanceResult` (intake +value, output −value, chronologically merged). Doc lists `intraday[]` in the result type but does not describe its semantics. | `src/lib/analytics-service.ts:235-245` |

## Spot-confirmed

- **Scope chips & labels** `SCOPE_OPTIONS` = `24h/7d/30d/90d/All` + literal "Custom"; selected = `default` variant else `outline`; `flex-1 min-w-[3rem]`, container `flex flex-wrap gap-1`. `src/components/analytics/time-range-selector.tsx:9-15,78-97`
- **Scope→range mapping** end=`endOfDay(now)`; `24h`→`startOfDay(now)`, `7d`→`subDays(now,6)`, `30d`→`subDays(now,29)`, `90d`→`subDays(now,89)`, `all`→`0`, default→7d. `src/hooks/use-analytics-queries.ts:241-265`
- **Default custom range** `end=Date.now()`, `start=end − 7*24*60*60*1000`. `src/components/analytics/time-range-selector.tsx:56-58`
- **Custom clamping** start change → `end:Math.max(start,end)` @00:00:00.000; end change → `start:Math.min(start,end)` @23:59:59.999; empty value early-returns. `src/components/analytics/time-range-selector.tsx:28-36,62-74`
- **Date input value formatting** via `toLocalDateKey` using local `getFullYear/Month/Date`. `src/lib/date-utils.ts:66-69`; `time-range-selector.tsx:24-26,104,114`
- **Effective range precedence** `customRange ?? scopeRange`; page default scope `"7d"`, default tab `"summary"`; control strip in `flex items-center justify-between gap-2` row. `src/app/analytics/page.tsx:38,42,28,48-56`
- **Tabs** `TAB_VALUES` = `summary/correlations/records/titration`; `?tab=` syncs active tab. `src/app/analytics/page.tsx:16-37`
- **Export buttons** PDF `FileText` / CSV `Download`, both `lucide-react h-4 w-4 mr-1`, `variant="outline" size="sm"`; loading labels "Generating..." / "Exporting..." with per-button disabled state. `src/components/analytics/export-controls.tsx:54-72`
- **Toasts** PDF success "PDF exported"/"Health report downloaded."; CSV success "CSV exported"/"Health data downloaded."; errors "Export failed" + "Could not generate PDF report." / "Could not generate CSV export." `variant:"destructive"`; errors `console.error`. `src/components/analytics/export-controls.tsx:19-51`
- **CSV domains (11, no medication)** water,salt,sugar,potassium,weight,bp,eating,urination,defecation,caffeine,alcohol; header `timestamp,domain,value,unit,note`; ISO-8601 timestamp; sorted ascending by ISO string `localeCompare`; early return if 0 rows; filename `health-data-<yyyy-MM-dd>-<yyyy-MM-dd>.csv`. `src/lib/export-service.ts:84-131`
- **PDF Recent Records domains (8)** water,salt,sugar,potassium,weight,bp,caffeine,alcohol; last 10 per domain (`slice(-10)`); cap 50 (`slice(0,50)`). `src/lib/export-service.ts:276-293`
- **PDF rounding** BP avg `toFixed(0)`, slopes `toFixed(3)`, weight avg/min/max `toFixed(1)`, fluid `toFixed(0)`, adherence `(rate*100).toFixed(1)%`; title date `MMM d, yyyy`, table rows `MMM d, HH:mm`; table grid theme, header fill `[66,66,66]`, fontSize 8. `src/lib/export-service.ts:231-245,254-265,182-183,284,300-302`
- **PDF layout thresholds** section break `y>260`, line break `y>275`, page number baseline `y=290` ("Page i of N"), start `y=20`; filename `health-report-<yyyy-MM-dd>-<yyyy-MM-dd>.pdf`. `src/lib/export-service.ts:184,196,209,308-316`
- **PDF total data points** = fluid+bp+weight+adherence `dataPoints.length`. `src/lib/export-service.ts:219-223`
- **PDF section fallbacks** gated on `bp.value.readings.length`, `weight.value.readings.length`, `fluid.value.daily.length`, `adherence.value.total`; each prints a "No … in this period." line. `src/lib/export-service.ts:230-268`
- **domainUnit** water→ml, salt→mg, sugar→g, potassium→mg, weight→kg, bp→mmHg, urination→ml, eating→event, defecation→event, caffeine→mg, alcohol→std_drinks, medication→dose, default→"". `src/lib/export-service.ts:133-162`
- **getRecordsByDomain value semantics** water/salt/sugar/potassium=`amount`, weight=`weight`, bp=`systolic`, urination=`URINATION_ESTIMATE_ML[amountEstimate ?? "medium"] ?? 300`, eating=1, defecation=1, caffeine=`amountMg ?? 0`, alcohol=`amountStandardDrinks ?? 0`, medication=`[]`. `src/lib/analytics-service.ts:74-158`
- **URINATION_ESTIMATE_ML** small→150, medium→300, large→500. `src/lib/analytics-types.ts:166-170`
- **Trend directions** `"rising" | "falling" | "stable"`; **correlation strength** `"strong" | "moderate" | "weak" | "none"`. `src/lib/analytics-types.ts:92,132`
- **Lag defaults** `DEFAULT_SALT_WEIGHT_LAG_DAYS=2`, `DEFAULT_SUGAR_WEIGHT_LAG_DAYS=2`, `DEFAULT_POTASSIUM_WEIGHT_LAG_DAYS=2`; `pairedDays < 3` → not meaningful. `src/lib/analytics-types.ts:173-179`; `src/lib/analytics-stats.ts:146`
- **Default hook units** fluid→ml, adherence→ratio, bp→mmHg, weight→kg, correlation→correlation; every hook seeds a zeroed DEFAULT and uses `useLiveQuery` (reactive, no loading state). `src/hooks/use-analytics-queries.ts:44,58,72,84,98,110-228`
- **Hook set & signatures** `useTimeScopeRange`, `useFluidBalance`, `useAdherenceRate(range, prescriptionId?)`, `useBPTrend`, `useWeightTrend`, `useSaltVsWeight/useSugarVsWeight/usePotassiumVsWeight(range, lagDays?)`, `useCaffeineVsBP`, `useAlcoholVsBP`, `useCorrelation(domainA, domainB, range, lagDays?)`. `src/hooks/use-analytics-queries.ts:110-228`
- **Intro dialog** `mounted && !seen` open guard (SSR/hydration), `onOpenChange` close → `setSeen(true)`, "Got it" → `setSeen(true)`; title "Your analytics", desc "A quick look at what this page can do."; block1 "On this device" `BarChart3` `text-sky-600 dark:text-sky-400`; block2 "With CloudSync" `Cloud` `text-violet-600 dark:text-violet-400` + `Sparkles` `text-violet-500`; no CloudSync enable shortcut (Settings only). `src/components/analytics/analytics-intro-dialog.tsx:21-79`
- **Settings flag** `analyticsIntroSeen: boolean` default `false`, setter `setAnalyticsIntroSeen`, persisted via zustand `persist` to localStorage `intake-tracker-settings`. `src/stores/settings-store.ts:96,217,406,460-465`
- **DOMAINS (12)** water,salt,sugar,potassium,weight,bp,eating,urination,defecation,caffeine,alcohol,medication. `src/lib/analytics-types.ts:7-20`
- **Fluid target rule** `target = urinationEstimatedMl + 500`; `balance = intakeMl − urinationEstimatedMl`. `src/lib/analytics-service.ts:221-223`
- **escapeCSVField** quotes fields containing `,` `"` `\n`, doubles internal quotes; re-exported as `_escapeCSVField`. `src/lib/export-service.ts:23-28,320`
- **triggerDownload** in-memory `Blob` + `createObjectURL`, click, `revokeObjectURL` after. `src/lib/export-service.ts:38-47`
- **TimeRange / DataPoint / AnalyticsResult / result types** all field shapes match the "Data model" section. `src/lib/analytics-types.ts:26-140`

## Low-confidence / could-not-verify

- None. All "Files covered" were read in full and every concrete claim was traced to source. The only items not 100%-pinned are interpretive (whether `dataPointsToCSVRows` should be called a "helper" given it is dead code — flagged low) and whether the lexical PDF table sort constitutes an inaccuracy (the doc hedges it correctly in the rules section, so flagged low rather than medium).
