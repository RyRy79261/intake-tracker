# Stack Research

**Domain:** Composable data entries, AI substance lookup, unified tabbed input cards
**Researched:** 2026-03-23
**Confidence:** HIGH

## Recommended Stack

### Core Technologies (Already In Place -- No Changes)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| Dexie.js | ^4.0.8 (latest 4.3.0) | IndexedDB wrapper, transactions, indexes | Keep current. 4.3.0 adds Dexie Cloud auth features irrelevant to this milestone. No breaking changes from 4.0.8. |
| @radix-ui/react-tabs | ^1.1.1 | Tabbed UI primitives | Already installed via shadcn/ui. Tabs component exists at `src/components/ui/tabs.tsx`. |
| Zod | 3 | Schema validation for AI responses and inputs | Already used in all API routes. |
| Perplexity API (sonar-pro) | N/A | AI substance content lookup | Already integrated for food parsing and substance enrichment. Extend existing patterns. |

### New Additions Required

**None.** This milestone requires zero new npm dependencies. All capabilities are achievable with the existing stack.

### Supporting Libraries (Already Installed)

| Library | Version | Purpose | How It Applies |
|---------|---------|---------|----------------|
| dexie | ^4.0.8 | Composable linked records via `db.transaction('rw', [...tables])` | Multi-table atomic writes for linked food+liquid+salt entries |
| dexie-react-hooks | ^1.1.7 | `useLiveQuery` for reactive reads | Live queries on new `composableEntries` table |
| @tanstack/react-query | ^5.90.20 | Cache invalidation after mutations | Invalidate intake/substance/eating queries on composable entry CRUD |
| zod | 3 | Validate AI responses for caffeine-per-100ml and alcohol-per-100ml | Extend existing Zod schemas in API routes |
| zustand | ^5.0.0 | Persist preset selections and liquid tab defaults | Store saved coffee/alcohol presets and default tab |

## Dexie Patterns for Composable Linked Records

### Pattern: GroupId-Based Linking (Recommended)

Dexie has **no built-in foreign key constraints or cascade operations**. The codebase already implements the correct pattern in `substance-service.ts` (lines 38-49, 116-129): wrap multi-table operations in `db.transaction('rw', [...tables])`.

For composable entries, add a new `composableEntries` table that acts as the group record, with a `groupId` field on child records linking back:

```typescript
// New table in db.ts (version 15)
interface ComposableEntry {
  id: string;           // groupId -- the link key
  type: 'food' | 'liquid' | 'food_liquid';  // what combination
  description: string;  // user input text
  aiParsed: boolean;    // whether AI generated the linked records
  timestamp: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}

// Existing tables get optional groupId field:
// intakeRecords.groupId?: string
// eatingRecords.groupId?: string
// substanceRecords.groupId?: string
```

**Why this pattern:**
- Matches the existing `sourceRecordId` pattern on `SubstanceRecord` (line 278 of db.ts)
- Matches the existing `doseLogId` pattern on `InventoryTransaction` (line 228 of db.ts)
- Single index on `groupId` enables efficient cascade operations
- Group record stores the "what was typed" for undo/redo and edit flows
- No new libraries needed -- plain Dexie transactions

### Pattern: Atomic Cascade Delete

Already proven in the codebase. `deleteSubstanceRecord` (substance-service.ts:110-135) soft-deletes the substance record AND its linked intake records in a single transaction. Extend this pattern:

```typescript
async function deleteComposableEntry(groupId: string) {
  await db.transaction('rw', [
    db.composableEntries,
    db.intakeRecords,
    db.eatingRecords,
    db.substanceRecords,
  ], async () => {
    const now = Date.now();
    // Soft-delete all children with matching groupId
    await db.intakeRecords.where('groupId').equals(groupId)
      .modify({ deletedAt: now, updatedAt: now });
    await db.eatingRecords.where('groupId').equals(groupId)
      .modify({ deletedAt: now, updatedAt: now });
    await db.substanceRecords.where('groupId').equals(groupId)
      .modify({ deletedAt: now, updatedAt: now });
    // Soft-delete the group itself
    await db.composableEntries.update(groupId, { deletedAt: now, updatedAt: now });
  });
}
```

### Pattern: Atomic Cascade Create (AI Food Parse Flow)

User types "a bowl of ramen" -> AI returns water, salt, eating data -> service creates all records atomically:

```typescript
await db.transaction('rw', [
  db.composableEntries,
  db.intakeRecords,
  db.eatingRecords,
], async () => {
  const groupId = crypto.randomUUID();
  await db.composableEntries.add({ id: groupId, type: 'food_liquid', ... });
  await db.intakeRecords.add({ ...waterRecord, groupId });
  await db.intakeRecords.add({ ...saltRecord, groupId });
  await db.eatingRecords.add({ ...eatingRecord, groupId });
});
```

### Schema Migration (Version 15)

Add `groupId` index to existing tables and create `composableEntries`:

```typescript
db.version(15).stores({
  // All existing v14 definitions PLUS groupId index additions
  intakeRecords:     "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  eatingRecords:     "id, timestamp, groupId, updatedAt",
  substanceRecords:  "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  // New table
  composableEntries: "id, type, timestamp, updatedAt",
  // ... all other tables unchanged (must repeat full definitions)
});
```

## AI Substance Lookup Strategy

### Do NOT Add: External Substance APIs

| Considered | Why Not |
|-----------|---------|
| USDA FoodData Central API | Free but limited (1,000 req/hr). Caffeine nutrient ID is 1057. Data is per-food-item, not per-beverage-type. Would require mapping "flat white" -> USDA food ID -> extract caffeine nutrient -> calculate per volume. Adds complexity and a new external dependency for marginal benefit over AI. |
| Open Food Facts API | Barcode-oriented. Caffeine data is sparse and inconsistent. Not useful for "I had a flat white" -- needs a barcode scan. |
| Caffeine Informer | No public API. Scraping is fragile and legally gray. |
| Kaggle caffeine dataset | Static CSV, ~200 entries. Useful as a seed but not as a runtime API. |

### Recommended: Extend Existing Perplexity AI Pattern

The project already has a working substance-enrich API route (`/api/ai/substance-enrich/route.ts`) that calls Perplexity's `sonar-pro` model to estimate caffeine and alcohol content. This is the right approach because:

1. **Already battle-tested** -- retry logic, Zod validation, rate limiting, auth middleware all in place
2. **Handles natural language** -- "a large oat milk flat white from Vida" works out of the box
3. **No additional API keys** -- uses existing `PERPLEXITY_API_KEY`
4. **Accurate enough** -- sonar-pro has access to web data including caffeine databases

**What to change for v1.1:**

Extend the existing route to return **caffeine-per-100ml** and **alcohol-per-100ml** (currently returns total mg/standard drinks):

```typescript
// Extended response schemas
const CaffeineResponseSchema = z.object({
  caffeineMg: z.number().min(0).max(2000),        // total caffeine
  caffeinePer100ml: z.number().min(0).max(500),    // NEW: mg per 100ml
  volumeMl: z.number().min(0).max(5000),
  reasoning: z.string().max(500).optional(),
});

const AlcoholResponseSchema = z.object({
  standardDrinks: z.number().min(0).max(20),
  alcoholPercent: z.number().min(0).max(100),      // NEW: ABV %
  volumeMl: z.number().min(0).max(5000),
  reasoning: z.string().max(500).optional(),
});
```

### Preset System (Client-Side, No API Needed)

Store AI-looked-up beverages as reusable presets in a new Dexie table:

```typescript
interface SubstancePreset {
  id: string;
  name: string;              // "Vida flat white (large)"
  type: 'caffeine' | 'alcohol';
  caffeinePer100ml?: number; // mg/100ml
  alcoholPercent?: number;   // ABV %
  defaultVolumeMl: number;   // typical serving size
  usageCount: number;        // for sorting by frequency
  lastUsedAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}
```

User flow: type "flat white" -> AI returns caffeine-per-100ml -> save as preset -> next time, select from preset list -> enter volume -> calculate total caffeine from per-100ml rate.

### Static Fallback Data (Embedded, No API)

For offline use and instant results, embed a small lookup table of common beverages. Not a library -- just a TypeScript constant:

```typescript
// src/lib/substance-defaults.ts
export const CAFFEINE_DEFAULTS: Record<string, { per100ml: number; defaultMl: number }> = {
  'drip coffee':    { per100ml: 40,  defaultMl: 250 },
  'espresso':       { per100ml: 212, defaultMl: 30 },
  'flat white':     { per100ml: 38,  defaultMl: 250 },
  'cappuccino':     { per100ml: 38,  defaultMl: 200 },
  'latte':          { per100ml: 27,  defaultMl: 350 },
  'cold brew':      { per100ml: 50,  defaultMl: 350 },
  'green tea':      { per100ml: 12,  defaultMl: 250 },
  'black tea':      { per100ml: 20,  defaultMl: 250 },
  'matcha':         { per100ml: 28,  defaultMl: 250 },
  'cola':           { per100ml: 10,  defaultMl: 330 },
  'energy drink':   { per100ml: 32,  defaultMl: 250 },
};

export const ALCOHOL_DEFAULTS: Record<string, { abvPercent: number; defaultMl: number }> = {
  'beer':           { abvPercent: 5,   defaultMl: 330 },
  'craft beer':     { abvPercent: 6.5, defaultMl: 330 },
  'wine':           { abvPercent: 13,  defaultMl: 150 },
  'champagne':      { abvPercent: 12,  defaultMl: 150 },
  'cider':          { abvPercent: 5,   defaultMl: 330 },
  'whiskey':        { abvPercent: 40,  defaultMl: 45 },
  'vodka':          { abvPercent: 40,  defaultMl: 45 },
  'gin':            { abvPercent: 40,  defaultMl: 45 },
  'rum':            { abvPercent: 40,  defaultMl: 45 },
  'cocktail':       { abvPercent: 15,  defaultMl: 200 },
};
```

This replaces the existing `DEFAULT_CAFFEINE_MG` and `DEFAULT_ALCOHOL_DRINKS` constants in db.ts (lines 478-486) with per-100ml data and expands coverage.

## Unified Tabbed Input Cards -- UI Approach

### Use Existing shadcn/ui Tabs (No New Packages)

`@radix-ui/react-tabs` is already installed and wrapped in `src/components/ui/tabs.tsx`. The unified liquids card should use this directly:

```tsx
<Tabs defaultValue="water" onValueChange={setActiveTab}>
  <TabsList className="w-full">
    <TabsTrigger value="water">Water</TabsTrigger>
    <TabsTrigger value="coffee">Coffee</TabsTrigger>
    <TabsTrigger value="alcohol">Alcohol</TabsTrigger>
  </TabsList>
  <TabsContent value="water">
    {/* Existing water increment UI */}
  </TabsContent>
  <TabsContent value="coffee">
    {/* Preset selector + volume + AI lookup FAB */}
  </TabsContent>
  <TabsContent value="alcohol">
    {/* Preset selector + volume + AI lookup FAB */}
  </TabsContent>
</Tabs>
```

### Card Component Architecture

The current `IntakeCard` component (src/components/intake-card.tsx) already has liquid type selection (water/juice/coffee/food) via inline state. The v1.1 refactor should:

1. **Extract** the water increment logic into a `WaterTab` component
2. **Create** `CoffeeTab` and `AlcoholTab` components that use preset selection + volume input
3. **Wrap** all three in a single `LiquidsCard` component using Tabs
4. **Merge** the existing eating card and salt card into a `FoodSaltCard` component

No new UI libraries needed. The existing `vaul` (drawer), `cmdk` (command palette for preset search), `motion` (animations), and shadcn primitives cover all UI needs.

## Installation

```bash
# No new packages needed for this milestone.
# Verify existing versions are current:
pnpm list dexie @radix-ui/react-tabs zod zustand
```

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Dexie transactions for linked records | dexie-relationships plugin | Abandoned/unmaintained (last commit 2019). Manual transactions are already the pattern in this codebase and more explicit. |
| Perplexity AI for substance lookup | USDA FoodData Central API | Adds a second external API dependency. USDA data is food-item-oriented, not beverage-name-oriented. Rate-limited to 1,000/hr. Not worth the complexity. |
| Perplexity AI for substance lookup | Open Food Facts API | Barcode-first, caffeine data sparse. Natural language queries for "flat white" don't map well. |
| Static TypeScript defaults | Caffeine Informer Kaggle dataset | CSV with ~200 entries. Overkill for a fallback table. A curated 20-item TypeScript constant is more maintainable and covers the user's actual consumption patterns. |
| groupId field on child records | Separate join table | A join table adds schema complexity for no benefit. Direct groupId on child records matches existing patterns (sourceRecordId, doseLogId). |
| Soft delete (deletedAt pattern) | Hard delete | Matches existing codebase convention on all 16 tables. Required for future sync compatibility. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| dexie-relationships | Unmaintained since 2019, not compatible with Dexie 4.x TypeScript types. Adds magic that obscures data flow. | Manual `db.transaction()` with explicit multi-table writes (already proven in codebase) |
| External caffeine/alcohol APIs at runtime | Adds latency, another API key, rate limits, and a failure mode for marginal accuracy improvement over Perplexity | Extend existing Perplexity substance-enrich route + static defaults for offline |
| react-tabs or other tab libraries | Duplicates existing @radix-ui/react-tabs already in the bundle | Use existing shadcn/ui Tabs component |
| IndexedDB foreign key constraints | Not supported by IndexedDB spec. Dexie cannot add what the underlying store lacks. | Application-level cascade via service functions in transactions |
| Dexie Cloud for sync | Explicitly out of scope for this milestone (see PROJECT.md "Out of Scope") | Keep local-only IndexedDB |

## Stack Patterns by Variant

**If composable entry has only food (no liquid):**
- Create composableEntry + eatingRecord only
- Skip intakeRecords in the transaction scope
- groupId still links them for cascade delete

**If composable entry has liquid + substance:**
- Create composableEntry + intakeRecord (water type) + substanceRecord
- Matches existing substance-service.ts pattern exactly

**If user selects a saved preset (offline):**
- No AI call needed
- Calculate caffeine/alcohol from preset's per-100ml rate * entered volume
- Create records directly from preset data

**If AI lookup fails (network error, rate limit):**
- Fall back to static defaults table
- Flag record as `aiEnriched: false`
- User can manually adjust

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| dexie@^4.0.8 | dexie-react-hooks@^1.1.7 | Both already installed. No version conflicts. |
| dexie@^4.0.8 | fake-indexeddb@^6.2.5 | Test environment. Compatible. |
| @radix-ui/react-tabs@^1.1.1 | react@^18.3.1 | Already working in production. |
| @tanstack/react-query@^5.90.20 | dexie@^4.0.8 | No direct dependency, but mutation/invalidation patterns established. |

## Sources

- [Dexie.js Cascade Delete Discussion (Issue #1932)](https://github.com/dexie/Dexie.js/issues/1932) -- confirms no built-in cascade, recommends transaction pattern
- [Dexie.js Transaction Documentation](https://dexie.org/docs/Dexie/Dexie.transaction()) -- multi-table transaction API reference
- [Dexie.js Relationship Patterns (Issue #824)](https://github.com/dfahlander/Dexie.js/issues/824) -- preferred approach is manual joins
- [USDA FoodData Central API](https://fdc.nal.usda.gov/api-guide/) -- caffeine nutrient ID 1057, evaluated and rejected for this use case
- [Dexie Releases](https://github.com/dexie/Dexie.js/releases) -- 4.3.0 is latest (Jan 2026), no breaking changes from 4.0.8
- [NIAAA Standard Drink Definition](https://www.niaaa.nih.gov/alcohols-effects-health/what-standard-drink) -- 14g pure alcohol = 1 standard drink
- Existing codebase patterns: `substance-service.ts`, `substance-enrich/route.ts`, `parse/route.ts` -- proven transaction and AI integration patterns

---
*Stack research for: v1.1 UI Overhaul -- Composable entries, AI substance lookup, unified input cards*
*Researched: 2026-03-23*
