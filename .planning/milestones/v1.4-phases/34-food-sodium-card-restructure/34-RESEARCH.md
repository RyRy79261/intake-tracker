# Phase 34: Food/Sodium Card Restructure - Research

**Researched:** 2026-04-06
**Status:** Complete

## Summary

This phase restructures the food/sodium card from two separate sections (FoodSection + SaltSection) into a unified card where sodium is a derivative of food entries, matching how caffeine is a derivative of coffee in the liquids card. The changes are purely frontend — no data model or API changes needed.

## Current Architecture

### Component Hierarchy
```
FoodSaltCard (food-salt-card.tsx)
├── FoodSection (food-salt/food-section.tsx)
│   ├── AI Food Input (text → parseIntakeWithAI)
│   ├── ComposablePreview (food-salt/composable-preview.tsx)
│   ├── "Add details" Collapsible (manual eating entry)
│   ├── RecentEntriesList (eating records only)
│   └── EditEatingDialog
└── SaltSection (food-salt/salt-section.tsx)
    ├── Sodium sub-header (daily total / limit)
    ├── Progress bar
    ├── Sodium Source Presets (sodiumPresets from settings store)
    ├── +/- stepper controls
    ├── Confirm Entry button
    ├── RecentEntriesList (salt intake records only)
    ├── ManualInputDialog
    └── EditIntakeDialog
```

### Data Sources
- **Eating records**: `eatingRecords` table in Dexie → `useEatingRecords(limit)` hook → `EatingRecord { id, timestamp, note?, grams?, deletedAt? }`
- **Salt intake records**: `intakeRecords` table (type="salt") in Dexie → `useRecentIntakeRecords("salt")` hook → `IntakeRecord { id, type, amount, source, timestamp, note?, deletedAt? }`
- **Composable entries**: Created via `useAddComposableEntry` → atomically writes eating + water + salt records with shared `groupId`

### Card Header Pattern (from liquids-card.tsx)
```tsx
<div className="flex items-center justify-between mb-4">
  <div className="flex items-center gap-2">
    <div className={cn("p-2 rounded-lg", theme.iconBg)}>
      <Icon className={cn("w-5 h-5", theme.iconColor)} />
    </div>
    <span className="font-semibold text-lg uppercase tracking-wide">
      {cardTitle}
    </span>
  </div>
  {/* Right side: key metric */}
  <div className="text-right">
    <p className="text-sm font-medium">{dailyTotal} / {limit}</p>
    <p className="text-xs text-muted-foreground">today</p>
    <p className="text-xs text-muted-foreground/70">24h: {rollingTotal}</p>
  </div>
</div>
```

### Quick Nav Section ID Issue
- Dashboard `page.tsx` wraps FoodSaltCard with `id="section-food-salt"`
- `card-themes.ts` defines `eating.sectionId: "section-eating"` and `salt.sectionId: "section-salt"`
- QuickNavFooter iterates ALL CARD_THEMES keys and uses `theme.sectionId` to scroll
- Currently neither "section-eating" nor "section-salt" matches the actual DOM id "section-food-salt"
- Both eating and salt nav items render in the footer but neither scrolls to the card

## Approach

### Plan 1: Card Structure & Sodium Header (Wave 1)
**What changes:**
1. **`food-salt-card.tsx`**: Remove SaltSection import. Add sodium daily total/limit to card header top-right (matching liquids card pattern). Add sodium progress bar below header. Remove section divider.
2. **`card-themes.ts`**: Change `eating.sectionId` to `"section-food-salt"`. Remove `salt` theme entry from quick nav or also point it to `"section-food-salt"`.
3. **`page.tsx`**: Keep `id="section-food-salt"` (already correct).

**Key detail — sodium header data:**
- Use `useIntake("salt")` in `FoodSaltCard` to get `dailyTotal`, `rollingTotal`
- Use `useSettings()` to get `saltLimit`
- Display format: `{dailyTotal}mg / {limitMg}mg` with over-limit red coloring
- Progress bar: `(dailyTotal / limit) * 100`

**Section ID resolution:**
- Change `eating.sectionId` from `"section-eating"` to `"section-food-salt"` since the unified card uses this ID
- The `salt` theme still exists for color styling in other contexts, but its nav entry would be redundant. Options:
  - Set `salt.sectionId` to `"section-food-salt"` too (both nav items scroll to same card — confusing)
  - Better: Keep `salt.sectionId` as-is but the quick nav will have two items that go to the same place, OR filter it
  - Simplest: Change `eating.sectionId` to `"section-food-salt"` and keep `salt.sectionId` as `"section-salt"` — the salt nav item won't find its target and silently no-ops (current behavior), but the eating one will work. The card title is "Food + Sodium" so the Eating nav item correctly represents it.

### Plan 2: Merged History & Entry Display (Wave 1)
**What changes:**
1. **`food-section.tsx`** → Rename/refactor to be the unified food+sodium section
2. Merge eating and salt records into a single chronological list:
   - Fetch `useEatingRecords(5)` and `useRecentIntakeRecords("salt")` 
   - Combine into a union type array: `Array<{type: 'eating', record: EatingRecord} | {type: 'salt', record: IntakeRecord}>`
   - Sort by timestamp descending, take top 5
   - Render via `RecentEntriesList` with a discriminated `renderEntry` callback
3. Entry display format: `{time} · {amount}mg Na · {description}` for sodium, `{time} · {grams}g · {description}` for eating
4. When description exists, use it as primary label (FOOD-02)
5. Edit routing: Click on eating entry → `EditEatingDialog`; click on salt entry → `EditIntakeDialog`
6. Delete routing: eating entry → `useDeleteEating`; salt entry → `useDeleteIntake`

**Merged list type:**
```typescript
type MergedEntry = 
  | { kind: 'eating'; record: EatingRecord }
  | { kind: 'salt'; record: IntakeRecord };
```

The `RecentEntriesList` expects `T extends { id: string }` with `renderEntry(record: T)`. For the merged list, create a wrapper type:
```typescript
interface MergedHistoryItem {
  id: string;
  kind: 'eating' | 'salt';
  timestamp: number;
  eating?: EatingRecord;
  intake?: IntakeRecord;
}
```

### Plan 3: Remove SaltSection & Relocate Sodium Presets (Wave 2, depends on Plans 1+2)
**What changes:**
1. **Delete `salt-section.tsx`** — all its functionality absorbed into the unified card
2. **Sodium presets** in manual "Add details" collapsible:
   - Add a sodium source dropdown/pill selector inside the collapsible
   - When user picks a preset, auto-calculate sodium from grams * sodiumPercent
   - The sodium is then added as a linked composable entry alongside the eating record
3. Remove the standalone +/- stepper, confirm button, and manual sodium input flow
4. The AI input path already handles sodium extraction — no changes needed there

**Important considerations:**
- The standalone salt entry flow (stepper + confirm) is being removed per D-02, D-03
- Users who want to log sodium without food should use the AI input (e.g., "took 2g MSG") or the manual details with a sodium preset
- `ManualInputDialog` for salt type is removed from this card (it was salt-section specific)

## Risk Assessment

**MEDIUM risk** — structural component change with multiple mutation paths.

Key risks:
1. **Merged history mutation routing**: Must correctly identify record type when user clicks edit/delete. Mitigation: discriminated union with `kind` field.
2. **Loss of standalone sodium entry**: Users who tracked sodium independently lose the stepper flow. Mitigation: Sodium presets in manual details + AI parsing handles "took X mg sodium" descriptions.
3. **Quick nav regression**: Changing sectionIds could break other cards. Mitigation: Only change `eating.sectionId` — all other themes untouched.

## Validation Architecture

### Pre-execution checks
- `food-salt-card.tsx` renders without SaltSection
- `card-themes.ts` eating.sectionId matches page.tsx section ID
- Sodium daily total appears in card header

### Post-execution checks  
- Build passes (`pnpm build`)
- Lint passes (`pnpm lint`)
- Merged history shows both eating and salt records
- Edit/delete on eating record routes to EatingRecord mutation
- Edit/delete on salt record routes to IntakeRecord mutation
- Quick nav "Eating" button scrolls to food-salt card
- E2E test suite passes

## Dependencies

- No new packages needed
- No data model changes
- No API changes
- Depends only on existing Dexie tables and React Query hooks
