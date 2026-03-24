# Phase 16: Dashboard Cleanup and Text Metrics - Research

**Researched:** 2026-03-24
**Domain:** React component refactoring, Zustand migration, data aggregation hooks
**Confidence:** HIGH

## Summary

Phase 16 is a consolidation phase that reorganizes the dashboard, replaces inline graphs with text metrics, promotes BP heart rate to the primary input area, migrates coffee settings to a unified "Liquid Presets" manager, extends the LiquidPreset model for multi-substance beverages, and removes a significant amount of dead code from prior phases.

All the building blocks already exist in the codebase. The text metrics component reads from existing hooks (`useDailyIntakeTotal`, `useSubstanceRecordsByDateRange`). The Progress component from shadcn/ui already supports `indicatorClassName` for domain-colored gradient fills. The composable entry service already handles atomic multi-record creation. The Zustand persist migration pattern (v1 to v2) was established in Phase 13 and needs one more increment (v2 to v3).

The main complexity lies in three areas: (1) the TextMetrics component needs a weekly data aggregation strategy using `getRecordsByDateRange` from intake-service plus `getSubstanceRecordsByDateRange` from substance-service with Monday-start week calculation respecting the configurable dayStartHour, (2) the LiquidPreset interface migration from single `substancePer100ml` to multi-substance fields requires a Zustand persist migration (v2 to v3) that converts existing presets, and (3) the composable-entry-service needs extension to handle multi-substance logging where a single preset can create caffeine + alcohol + salt + water records atomically.

**Primary recommendation:** Structure the work in three waves: (1) data model changes (LiquidPreset interface + Zustand migration + composable entry service update), (2) new UI (TextMetrics component + BP heart rate promotion + Liquid Presets tab + page reordering), (3) dead code deletion + cleanup. This order ensures the data layer is stable before UI components consume it, and deletion happens last to avoid breaking anything mid-implementation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Text metrics section sits at the top of the intake page, above all cards. Acts as a dashboard overview visible without scrolling.
- **D-02:** Format: value / limit with thin colored progress bars. E.g., "Water: 1,200 / 2,000 ml" with a progress bar. Similar to Apple Health summary style.
- **D-03:** Metrics shown: today's water progress (vs limit), today's salt progress (vs limit), today's caffeine total, today's alcohol total, weekly summary (Monday-start) for water and salt.
- **D-04:** Replaces the `HistoricalGraph` component currently on page.tsx. Graphs move to the insights/analytics page in a future milestone.
- **D-05:** Full removal -- delete all replaced/unused UI components and their references: food-calculator.tsx, eating-card.tsx, voice-input.tsx, parsed-intake-display.tsx, historical-graph.tsx + sub-charts, old intake-card.tsx, customization-panel.tsx Coffee Tab.
- **D-06:** CustomizationPanel Coffee Tab becomes a "Liquid Presets" tab. Shows all presets (coffee + alcohol + beverage) with add/edit/delete. Replaces the old `coffeeDefaultType` single-value setting.
- **D-07:** The `coffeeDefaultType` field in settings store can be deprecated/removed. Default preset selection is handled by the `liquidPresets` array with `isDefault` flag.
- **D-08:** Heart rate input moves from the collapsible "More options" section to the primary input area alongside Systolic/Diastolic. The collapsible remains for optional fields (position, arm, irregular heartbeat).
- **D-09:** Cards on the intake page appear in order: Text Metrics (top) -> Liquids -> Food+Salt -> BP -> Weight -> Urination -> Defecation.
- **D-10:** LiquidPreset interface extended with composable substance fields -- ALL optional, any combination valid: caffeinePer100ml?, alcoholPer100ml?, saltPer100ml?, waterContentPercent (default 100), tab: "coffee" | "alcohol" | "beverage".
- **D-11:** When logging a multi-substance preset, the composable entry service creates linked records for ALL present substances (caffeine + alcohol + salt + water), calculated from volume * per-100ml values. Water amount = volume * waterContentPercent / 100.
- **D-12:** The old `substancePer100ml` single field on `LiquidPreset` is replaced by the individual per-100ml fields. Zustand persist migration handles the conversion.

### Claude's Discretion
- Text metrics component name and internal structure
- Progress bar styling (thin, colored per metric domain)
- Weekly summary format (table, stacked rows, etc.)
- Which sub-chart files to delete vs keep for insights page migration
- InsightBadge placement (keep at top or move into text metrics)
- Zustand persist migration version bump (v2 -> v3)

### Deferred Ideas (OUT OF SCOPE)
- Move HistoricalGraph to insights/analytics page -- separate milestone per original discussion
- Smart preset suggestions sorted by usage frequency -- needs usage data accumulation
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-06 | Heart rate input is always visible on the blood pressure card without expanding "more options" | BP card structure fully mapped: heart rate is at lines 282-303 inside the `showDetails` collapsible, systolic/diastolic primary inputs at lines 210-243. Simple JSX move between grid and Record button. |
| DASH-07 | Food calculator feature is removed from the codebase | food-calculator.tsx has zero external imports (only self + QuickNavFooter which has optional callback). Safe deletion confirmed. |
| DASH-08 | Intake page displays text-based metrics instead of graphs | Existing hooks provide all data: `useDailyIntakeTotal("water"/"salt")`, `useSubstanceRecordsByDateRange` for caffeine/alcohol. Progress component supports `indicatorClassName`. CARD_THEMES has all color tokens. Weekly data available via `getRecordsByDateRange`. |
| DASH-09 | Existing coffee settings are migrated to become liquid tab defaults/presets in the unified Liquids card | CustomizationPanel Coffee Tab isolated at lines 100-131. coffeeDefaultType used in only 3 files: settings-store.ts, intake-card.tsx (being deleted), customization-panel.tsx (being replaced). Zustand migration pattern established in Phase 13. |
| DASH-10 | Card ordering on intake page | page.tsx currently orders: InsightBadge -> HistoricalGraph -> Liquids+FoodSalt -> Weight+BP -> Urination+Defecation. New order: InsightBadge -> TextMetrics -> Liquids+FoodSalt -> BP+Weight -> Urination+Defecation. Simple JSX reorder. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Package manager:** pnpm only (enforced via preinstall hook)
- **Data layer:** All user data in IndexedDB via Dexie.js. Schema currently at version 14 (but NO Dexie schema changes needed in this phase -- LiquidPreset lives in Zustand/localStorage).
- **State management:** Zustand for settings (persisted to localStorage, currently at persist version 2), useLiveQuery for all reads, useMutation for writes
- **UI:** shadcn/ui components, Tailwind CSS, Outfit font, path alias `@/*` -> `src/*`
- **Conditional spread:** Required for exactOptionalPropertyTypes compliance
- **Soft-delete:** Uses `deletedAt: null` (not undefined) for IndexedDB indexability
- **Service boundary:** ESLint no-restricted-imports enforces components never import from services directly -- use hooks layer
- **Build verification:** `pnpm build` for production build, `pnpm lint` for ESLint
- **Testing:** `pnpm test` (Vitest), `pnpm test:e2e` (Playwright)

## Standard Stack

### Core (Already Installed -- No New Packages)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| Next.js 14 (App Router) | Framework | Project foundation |
| Dexie.js + dexie-react-hooks | IndexedDB ORM + reactive `useLiveQuery` | All data reads reactive |
| Zustand + persist middleware | Settings store + localStorage persistence | LiquidPreset storage, migration system |
| shadcn/ui (Radix primitives) | UI components: Progress, Card, Button, Input, Tabs, Dialog, Badge | All verified available |
| Tailwind CSS | Styling | All layout and color via utility classes |
| Lucide React | Icons: Droplets, Sparkles, Coffee, Wine | Metric row icons |
| zod | Schema validation | BP form validation (existing) |

### No New Dependencies Required
This phase requires zero new package installations. All functionality is implemented with existing libraries.

### Important: Do NOT Remove
| Library | Reason |
|---------|--------|
| recharts 2.15.4 | Still used by analytics page (`src/components/analytics/correlation-chart.tsx`, `correlations-tab.tsx`, `insights-tab.tsx`). Deleting dashboard charts does NOT make recharts removable. |

## Architecture Patterns

### Recommended Component Structure
```
src/components/
  text-metrics.tsx          # NEW: Dashboard overview section (D-01, D-02, D-03)
  blood-pressure-card.tsx   # MODIFIED: HR promoted to primary area (D-08)
  customization-panel.tsx   # MODIFIED: Coffee tab -> Liquid Presets tab (D-06)
src/components/liquids/
  preset-tab.tsx            # MODIFIED: Multi-substance logging via new preset model (D-11)
src/lib/
  constants.ts              # MODIFIED: LiquidPreset interface extended (D-10)
  composable-entry-service.ts  # MODIFIED: Multi-substance entry creation (D-11)
src/stores/
  settings-store.ts         # MODIFIED: coffeeDefaultType removed, persist v2->v3 (D-07, D-12)
src/app/
  page.tsx                  # MODIFIED: Remove HistoricalGraph, add TextMetrics, reorder cards (D-04, D-09)
```

### Pattern 1: Text Metrics Data Aggregation

The TextMetrics component aggregates data from multiple existing hooks. No new service functions are needed.

**Today's metrics (water/salt) -- existing hooks:**
```typescript
// useDailyIntakeTotal already exists and respects dayStartHour setting
const waterTotal = useDailyIntakeTotal("water"); // reactive via useLiveQuery, re-runs every 60s
const saltTotal = useDailyIntakeTotal("salt");
const waterLimit = useSettingsStore((s) => s.waterLimit);
const saltLimit = useSettingsStore((s) => s.saltLimit);
```

**Today's metrics (caffeine/alcohol) -- existing hooks with date scoping:**
```typescript
// useSubstanceRecordsByDateRange for daily scoping, getDayStartTimestamp for boundary
const dayStartHour = useSettingsStore((s) => s.dayStartHour);
const dayStart = useMemo(() => getDayStartTimestamp(dayStartHour), [dayStartHour]);
const caffeineRecords = useSubstanceRecordsByDateRange(dayStart, Date.now(), "caffeine");
const alcoholRecords = useSubstanceRecordsByDateRange(dayStart, Date.now(), "alcohol");
const caffeineTotal = useMemo(
  () => caffeineRecords.reduce((sum, r) => sum + (r.amountMg ?? 0), 0),
  [caffeineRecords]
);
const alcoholTotal = useMemo(
  () => alcoholRecords.reduce((sum, r) => sum + (r.amountStandardDrinks ?? 0), 0),
  [alcoholRecords]
);
```

**Weekly summary (water/salt by day) -- needs new aggregation logic:**
```typescript
// Compute Monday start of current week using dayStartHour boundary
function getWeekStart(dayStartHour: number): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - daysSinceMonday);
  monday.setHours(dayStartHour, 0, 0, 0);
  return monday;
}

// Query full week of records with a single useLiveQuery call
// then bucket into 7 days in useMemo
```

### Pattern 2: Zustand Persist Migration (v2 -> v3)

Established in Phase 13 (v1 -> v2). The pattern for converting LiquidPreset objects:

```typescript
// In settings-store.ts persist config
version: 3, // bumped from 2
migrate: (persisted, version) => {
  const state = persisted as Record<string, unknown>;
  if (version === 0) {
    delete state.perplexityApiKey;
    delete state.aiAuthSecret;
  }
  if (version < 2) {
    state.liquidPresets = DEFAULT_LIQUID_PRESETS;
  }
  if (version < 3) {
    // D-07: Remove deprecated coffeeDefaultType
    delete state.coffeeDefaultType;
    // D-12: Convert old LiquidPreset format to new multi-substance format
    const presets = state.liquidPresets as Array<Record<string, unknown>>;
    if (Array.isArray(presets)) {
      state.liquidPresets = presets.map(p => {
        const oldType = p.type as string;
        const oldPer100ml = p.substancePer100ml as number;
        // Build new fields, preserving all non-conflicting properties
        const { type: _t, substancePer100ml: _s, ...rest } = p;
        return {
          ...rest,
          tab: oldType === "caffeine" ? "coffee" : "alcohol",
          waterContentPercent: 100,
          ...(oldType === "caffeine" && { caffeinePer100ml: oldPer100ml }),
          ...(oldType === "alcohol" && { alcoholPer100ml: oldPer100ml }),
        };
      });
    }
  }
  return state as unknown as Settings & SettingsActions;
},
```

### Pattern 3: Multi-Substance Composable Entry Extension (D-11)

The current `addComposableEntry` supports ONE `substance` field. For multi-substance presets, extend the interface:

```typescript
// Extended ComposableEntryInput -- backward compatible
export interface ComposableEntryInput {
  eating?: { note?: string; grams?: number };
  intakes?: Array<{ type: "water" | "salt"; amount: number; source?: string; note?: string }>;
  substance?: { /* existing single-substance path -- keep for backward compat */ };
  substances?: Array<{  // NEW: multiple substances per entry
    type: "caffeine" | "alcohol";
    amountMg?: number;
    amountStandardDrinks?: number;
    volumeMl?: number;
    description: string;
  }>;
  originalInputText?: string;
  groupSource?: string;
}
```

In the service, process `substances` array after the existing `substance` singular field:
```typescript
// Inside the transaction in addComposableEntry:
if (input.substances) {
  for (const sub of input.substances) {
    const id = crypto.randomUUID();
    // Create SubstanceRecord (same shape as current substance handling)
    // Do NOT create linked water intake -- water is handled via intakes[] instead
  }
}
```

### Pattern 4: Progress Bar with Domain Colors

The existing `Progress` component already supports `indicatorClassName`:

```typescript
<Progress
  value={Math.min((waterTotal / waterLimit) * 100, 100)}
  className="h-2" // thin bar per UI-SPEC
  indicatorClassName={
    waterTotal > waterLimit
      ? "bg-red-500"
      : CARD_THEMES.water.progressGradient // "bg-gradient-to-r from-sky-400 to-cyan-500"
  }
  aria-label="Water intake progress"
/>
```

### Anti-Patterns to Avoid
- **Importing services directly in components:** Use hooks layer (`use-intake-queries.ts`, `use-substance-queries.ts`) -- ESLint enforces this boundary.
- **Using `undefined` for soft-delete or optional fields:** Always use conditional spread `...(value !== undefined && { field: value })` for exactOptionalPropertyTypes compliance.
- **Hardcoding dayStartHour:** Always read from `useSettingsStore` -- the user can change this.
- **Adding new npm packages:** This phase needs zero new dependencies.
- **Modifying Dexie schema:** NO IndexedDB changes in this phase. LiquidPreset lives in Zustand/localStorage.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bars | Custom div-based progress | `<Progress>` from shadcn/ui with `indicatorClassName` | Built-in ARIA attributes, animation, gradient support already verified |
| Domain colors | Inline color strings | `CARD_THEMES.{domain}.progressGradient`, `.latestValueColor`, `.iconColor` | Centralized, dark-mode-safe, already used everywhere |
| Daily intake totals | Manual DB queries in components | `useDailyIntakeTotal("water"/"salt")` | Reactive via useLiveQuery, respects dayStartHour, polls every 60s |
| Substance totals | Manual DB queries | `useSubstanceRecordsByDateRange(start, end, type)` | Reactive, scoped by date range, filters by type |
| Atomic multi-record creation | Multiple separate add calls | `addComposableEntry()` | Transaction-wrapped, creates groupId links |
| Number formatting | Manual string manipulation | `Intl.NumberFormat` or `value.toLocaleString()` | Handles comma separators for "1,200" format |
| Settings persistence | Manual localStorage manipulation | Zustand `persist` middleware with `migrate` | Pattern already established, handles version upgrades |

## Common Pitfalls

### Pitfall 1: ComposableEntryInput Single Substance Limitation
**What goes wrong:** The current `ComposableEntryInput` interface supports only ONE `substance` field. A Don Pedro preset needs BOTH caffeine AND alcohol substance records.
**Why it happens:** The interface was designed for single-substance presets (Phase 14).
**How to avoid:** Add `substances?: Array<{...}>` alongside the existing singular `substance` field. The service checks `substances` first (new path), falls back to `substance` (existing path). Existing callers continue using `substance` unchanged.
**Warning signs:** Multi-substance presets only create one substance record instead of two.

### Pitfall 2: Zustand Migration Must Handle All Edge Cases
**What goes wrong:** Existing user presets in localStorage don't have `waterContentPercent`, `tab`, or the new per-100ml fields. Runtime crashes or NaN calculations result.
**Why it happens:** Zustand persist loads state from localStorage before applying defaults. The migration function is the ONLY chance to transform old data.
**How to avoid:** Migration must explicitly: (a) set `waterContentPercent: 100` for every preset, (b) convert `type` to `tab`, (c) convert `substancePer100ml` to the correct per-100ml field, (d) handle presets that may already be in new format (idempotent), (e) handle presets with missing fields by providing sensible defaults.
**Warning signs:** Console errors on app load, presets showing "undefined" or NaN values, blank Liquids card.

### Pitfall 3: Old Fields Lingering After Migration
**What goes wrong:** After migration, presets still carry `substancePer100ml` and `type` fields in localStorage, potentially confusing code that reads both old and new fields.
**Why it happens:** Simple spread in migration doesn't remove old fields.
**How to avoid:** Use destructuring with rest to explicitly omit `type` and `substancePer100ml` during migration: `const { type: _t, substancePer100ml: _s, ...rest } = preset`.
**Warning signs:** Old `type` field shadowing or conflicting with new `tab` field.

### Pitfall 4: Weekly Summary Must Respect dayStartHour
**What goes wrong:** Weekly totals show incorrect values because records near midnight are assigned to the wrong day.
**Why it happens:** If you bucket by calendar date instead of using the configurable dayStartHour boundary (default 2am).
**How to avoid:** For each day in the week, compute day boundaries using `dayStartHour` from settings. A record at 1am Tuesday belongs to Monday's budget if dayStartHour is 2. Use `getDayStartTimestamp` logic for each day boundary.
**Warning signs:** Discrepancy between daily totals shown in metric rows vs weekly columns.

### Pitfall 5: Dead Code Deletion Cascading References
**What goes wrong:** Deleting a component but missing an import reference causes build failure.
**Why it happens:** Grep may miss indirect references.
**How to avoid:** After deleting files, run `pnpm build` to catch any broken imports. The complete reference map:
- `food-calculator.tsx`: optional prop in QuickNavFooter (already optional per Phase 15)
- `eating-card.tsx`: zero external references
- `voice-input.tsx`: optional prop in QuickNavFooter (already optional per Phase 15)
- `parsed-intake-display.tsx`: only in voice-input.tsx (being deleted together)
- `historical-graph.tsx`: only in page.tsx (replace import with TextMetrics)
- `intake-card.tsx`: zero external references (fully dead code)
- All chart sub-components + chart-utils.ts: only in historical-graph.tsx and each other
- `use-graph-data.ts`: only in historical-graph.tsx + chart files
- `use-now.ts`: only in historical-graph.tsx
**Warning signs:** TypeScript compilation errors mentioning deleted files.

### Pitfall 6: PresetTab Water Calculation Change
**What goes wrong:** Current PresetTab creates water intake equal to the full `volumeMl`. With `waterContentPercent`, water should be `volume * waterContentPercent / 100`.
**Why it happens:** The existing code in `composable-entry-service.ts` (line 115) adds water intake equal to `input.substance.volumeMl` directly.
**How to avoid:** When building the ComposableEntryInput from a preset, calculate water as `Math.round(volumeMl * preset.waterContentPercent / 100)` and pass it via `intakes[]` rather than relying on the service's automatic water-from-substance behavior.
**Warning signs:** A 60ml espresso recording 60ml water instead of ~59ml (98% water content).

### Pitfall 7: E2E Test Section IDs
**What goes wrong:** E2E test `intake-logs.spec.ts` uses `#section-water` to find cards. Card reordering might accidentally change or remove section IDs.
**Why it happens:** Copy-paste errors during JSX restructuring.
**How to avoid:** Preserve all existing `id="section-*"` attributes. The card reordering only changes JSX element order, not section IDs.
**Warning signs:** E2E test failures after card reorder.

## Dead Code Deletion Map

Complete inventory of files to delete and their reference chains:

| File | Imported By | Safe to Delete | Notes |
|------|-------------|----------------|-------|
| `src/components/food-calculator.tsx` | QuickNavFooter (optional callback) | YES | QNF callback already optional per Phase 15 |
| `src/components/eating-card.tsx` | NONE (self-contained) | YES | Replaced by FoodSaltCard |
| `src/components/voice-input.tsx` | QuickNavFooter (optional callback) | YES | QNF callback already optional |
| `src/components/parsed-intake-display.tsx` | voice-input.tsx only | YES | Delete with voice-input |
| `src/components/historical-graph.tsx` | page.tsx only | YES | Replace import with TextMetrics |
| `src/components/charts/intake-chart.tsx` | historical-graph.tsx only | YES | |
| `src/components/charts/weight-chart.tsx` | historical-graph.tsx only | YES | |
| `src/components/charts/bp-chart.tsx` | historical-graph.tsx only | YES | |
| `src/components/charts/metrics-section.tsx` | historical-graph.tsx only | YES | |
| `src/components/charts/chart-utils.ts` | chart components only | YES | |
| `src/components/intake-card.tsx` | NONE (zero external imports) | YES | Replaced by LiquidsCard |
| `src/hooks/use-graph-data.ts` | chart components only | YES | Analytics page uses own hooks |
| `src/hooks/use-now.ts` | historical-graph.tsx only | YES | |

**Additional cleanup after file deletion:**
- `COFFEE_PRESETS` constant in `constants.ts`: Only used by intake-card.tsx (being deleted) and customization-panel.tsx Coffee Tab (being replaced). Remove the constant.
- `UTILITY_THEMES` in `card-themes.ts`: Only used by QuickNavFooter for the Food Calculator / Voice Input utility buttons. After removing those props, the utility row and `UTILITY_THEMES` can be removed.
- `QuickNavFooter` props: Remove `onOpenFoodCalculator?` and `onOpenVoiceInput?` props and the utility row rendering logic (the `showUtilityRow` check on line 78 already evaluates to false since page.tsx never passes these callbacks).
- `setCoffeeDefaultType` action in settings store: Remove along with `coffeeDefaultType` field.
- `getLiquidTypeLabel` utility in utils.ts: Check if still used after intake-card.tsx deletion.

## Code Examples

### TextMetrics Row with Progress Bar (Water/Salt)
```typescript
// Pattern from UI-SPEC: icon + label + progress + value/limit
function MetricRowWithProgress({
  icon: Icon,
  label,
  current,
  limit,
  unit,
  theme,
}: {
  icon: LucideIcon;
  label: string;
  current: number;
  limit: number;
  unit: string;
  theme: typeof CARD_THEMES.water;
}) {
  const isOverLimit = current > limit;
  const percentage = Math.min((current / limit) * 100, 100);

  return (
    <div className="flex items-center gap-3">
      <Icon className={cn("w-4 h-4", theme.iconColor)} aria-hidden="true" />
      <span className="text-sm text-foreground w-16">{label}</span>
      <Progress
        value={percentage}
        className="h-2 flex-1"
        indicatorClassName={isOverLimit ? "bg-red-500" : theme.progressGradient}
        aria-label={`${label} intake progress`}
      />
      <span className={cn(
        "text-sm font-semibold tabular-nums",
        isOverLimit ? "text-red-600 dark:text-red-400" : theme.latestValueColor,
      )}>
        {current.toLocaleString()}
      </span>
      <span className="text-xs text-muted-foreground">
        / {limit.toLocaleString()} {unit}
      </span>
    </div>
  );
}
```

### TextMetrics Row without Progress (Caffeine/Alcohol)
```typescript
// Caffeine and alcohol have no limits, so no progress bar
function MetricRowValueOnly({
  icon: Icon,
  label,
  value,
  unit,
  theme,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  unit: string;
  theme: typeof CARD_THEMES.caffeine;
}) {
  const hasValue = value > 0;
  return (
    <div className="flex items-center gap-3">
      <Icon className={cn("w-4 h-4", theme.iconColor)} aria-hidden="true" />
      <span className="text-sm text-foreground w-16">{label}</span>
      <span className="flex-1" /> {/* spacer */}
      <span className={cn(
        "text-sm font-semibold tabular-nums",
        hasValue ? theme.latestValueColor : "text-muted-foreground",
      )}>
        {type === "alcohol" ? value.toFixed(1) : value.toLocaleString()} {unit}
      </span>
    </div>
  );
}
```

### LiquidPreset Interface (New Shape per D-10)
```typescript
export interface LiquidPreset {
  id: string;
  name: string;
  tab: "coffee" | "alcohol" | "beverage";   // which LiquidsCard tab (replaces old `type`)
  defaultVolumeMl: number;
  waterContentPercent: number;                // 0-100, default 100
  caffeinePer100ml?: number;                 // mg per 100ml
  alcoholPer100ml?: number;                  // standard drinks per 100ml
  saltPer100ml?: number;                     // mg sodium per 100ml
  isDefault: boolean;
  source: "manual" | "ai";
  aiConfidence?: number;
}
```

### Updated DEFAULT_LIQUID_PRESETS
```typescript
export const DEFAULT_LIQUID_PRESETS: LiquidPreset[] = [
  { id: "default-espresso", name: "Espresso", tab: "coffee", caffeinePer100ml: 210, waterContentPercent: 98, defaultVolumeMl: 30, isDefault: true, source: "manual" },
  { id: "default-double-espresso", name: "Double Espresso", tab: "coffee", caffeinePer100ml: 210, waterContentPercent: 98, defaultVolumeMl: 60, isDefault: true, source: "manual" },
  { id: "default-moka", name: "Moka", tab: "coffee", caffeinePer100ml: 130, waterContentPercent: 98, defaultVolumeMl: 50, isDefault: true, source: "manual" },
  { id: "default-coffee", name: "Coffee", tab: "coffee", caffeinePer100ml: 38, waterContentPercent: 99, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  { id: "default-tea", name: "Tea", tab: "coffee", caffeinePer100ml: 19, waterContentPercent: 99, defaultVolumeMl: 250, isDefault: true, source: "manual" },
  { id: "default-beer", name: "Beer", tab: "alcohol", alcoholPer100ml: 0.30, waterContentPercent: 93, defaultVolumeMl: 330, isDefault: true, source: "manual" },
  { id: "default-wine", name: "Wine", tab: "alcohol", alcoholPer100ml: 0.67, waterContentPercent: 87, defaultVolumeMl: 150, isDefault: true, source: "manual" },
  { id: "default-spirit", name: "Spirit", tab: "alcohol", alcoholPer100ml: 2.22, waterContentPercent: 60, defaultVolumeMl: 45, isDefault: true, source: "manual" },
];
```

### BP Heart Rate Promotion (D-08)
```typescript
// Move this block from inside showDetails && (...) to between grid and Record button:
<div className="space-y-1 mt-2">
  <Label htmlFor="heartrate" className="text-xs">Heart Rate (optional)</Label>
  <div className="flex gap-2">
    <Input
      id="heartrate"
      type="number"
      min="0"
      max="250"
      placeholder="72"
      value={heartRateInput}
      onChange={(e) => setHeartRateInput(e.target.value)}
      className="h-11 text-center bg-white/80 dark:bg-slate-900/50"
    />
    <div className="flex items-center px-3 text-sm font-medium text-muted-foreground bg-muted rounded-md">
      BPM
    </div>
  </div>
  {fieldErrors.heartRate && (
    <p className="text-sm text-destructive mt-1">{fieldErrors.heartRate}</p>
  )}
</div>
```

### Multi-Substance Preset Logging (D-11)
```typescript
// Build ComposableEntryInput from multi-substance preset
function buildMultiSubstanceInput(preset: LiquidPreset, volumeMl: number): ComposableEntryInput {
  const waterAmount = Math.round(volumeMl * preset.waterContentPercent / 100);

  const input: ComposableEntryInput = {
    intakes: [
      { type: "water", amount: waterAmount, source: `preset:${preset.id}` },
    ],
    groupSource: `preset:${preset.name}`,
  };

  // Add salt intake if present
  if (preset.saltPer100ml) {
    input.intakes!.push({
      type: "salt",
      amount: Math.round((volumeMl / 100) * preset.saltPer100ml),
      source: `preset:${preset.id}`,
    });
  }

  // Build substance records (multiple if preset has both caffeine and alcohol)
  const substances: Array<{
    type: "caffeine" | "alcohol";
    amountMg?: number;
    amountStandardDrinks?: number;
    description: string;
  }> = [];

  if (preset.caffeinePer100ml) {
    substances.push({
      type: "caffeine",
      amountMg: Math.round((volumeMl / 100) * preset.caffeinePer100ml),
      description: preset.name,
    });
  }
  if (preset.alcoholPer100ml) {
    substances.push({
      type: "alcohol",
      amountStandardDrinks: parseFloat(((volumeMl / 100) * preset.alcoholPer100ml).toFixed(1)),
      description: preset.name,
    });
  }

  if (substances.length === 1) {
    // Single substance -- use existing singular field for backward compat
    input.substance = { ...substances[0], volumeMl };
  } else if (substances.length > 1) {
    // Multi-substance -- use new plural field
    input.substances = substances;
  }

  return input;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `substancePer100ml` + `type` on LiquidPreset | Individual `caffeinePer100ml`, `alcoholPer100ml`, `saltPer100ml` + `tab` + `waterContentPercent` | Phase 16 | Enables multi-substance presets (Don Pedro, salty margarita) |
| `coffeeDefaultType` in settings store | Removed; presets handle defaults via `isDefault` flag | Phase 16 | Simpler settings, richer preset model |
| HistoricalGraph on dashboard | TextMetrics summary at top | Phase 16 | Graphs deferred to dedicated analytics page (ANLT-01) |
| Heart rate in collapsible | Heart rate always visible in primary input area | Phase 16 | Better discoverability per user feedback |

**Deprecated/outdated after this phase:**
- `HistoricalGraph` + all chart sub-components: replaced by TextMetrics on dashboard
- `FoodCalculator`: replaced by FoodSaltCard AI input (Phase 15)
- `EatingCard`: replaced by FoodSaltCard (Phase 15)
- `VoiceInput` + `ParsedIntakeDisplay`: replaced by inline AI inputs
- `IntakeCard`: replaced by LiquidsCard (Phase 14)
- `COFFEE_PRESETS` constant: no consumers after cleanup
- `coffeeDefaultType` setting + `setCoffeeDefaultType` action: removed
- `use-graph-data.ts` + `use-now.ts` hooks: only used by deleted chart components
- `UTILITY_THEMES` in card-themes.ts: only used by removed QuickNavFooter utility row

## Open Questions

1. **Multi-substance ComposableEntryInput extension approach**
   - What we know: Current interface supports one `substance` field. Don Pedro needs caffeine + alcohol.
   - What's unclear: Whether to add `substances: Array<...>` to the interface or call `addComposableEntry` twice (which would create two separate groups and lose atomicity).
   - Recommendation: Add `substances?: Array<{...}>` to ComposableEntryInput and process them in the transaction. Keep existing `substance` field for backward compatibility. When `substances` is provided, skip the auto-water-intake that the singular `substance` path creates (water is handled explicitly via `intakes[]`).

2. **Charts directory: delete all or keep for insights migration?**
   - What we know: All 5 chart files + use-graph-data + use-now are only used by HistoricalGraph. The analytics page uses its own separate chart components.
   - Recommendation: Delete everything. The code is in git history. The future insights page will likely need different data aggregation. Maintaining dead code creates confusion.

3. **`getLiquidTypeLabel` in utils.ts**
   - What we know: Used by intake-card.tsx which is being deleted. May have other consumers.
   - Recommendation: Check during implementation. If zero consumers remain after intake-card deletion, remove it.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (unit) + Playwright (E2E) |
| Config file | `vitest.config.ts` / `playwright.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm build && pnpm lint` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-06 | Heart rate visible without expanding | build + visual | `pnpm build` | N/A (UI layout) |
| DASH-07 | Food calculator removed | build | `pnpm build` (fails if references remain) | N/A (deletion) |
| DASH-08 | Text metrics display | unit + build | `pnpm test -- src/lib/composable-entry-service.test.ts` | Existing (extend) |
| DASH-09 | Coffee settings migrated | build | `pnpm build` | N/A (migration) |
| DASH-10 | Card ordering correct | build + visual | `pnpm build` | N/A (layout) |
| D-10/D-11 | Multi-substance preset model + logging | unit | `pnpm test -- src/lib/composable-entry-service.test.ts` | Existing (extend) |
| D-12 | Zustand persist migration v2->v3 | manual | Verify in browser DevTools | N/A |

### Sampling Rate
- **Per task commit:** `pnpm build && pnpm lint`
- **Per wave merge:** `pnpm test && pnpm build && pnpm lint`
- **Phase gate:** Full suite green (`pnpm test && pnpm build && pnpm lint`) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Extend `src/lib/composable-entry-service.test.ts` -- add test cases for multi-substance entries (D-11): preset with caffeine + alcohol should create 2 substance records + water intake + optional salt intake
- [ ] `pnpm build` must pass after each deletion wave to catch orphan imports

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all referenced files:
  - `src/lib/constants.ts` -- LiquidPreset interface (line 107-116), DEFAULT_LIQUID_PRESETS (line 118-129)
  - `src/stores/settings-store.ts` -- Zustand persist config (lines 181-197), coffeeDefaultType (line 48)
  - `src/lib/composable-entry-service.ts` -- addComposableEntry interface (lines 10-22), single substance limitation (lines 93-131)
  - `src/components/blood-pressure-card.tsx` -- HR collapsible (lines 282-303), primary area (lines 210-243)
  - `src/app/page.tsx` -- current card layout (lines 45-104)
  - `src/components/customization-panel.tsx` -- Coffee Tab (lines 100-131)
  - `src/components/quick-nav-footer.tsx` -- optional callback props (lines 58-59)
  - `src/components/historical-graph.tsx` -- full component (lines 1-98)
  - `src/lib/card-themes.ts` -- CARD_THEMES with progressGradient, latestValueColor, iconColor
  - `src/components/ui/progress.tsx` -- indicatorClassName prop verified (line 9)
  - `src/hooks/use-intake-queries.ts` -- useDailyIntakeTotal, getDayStartTimestamp
  - `src/hooks/use-substance-queries.ts` -- useSubstanceRecordsByDateRange
  - `src/lib/intake-service.ts` -- getRecordsByDateRange, getDailyTotal
  - `src/lib/substance-service.ts` -- getSubstanceRecordsByDateRange
  - `src/components/liquids/preset-tab.tsx` -- current preset logging flow
  - `src/hooks/use-composable-entry.ts` -- useAddComposableEntry hook
  - `16-UI-SPEC.md` -- Visual design contract for all new/modified components

### Secondary (MEDIUM confidence)
- Import reference analysis via Grep across entire `src/` directory for all deletion candidates
- E2E test inspection (`e2e/intake-logs.spec.ts`) for section ID dependencies

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages, all existing libraries verified in codebase
- Architecture: HIGH -- all integration points verified by reading actual source files
- Data model changes: HIGH -- LiquidPreset interface, composable entry service, and Zustand migration fully understood
- Dead code map: HIGH -- exhaustive Grep analysis of all import references verified
- Pitfalls: HIGH -- based on actual codebase analysis, not hypothetical concerns

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- internal codebase, no external dependency changes)
