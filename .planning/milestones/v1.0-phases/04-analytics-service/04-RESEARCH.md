# Phase 4: Analytics Service - Research

**Researched:** 2026-03-09
**Domain:** Cross-domain analytics service, substance tracking, analytics UI, statistical analysis, PDF/CSV export
**Confidence:** HIGH

## Summary

Phase 4 is the largest phase to date -- it spans six distinct concerns: (1) a read-only analytics service with composable building blocks and pre-built queries, (2) a new substanceRecords Dexie table with schema migration, (3) substance tracking UI on the dashboard, (4) a full `/analytics` page replacing `/history`, (5) statistical analysis with simple-statistics, and (6) PDF/CSV export. The service layer is well-prepared: all domain services already expose `getXByDateRange(startTime, endTime)` methods, and the existing `use-graph-data.ts` demonstrates the parallel `Promise.all` aggregation pattern that analytics-service.ts will formalize.

The critical architectural insight is that `analytics-service.ts` is a **pure read layer** -- it calls existing domain services, performs computations, and returns plain serializable objects. It never writes to the database. This aligns with the project's established pattern where services live in `src/lib/*-service.ts` and hooks in `src/hooks/use-*-queries.ts`, using `useLiveQuery` for all reads.

**Primary recommendation:** Structure the phase into distinct waves: (1) analytics service core + types, (2) substance tracking schema + service, (3) analytics hooks + page UI, (4) statistical analysis + insights, (5) export capabilities. Each wave is independently testable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Two-layer query design: composable building blocks + pre-built convenience queries
- Three outcome metrics: BP, weight, medication adherence correlated against inputs
- Full correlation kit: fluid balance, BP vs medication, weight vs salt, caffeine vs BP/meds, alcohol vs BP
- Best-effort text extraction from existing intake notes for caffeine/alcohol keywords
- Plain serializable return types: `{ value, unit, period, dataPoints }`
- Query registry with parameter schemas for AI agent discovery
- Full statistical analysis: moving averages, std dev, linear regression, anomaly detection
- Daily totals AND intraday time-series for fluid balance
- Per-event intraday granularity for fluid balance
- 500ml above output target for hydration
- Service provides BP and medication data separately (consumer handles overlay)
- Salt-to-weight lag with configurable period
- Preset scopes: 24h, 7d, 30d, 90d, all-time
- Arbitrary date range support
- Phase-aligned time windows
- Titration report per medication phase
- Midnight day boundary for daily aggregation (not day-start-hour)
- New `/analytics` route replaces `/history`, nav tab renamed
- Tabbed sections: Records | Insights | Correlations | Titration
- Shared time range selector across all tabs
- Standalone `substanceRecords` table with specific schema
- Type limited to caffeine + alcohol
- Simple logging with AI enrichment
- Increment pattern on dashboard with quick-add buttons
- Type picker: caffeine (Coffee/Espresso/Tea/Other), alcohol (Beer/Wine/Spirit/Other)
- Auto-create linked water intake when logging caffeine/alcohol
- Configurable substance types in settings
- Standard drinks for alcohol logging
- Two-pass data migration: keyword match in Dexie migration, AI enrichment post-load
- Replace `use-graph-data.ts` and `use-history-queries.ts`
- PDF report and CSV export from /analytics page
- In-app insight banners with condition-based reappearance
- Fully offline computation, no server dependency
- Insight banners dismissable, dashboard shows compact badge

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

### Deferred Ideas (OUT OF SCOPE)
- Natural language AI querying against health data (AIQL-01) -- v2, but query registry prepares for it
- Real-time chat with health data -- v2
- Generic substance tracking beyond caffeine/alcohol
- Capacitor Android wrapper
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRVC-05 | Cross-domain analytics service (`analytics-service.ts`) as query seam for future AI analysis | Core deliverable -- two-layer query architecture, query registry, serializable return types, statistical analysis. All domain services already provide `getXByDateRange()` for aggregation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| simple-statistics | ^7.8 | Statistical analysis (linear regression, std dev, correlation, z-scores) | ~1M monthly downloads, zero dependencies, tree-shakeable, covers all required stats functions |
| recharts | 2.15.4 | Charts (already installed) | Already in use for BP/weight/intake charts. Supports ComposedChart, ScatterChart, multiple Y-axes, LineChart -- sufficient for all needed chart types |
| jspdf | ^2.5 | Client-side PDF generation | Most popular client-side PDF lib, works offline, ~150KB minified |
| date-fns | ^4.1.0 | Date manipulation (already installed) | Already in use, provides `startOfDay`, `endOfDay`, `eachDayOfInterval`, `format` |
| dexie | ^4.0.8 | IndexedDB (already installed) | Already in use, needs v12 migration for substanceRecords |
| zod | 3 | Validation (already installed) | Already in use for boundary validation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jspdf-autotable | ^3.8 | Table generation in PDFs | For structured health data tables in PDF reports |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | Nivo, Victory, Chart.js | Recharts already installed and in use -- switching adds bundle size and learning curve for no benefit |
| jsPDF | @react-pdf/renderer | react-pdf is heavier (~400KB) and designed for server rendering; jsPDF is lighter and works offline |
| simple-statistics | stdlib, mathjs | stdlib/mathjs are much larger; simple-statistics is purpose-built for exactly these use cases |

### Discretion Recommendation: Charting Library
**Use Recharts (keep current).** The project already uses `ComposedChart` (intake-chart.tsx), `LineChart` (bp-chart.tsx, weight-chart.tsx). Recharts supports all needed chart types: overlaid time-series via `ComposedChart`, scatter plots via `ScatterChart`, and multiple Y-axes. No benefit to switching.

### Discretion Recommendation: Stats Library
**Use simple-statistics.** It provides `linearRegression`, `linearRegressionLine`, `standardDeviation`, `sampleCorrelation`, `zScore`, `mean`, `median`, `quantile`, and `interquartileRange`. Moving average is not built-in but trivial to implement (sliding window over sorted array). Zero dependencies, tree-shakeable.

### Discretion Recommendation: Salt-to-Weight Lag Default
**Use 2 days.** Clinically, sodium-related water retention typically manifests 24-48 hours after intake. A 2-day default lag is a reasonable starting point; the user can adjust.

**Installation:**
```bash
pnpm add simple-statistics jspdf jspdf-autotable
```

## Architecture Patterns

### Recommended Project Structure
```
src/lib/
├── analytics-service.ts          # Core analytics service (read-only)
├── analytics-types.ts            # Shared types for analytics results
├── analytics-registry.ts         # Query registry manifest for AI agent
├── analytics-stats.ts            # Statistical helper functions (wraps simple-statistics)
├── substance-service.ts          # CRUD for substanceRecords
├── export-service.ts             # PDF/CSV generation
src/hooks/
├── use-analytics-queries.ts      # useLiveQuery hooks for analytics
├── use-substance-queries.ts      # useLiveQuery hooks for substances
src/app/
├── analytics/
│   └── page.tsx                  # Analytics page (replaces /history)
src/components/
├── analytics/
│   ├── records-tab.tsx           # Records browsing (migrated from /history)
│   ├── insights-tab.tsx          # Auto-generated insights
│   ├── correlations-tab.tsx      # Cross-domain correlations
│   ├── titration-tab.tsx         # Medication phase reports
│   ├── time-range-selector.tsx   # Shared time range picker
│   └── insight-banner.tsx        # Dismissable insight component
├── substance/
│   ├── substance-row.tsx         # Dashboard row for caffeine/alcohol
│   └── substance-type-picker.tsx # Quick-add type selector
```

### Pattern 1: Two-Layer Query Architecture
**What:** Composable building blocks at the bottom, pre-built convenience queries on top
**When to use:** Always -- this is the core architecture of the analytics service

```typescript
// Layer 1: Building blocks
async function getRecordsByDomain(domain: Domain, start: number, end: number) { ... }
function groupByDay(records: TimestampedRecord[]): Map<string, TimestampedRecord[]> { ... }
function correlate(seriesA: DataPoint[], seriesB: DataPoint[], lagDays?: number): CorrelationResult { ... }

// Layer 2: Pre-built queries
async function fluidBalance(start: number, end: number): Promise<FluidBalanceResult> {
  const water = await getRecordsByDomain('water', start, end);
  const urination = await getRecordsByDomain('urination', start, end);
  const daily = groupByDay([...water, ...urination]);
  // ... compute balance
}
```

### Pattern 2: Serializable Return Types
**What:** All query results are plain objects, no class instances, ready for JSON serialization
**When to use:** Every analytics query return type

```typescript
// Good: Plain serializable object
interface AnalyticsResult<T> {
  value: T;
  unit: string;
  period: { start: number; end: number };
  dataPoints: DataPoint[];
  meta?: Record<string, unknown>;
}

// Bad: Class instance, non-serializable
class AnalyticsResult { /* ... */ }
```

### Pattern 3: Query Registry for AI Agent Discovery
**What:** Exported manifest of available queries with parameter schemas
**When to use:** One registry file, updated when queries are added

```typescript
export interface QueryDescriptor {
  id: string;
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: Record<string, unknown>) => Promise<AnalyticsResult<unknown>>;
}

export const queryRegistry: QueryDescriptor[] = [
  {
    id: 'fluid_balance',
    name: 'Fluid Balance',
    description: 'Daily and intraday fluid balance (intake vs urination vs 500ml target)',
    parameters: TimeRangeSchema,
    execute: (p) => fluidBalance(p.start as number, p.end as number),
  },
  // ...
];
```

### Pattern 4: useLiveQuery for Analytics Hooks
**What:** All analytics reads use useLiveQuery (consistent with Phase 3 decision), with default empty values
**When to use:** Every analytics hook

```typescript
export function useFluidBalance(start: number, end: number) {
  return useLiveQuery(
    () => fluidBalance(start, end),
    [start, end],
    DEFAULT_FLUID_BALANCE // eliminates loading state
  );
}
```

### Pattern 5: Substance Record Linked to Intake Record
**What:** Logging caffeine/alcohol auto-creates a linked intakeRecord for fluid balance
**When to use:** Every substance creation

```typescript
async function addSubstanceRecord(input: AddSubstanceInput): Promise<ServiceResult<SubstanceRecord>> {
  return db.transaction('rw', [db.substanceRecords, db.intakeRecords], async () => {
    const substance = { id: generateId(), ...input, ...syncFields() };
    await db.substanceRecords.add(substance);

    // Auto-create linked water intake if volume provided
    if (input.volumeMl) {
      await db.intakeRecords.add({
        id: generateId(),
        type: 'water',
        amount: input.volumeMl,
        timestamp: input.timestamp,
        source: `substance:${substance.id}`,
        note: input.description,
        ...syncFields(),
      });
    }
    return ok(substance);
  });
}
```

### Anti-Patterns to Avoid
- **Writing from analytics service:** The service MUST be pure reads. Never add, update, or delete records from analytics-service.ts
- **Class instances in return types:** Everything must be plain objects for JSON serialization
- **Importing db.ts from analytics-service.ts:** Analytics should call domain services, not touch Dexie directly. This preserves service layer boundaries (SRVC-04)
- **Using day-start-hour for daily aggregation:** The context explicitly says midnight-midnight boundaries, not the configurable day-start-hour
- **Blocking Dexie migration with network calls:** Keyword matching is safe in migration; AI enrichment must run post-app-load

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Linear regression | Custom least-squares | `simple-statistics.linearRegression()` + `linearRegressionLine()` | Edge cases with collinear data, numerical stability |
| Standard deviation | Manual sqrt(variance) | `simple-statistics.sampleStandardDeviation()` | Sample vs population distinction matters |
| Correlation coefficient | Manual Pearson calculation | `simple-statistics.sampleCorrelation()` | Handles edge cases (constant series, single point) |
| Z-score / anomaly detection | Custom threshold logic | `simple-statistics.zScore()` | Standardized, well-tested |
| PDF generation | Manual PDF byte manipulation | jsPDF with autotable plugin | PDF spec is extremely complex |
| CSV escaping | Custom string concatenation | Proper CSV with field quoting | Edge cases: commas in notes, newlines, Unicode |
| Date range iteration | Manual loop with setDate | `date-fns.eachDayOfInterval()` | Handles month/year boundaries, DST |

**Key insight:** Statistical functions have subtle correctness requirements (sample vs population, numerical stability, edge cases with empty/single-element datasets). Using simple-statistics avoids these pitfalls.

**Moving average** is the one stat function NOT in simple-statistics. Implement as a simple sliding window:
```typescript
function movingAverage(data: number[], windowSize: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < windowSize - 1) return null;
    const window = data.slice(i - windowSize + 1, i + 1);
    return mean(window); // from simple-statistics
  });
}
```

## Common Pitfalls

### Pitfall 1: Dexie Migration with Network Calls
**What goes wrong:** AI enrichment (Perplexity API call) inside Dexie version upgrade blocks migration and fails offline
**Why it happens:** Temptation to do everything in one pass
**How to avoid:** Two-pass approach as specified -- Pass 1 (keyword match) runs in migration synchronously, Pass 2 (AI enrichment) runs after app fully loads via a background effect
**Warning signs:** Any `fetch()` or API call inside `db.version(N).upgrade()`

### Pitfall 2: Forgetting Full Schema in New Dexie Version
**What goes wrong:** Tables disappear when adding v12 for substanceRecords
**Why it happens:** Dexie requires ALL store definitions repeated in each version call
**How to avoid:** Copy all stores from v11, add substanceRecords table
**Warning signs:** Missing tables after migration

### Pitfall 3: Using day-start-hour Instead of Midnight
**What goes wrong:** Daily aggregation produces different results than expected
**Why it happens:** The dashboard uses `dayStartHour` from settings for "today's budget" but analytics uses midnight-midnight
**How to avoid:** Always use `startOfDay()` / `endOfDay()` from date-fns for analytics daily boundaries
**Warning signs:** Discrepancies between dashboard totals and analytics totals (expected -- different boundary definitions)

### Pitfall 4: Analytics Service Importing db.ts Directly
**What goes wrong:** Violates SRVC-04 (service layer boundaries)
**Why it happens:** Seems easier to query db directly for cross-domain aggregation
**How to avoid:** Analytics service calls domain services (intake-service, health-service, etc.) only. Exception: substance-service.ts CAN import db.ts since it owns the substanceRecords table
**Warning signs:** Import of `db` in analytics-service.ts

### Pitfall 5: Large Dataset Performance on Mobile
**What goes wrong:** Computing 90-day or all-time analytics hangs the UI
**Why it happens:** Processing thousands of records synchronously blocks the main thread
**How to avoid:** Consider chunking large queries, using requestIdleCallback, or Web Workers for heavy stats. useLiveQuery with default values means the UI renders instantly with empty/default data while computation runs
**Warning signs:** UI jank when switching to 90d or all-time scope

### Pitfall 6: Insight Banner State Management
**What goes wrong:** Dismissed insights reappear on every render
**Why it happens:** Insight state needs to persist and track the "condition" that triggered it
**How to avoid:** Store dismissed insight IDs + trigger values in Zustand/localStorage. Only re-show when the underlying value changes significantly from when it was dismissed
**Warning signs:** Insights flickering or reappearing after page navigation

### Pitfall 7: Substance-Intake Linking Atomicity
**What goes wrong:** Substance record created but linked intake record fails, or vice versa
**Why it happens:** Two writes not wrapped in a transaction
**How to avoid:** Use `db.transaction('rw', [db.substanceRecords, db.intakeRecords], async () => { ... })` -- consistent with Phase 3's atomicity pattern (SRVC-01)
**Warning signs:** Orphaned substance records without linked intake records

## Code Examples

### Fluid Balance Query (Building Block + Convenience)
```typescript
// analytics-service.ts
import { getRecordsByDateRange } from './intake-service';
import { getUrinationRecordsByDateRange } from './urination-service';
import type { AnalyticsResult, FluidBalanceDay } from './analytics-types';

export async function fluidBalance(
  start: number,
  end: number,
): Promise<AnalyticsResult<FluidBalanceDay[]>> {
  const [waterRecords, urinationRecords] = await Promise.all([
    getRecordsByDateRange(start, end, 'water'),
    getUrinationRecordsByDateRange(start, end),
  ]);

  const days = groupByDay([
    ...waterRecords.map(r => ({ timestamp: r.timestamp, value: r.amount, domain: 'water' as const })),
    ...urinationRecords.map(r => ({ timestamp: r.timestamp, value: 1, domain: 'urination' as const })),
  ]);

  const dataPoints: FluidBalanceDay[] = Array.from(days.entries()).map(([date, records]) => {
    const intake = records.filter(r => r.domain === 'water').reduce((s, r) => s + r.value, 0);
    const outputs = records.filter(r => r.domain === 'urination').length; // count-based
    return { date, intakeMl: intake, urinationCount: outputs };
  });

  return {
    value: dataPoints,
    unit: 'ml',
    period: { start, end },
    dataPoints: dataPoints.map(d => ({ timestamp: new Date(d.date).getTime(), value: d.intakeMl })),
  };
}
```

### Medication Adherence Query
```typescript
import { getDoseScheduleForDateRange } from './dose-schedule-service';

export async function adherenceRate(
  start: number,
  end: number,
  prescriptionId?: string,
): Promise<AnalyticsResult<number>> {
  const startDate = format(new Date(start), 'yyyy-MM-dd');
  const endDate = format(new Date(end), 'yyyy-MM-dd');
  const schedule = await getDoseScheduleForDateRange(startDate, endDate);

  let total = 0;
  let taken = 0;
  for (const [, slots] of schedule) {
    for (const slot of slots) {
      if (prescriptionId && slot.prescriptionId !== prescriptionId) continue;
      total++;
      if (slot.status === 'taken') taken++;
    }
  }

  const rate = total > 0 ? taken / total : 0;
  return {
    value: rate,
    unit: 'ratio',
    period: { start, end },
    dataPoints: [], // could be daily breakdown
  };
}
```

### Keyword Extraction for Historical Substance Data
```typescript
// Inside Dexie v12 migration
const CAFFEINE_KEYWORDS = ['coffee', 'espresso', 'tea', 'caffeine', 'matcha', 'latte', 'cappuccino'];
const ALCOHOL_KEYWORDS = ['beer', 'wine', 'whiskey', 'vodka', 'gin', 'rum', 'cocktail', 'spirit', 'alcohol'];

const DEFAULT_CAFFEINE_MG: Record<string, number> = {
  coffee: 95, espresso: 63, tea: 47, latte: 95, cappuccino: 95, matcha: 70,
};

// In upgrade function:
const intakeRecords = await trans.table('intakeRecords').toArray();
for (const record of intakeRecords) {
  const note = (record.note ?? '').toLowerCase();
  if (!note) continue;

  const caffeineMatch = CAFFEINE_KEYWORDS.find(kw => note.includes(kw));
  const alcoholMatch = ALCOHOL_KEYWORDS.find(kw => note.includes(kw));

  if (caffeineMatch) {
    await trans.table('substanceRecords').add({
      id: crypto.randomUUID(),
      type: 'caffeine',
      amountMg: DEFAULT_CAFFEINE_MG[caffeineMatch] ?? 95,
      description: record.note,
      source: 'water_intake',
      sourceRecordId: record.id,
      timestamp: record.timestamp,
      ...migrationSyncFields(record),
    });
  }
  // Similar for alcohol...
}
```

### CSV Export
```typescript
export function exportToCSV(data: AnalyticsResult<unknown>, filename: string): void {
  const rows = (data.dataPoints as Array<Record<string, unknown>>);
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]!);
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '');
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `use-graph-data.ts` fetches all domains | Analytics service with composable queries | This phase | Replaces monolithic fetch with targeted queries |
| `use-history-queries.ts` loads all records | Analytics hooks with date range + domain filtering | This phase | Replaces bulk load with scoped queries |
| `/history` route | `/analytics` route with tabs | This phase | Unifies record browsing + insights + correlations |
| Free-text caffeine/alcohol notes | Structured substanceRecords table | This phase | Enables correlation analysis |
| No statistical analysis | simple-statistics integration | This phase | Enables trend detection, anomaly flagging |

## Open Questions

1. **Urination volume estimation**
   - What we know: UrinationRecord has `amountEstimate?: string` ("small"/"medium"/"large"), not numeric ml
   - What's unclear: How to compute fluid balance accurately without numeric output volume
   - Recommendation: Use count-based proxy for urination (each event = 1 unit). The "500ml above output" target can be interpreted as "500ml above estimated losses" using rough estimates (small=150ml, medium=300ml, large=500ml)

2. **All-time query performance**
   - What we know: User may have months/years of data, all computed client-side
   - What's unclear: Whether all-time queries over thousands of records cause UI lag on mobile
   - Recommendation: Implement with requestIdleCallback or chunked processing; measure actual performance before adding Web Workers

3. **Insight banner persistence scope**
   - What we know: Insights should be dismissable and not reappear until condition changes
   - What's unclear: Exact threshold for "condition changed" (e.g., adherence drops from 95% to 80% -- is 90% a trigger?)
   - Recommendation: Store dismissed insight with its trigger value. Re-show when value differs by > 10% from dismissed value

4. **Substance migration data quality**
   - What we know: Keyword matching from free-text notes will have false positives/negatives
   - What's unclear: How much historical data contains substance references
   - Recommendation: Accept imperfect extraction; user can manually correct. AI enrichment pass improves estimates post-load

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.18 + fake-indexeddb ^6.2.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test --coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRVC-05a | Fluid balance query returns correct daily totals | unit | `pnpm test -- src/lib/analytics-service.test.ts -t "fluid balance"` | Wave 0 |
| SRVC-05b | Medication adherence rate computed correctly | unit | `pnpm test -- src/lib/analytics-service.test.ts -t "adherence"` | Wave 0 |
| SRVC-05c | BP trend correlation with medication phases | unit | `pnpm test -- src/lib/analytics-service.test.ts -t "bp trend"` | Wave 0 |
| SRVC-05d | Query registry lists all queries with valid schemas | unit | `pnpm test -- src/lib/analytics-registry.test.ts` | Wave 0 |
| SRVC-05e | Analytics results are JSON-serializable | unit | `pnpm test -- src/lib/analytics-service.test.ts -t "serializable"` | Wave 0 |
| SRVC-05f | Statistical functions (regression, std dev, correlation) | unit | `pnpm test -- src/lib/analytics-stats.test.ts` | Wave 0 |
| SRVC-05g | Substance record creation with linked intake | unit | `pnpm test -- src/lib/substance-service.test.ts` | Wave 0 |
| SRVC-05h | Dexie v12 migration keyword extraction | unit | `pnpm test -- src/__tests__/migration/v12.test.ts` | Wave 0 |
| SRVC-05i | CSV export correctness | unit | `pnpm test -- src/lib/export-service.test.ts -t "csv"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/analytics-service.test.ts` -- covers fluid balance, adherence, BP trend, serializability
- [ ] `src/lib/analytics-stats.test.ts` -- covers statistical helper functions
- [ ] `src/lib/analytics-registry.test.ts` -- covers query registry completeness
- [ ] `src/lib/substance-service.test.ts` -- covers substance CRUD + linked intake creation
- [ ] `src/lib/export-service.test.ts` -- covers CSV/PDF export
- [ ] `src/__tests__/migration/v12.test.ts` -- covers substanceRecords migration
- [ ] `pnpm add simple-statistics jspdf jspdf-autotable` -- new dependencies

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/lib/db.ts`, all `*-service.ts` files, `use-graph-data.ts`, `use-history-queries.ts` -- patterns and interfaces
- [simple-statistics docs](https://simple-statistics.github.io/docs/) -- API surface verified: linearRegression, standardDeviation, sampleCorrelation, zScore present; moving average absent
- [simple-statistics npm](https://www.npmjs.com/package/simple-statistics) -- v7.8.x, ~1M monthly downloads, zero deps

### Secondary (MEDIUM confidence)
- [Recharts ScatterChart](https://recharts.github.io/en-US/api/Scatter/) -- multiple Y-axes and scatter overlay confirmed
- [jsPDF GitHub](https://github.com/parallax/jsPDF) -- client-side PDF, ~150KB, works offline
- [jsPDF npm](https://www.npmjs.com/package/jspdf) -- v2.5.x

### Tertiary (LOW confidence)
- Salt-to-weight lag of 2 days -- based on general clinical knowledge of sodium-water retention, not verified against specific medical literature

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified via npm/docs, most already installed
- Architecture: HIGH -- follows established project patterns, CONTEXT.md is very specific
- Pitfalls: HIGH -- derived from actual codebase patterns and Dexie migration experience
- Statistical functions: HIGH -- verified against simple-statistics docs
- Salt-to-weight default: LOW -- clinical estimate, user can adjust

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain, no fast-moving dependencies)
