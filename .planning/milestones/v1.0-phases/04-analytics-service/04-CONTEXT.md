# Phase 4: Analytics Service - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

A dedicated cross-domain analytics service (`analytics-service.ts`) that aggregates data across all health domains, provides correlation queries, computed insights, and statistical analysis. Includes a new `/analytics` page (replacing `/history`) with tabbed sections for records, insights, correlations, and titration reports. Also includes first-class caffeine and alcohol substance tracking with schema, dashboard UI, and AI enrichment. Adds PDF and CSV export capability.

</domain>

<decisions>
## Implementation Decisions

### Query Architecture
- **Two-layer design** — composable building blocks at the bottom (getRecordsByDomain, groupByDay, correlate), pre-built convenience queries on top (fluidBalance, adherenceRate, bpTrend)
- **Three outcome metrics** — BP, weight, and medication adherence are the primary outcomes correlated against inputs (fluid, salt, caffeine, medication doses, titration phases)
- **Full correlation kit** — fluid balance (intake vs urination vs 500ml target), BP vs medication timing/titration, weight vs salt (configurable lag), caffeine vs BP/meds, alcohol vs BP
- **Best-effort text extraction** — scan existing water intake notes for caffeine/alcohol keywords ("coffee", "tea", "beer") to provide signal from historical data
- **Plain serializable return types** — all query results are simple `{ value, unit, period, dataPoints }` objects. No class instances. Ready for JSON serialization to future AI agent via function calling
- **Query registry** — export a manifest of available queries with parameter schemas and descriptions. AI agent can discover and select queries programmatically
- **Queries + computed insights** — service returns both raw computed data AND derived observations (trend direction, notable changes, threshold alerts)
- **Full statistical analysis** — moving averages, standard deviation, linear regression, anomaly detection. Use a lightweight stats library (e.g., simple-statistics)

### Fluid Balance
- **Daily totals AND intraday time-series** — daily summary for trends over time, plus per-event intraday view showing cumulative intake minus cumulative output
- **Per-event intraday granularity** — every intake and urination record plotted as a point, running balance steps up/down at each event
- **500ml above output target** — the core "am I hydrated?" metric, tracked against the configured goal

### BP Correlation
- **Service provides BP and medication data separately** — returns BP time-series and medication phase timeline independently. Consumer (UI/AI) handles overlay and correlation
- **BP is correlated against** — medication adherence, titration phase active at time of reading, caffeine intake, fluid intake, salt intake

### Weight Correlation
- **Salt-to-weight lag** — correlate weight with prior-day salt intake using a configurable lag period. Claude picks a clinically reasonable default
- **Weight tracked against** — fluid intake, salt intake, medication phase changes

### Time Windowing
- **Preset scopes** — 24h, 7d, 30d, 90d, all-time
- **Arbitrary date range** — user picks start and end date via date picker
- **Phase-aligned windows** — auto-align to medication phases ("show me Titration Week 1", "Maintenance since March"). Derived from phase start/end dates
- **Titration report** — full health snapshot per medication phase (BP, weight, fluid balance, adherence, anomalies)
- **Midnight day boundary** — daily aggregation uses calendar days (midnight-midnight), not day-start-hour
- **Design for growth** — handle any data volume gracefully. Chunk large queries if needed

### Analytics Page
- **New `/analytics` route** — replaces `/history`. Nav tab renamed from "History" to "Analytics"
- **Tabbed sections** — Records | Insights | Correlations | Titration
- **Shared time range selector** — one picker at the top, applies across all tabs
- **Records tab** — migrated from /history with edit/delete functionality preserved. Record view design is Claude's discretion
- **Insights tab** — auto-generated headline insights at top, with drill-down into any metric for custom analysis
- **Correlations tab** — pre-configured correlations shown by default (BP vs meds, weight vs salt), plus "Custom comparison" to pick any two domains
- **Titration tab** — shows all active prescriptions' titration timelines with full health snapshot per phase
- **Insight banners** — dismissable. Dashboard shows compact badge ("2 insights"), tapping navigates to /analytics for details. Insights don't reappear until condition changes after recovery

### Substance Tracking (Caffeine & Alcohol)
- **Standalone `substanceRecords` table** — `{ id, type: 'caffeine' | 'alcohol', amountMg, amountStandardDrinks, description, source: 'water_intake' | 'eating' | 'standalone', sourceRecordId?: string, timestamp, timezone, ...syncFields }`
- **Type limited to caffeine + alcohol** — not a generic substance tracker. Expand later if needed
- **Simple logging with AI enrichment** — user logs a description ("double espresso", "2 beers"), AI estimates caffeine_mg or alcohol_ml. Manual override available
- **Increment pattern on dashboard** — caffeine and alcohol rows alongside water/salt with quick-add buttons
- **Type picker on tap** — caffeine: Coffee (95mg) | Espresso (63mg) | Tea (47mg) | Other. Alcohol: Beer | Wine | Spirit | Other. Each logs 1 unit with type recorded
- **Auto-create linked water intake** — logging caffeine/alcohol automatically creates a linked intakeRecord for fluid balance. Prompt with pre-filled default volume (coffee=250ml, beer=330ml, etc.), user confirms or adjusts
- **Configurable in settings** — user can customize types, reorder, and change default amounts in /settings
- **Standard drinks for alcohol** — log as standard drinks, AI enrichment can estimate ml of pure alcohol when available

### Data Migration
- **Two-pass approach** — Pass 1 (Dexie migration): keyword-match existing water intake notes for caffeine/alcohol keywords, create substanceRecords with default amounts. Pass 2 (background, post-app-load): send matched notes to Perplexity AI for refined estimates
- **Auto-migrate during schema upgrade** — keyword matching is safe inside Dexie migration (no network). AI enrichment runs after app fully loads

### Existing Code Replacement
- **Replace `use-graph-data.ts`** — analytics service subsumes its functionality. Main dashboard charts call analytics queries instead
- **Replace `use-history-queries.ts`** — analytics hooks replace this for the /analytics page
- **Remove `/history` route** — merged into `/analytics`. All record browsing and analytics in one unified page
- **Charting library** — whether to continue with Recharts or switch is Claude's discretion based on the chart types needed (overlaid time-series, correlation scatter plots)

### Export
- **PDF report** — full health snapshot: medication history, BP trends, weight, fluid balance, adherence, insights. For doctor appointments
- **CSV export** — raw analytics data for external analysis tools
- **Both accessible from /analytics page**

### Notifications
- **In-app insight banners** — notable insights surface as dismissable banners. Dashboard shows compact badge, /analytics shows detail
- **Condition-based reappearance** — dismissed insights don't reappear until the underlying condition changes (e.g., adherence drops again after recovering)

### Performance
- **Fully offline** — all analytics computed client-side from IndexedDB. No server dependency. Consistent with offline-first architecture
- **Loading UX, downsampling, prefetch, caching** — all Claude's discretion based on performance profiling and mobile constraints

### Claude's Discretion
- Records tab view design (domain-filtered vs unified timeline)
- Charting library choice (Recharts vs alternative)
- Loading UX (skeleton vs progressive rendering)
- Data downsampling strategy for large datasets
- Prefetch strategy (on-demand vs background prefetch)
- Caching strategy for expensive queries
- Analytics page layout design (mobile-first, max-w-lg)
- Salt-to-weight lag default value
- Stats library selection
- Location-based comparison (SA vs Germany periods using timezone field)

</decisions>

<specifics>
## Specific Ideas

- "How am I doing against the 500ml more than I'm urinating goal" — the core fluid balance question
- "Taking into account the salt in all the fluctuations of data" — salt's water retention effect on weight, with configurable time lag
- "Checking caffeine against the medication and blood pressure readings" — caffeine as a confounder in BP analysis
- "Seeing if higher intake of water is genuinely increasing blood pressure or is my blood pressure seemingly normalising regardless of intakes" — the key clinical question: is treatment working independent of intake behavior?
- "I need to be able to compare all of them to track BP against my medication titration, the time of medication doses and the readings" — BP as the primary outcome metric, everything else is an input
- Beer is consumed regularly enough to warrant tracking for BP correlation
- Caffeine currently lives in water intake notes as free text — needs structured extraction

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `use-graph-data.ts`: Has `fetchGraphData()` and `computeMetrics()` — proto-analytics that will be replaced. Pattern of parallel Promise.all across domain services is reusable
- `use-history-queries.ts`: Cross-domain data loading with useLiveQuery — pattern reusable for analytics hooks
- `dose-schedule-service.ts`: Derives daily dose schedule at read time — analytics can call this for adherence calculation
- `audit-service.ts`: Append-only audit logging — analytics can query audit trail for mutation history
- `inventory-service.ts`: Stock recalculation from transactions — pattern for derived analytics
- All domain services have `getXByDateRange(startTime, endTime)` — consistent query interface for analytics aggregation
- Toast hook (`use-toast.ts`): For insight banner notifications
- Zustand settings store: For user preferences (configurable substance types/amounts)

### Established Patterns
- Services in `src/lib/*-service.ts`, hooks in `src/hooks/use-*-queries.ts`
- useLiveQuery for all reads, useMutation for writes (Phase 3 decision)
- ServiceResult<T> for mutations, direct T for reads
- syncFields() for record creation (includes timezone)
- Recharts for existing charts in /history

### Integration Points
- Main dashboard (`/`) needs caffeine/alcohol rows and insight badge
- Navigation needs "Analytics" tab replacing "History"
- `/settings` needs substance type configuration section
- Dexie schema needs v12 migration for substanceRecords table
- Perplexity API route needs substance parsing capability
- `backup-service.ts` needs to include substanceRecords in exports

</code_context>

<deferred>
## Deferred Ideas

- Natural language AI querying against health data (AIQL-01) — v2 milestone, but query registry in this phase prepares for it
- Real-time chat with health data ("ask your data questions") — v2
- Generic substance tracking beyond caffeine/alcohol — expand if needed later
- Capacitor Android wrapper for better notification support — future milestone

</deferred>

---

*Phase: 04-analytics-service*
*Context gathered: 2026-03-09*
