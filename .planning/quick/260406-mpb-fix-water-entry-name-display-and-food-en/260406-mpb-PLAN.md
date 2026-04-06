---
phase: quick
plan: 260406-mpb
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/food-salt/food-section.tsx
  - src/lib/utils.ts
autonomous: true
must_haves:
  truths:
    - "Water entries logged from the food screen display the food name in the water tab's recent entries"
    - "Recent entries in the food screen show sodium mg alongside date, weight, and name"
  artifacts:
    - path: "src/components/food-salt/food-section.tsx"
      provides: "Food section with water note propagation and sodium display in recent entries"
    - path: "src/lib/utils.ts"
      provides: "getLiquidTypeLabel handler for manual:food_water_content source"
  key_links:
    - from: "src/components/food-salt/food-section.tsx"
      to: "src/lib/composable-entry-service.ts"
      via: "intakes[].note field passed through addComposableEntry"
      pattern: "note.*foodText"
    - from: "src/lib/utils.ts"
      to: "src/components/liquids/water-tab.tsx"
      via: "getLiquidTypeLabel called in renderEntry"
      pattern: "manual:food_water_content"
---

<objective>
Fix two display issues in the intake logging UI:

1. Water entries logged via the food screen show the amount but not the food name — the name should appear as a label in the water tab's recent entries.
2. Recent entries in the food screen show `{date} {weight} {name}` but should show `{date} {sodium} {weight} {name}` so sodium is visible at a glance.

Purpose: Display completeness — users need to see what they logged without opening edit dialogs.
Output: Updated food-section.tsx and utils.ts with both fixes.
</objective>

<execution_context>
@.planning/quick/260406-mpb-fix-water-entry-name-display-and-food-en/260406-mpb-PLAN.md
</execution_context>

<context>
@src/components/food-salt/food-section.tsx
@src/components/liquids/water-tab.tsx
@src/components/recent-entries-list.tsx
@src/lib/utils.ts (getLiquidTypeLabel function)
@src/lib/composable-entry-service.ts (ComposableEntryInput, addComposableEntry)
@src/lib/db.ts (IntakeRecord, EatingRecord interfaces)

<interfaces>
<!-- Key types the executor needs -->

From src/lib/db.ts:
```typescript
export interface IntakeRecord {
  id: string;
  type: "water" | "salt";
  amount: number;
  timestamp: number;
  source?: string;
  note?: string;
  groupId?: string;
  // ... sync fields
}

export interface EatingRecord {
  id: string;
  timestamp: number;
  grams?: number;
  note?: string;
  groupId?: string;
  // ... sync fields
}
```

From src/lib/composable-entry-service.ts:
```typescript
export interface ComposableEntryInput {
  eating?: { note?: string; grams?: number };
  intakes?: Array<{ type: "water" | "salt"; amount: number; source?: string; note?: string }>;
  // ...
}
```

From src/lib/utils.ts:
```typescript
export function getLiquidTypeLabel(
  source?: string,
  options?: { presets?: LiquidPreset[] | undefined; note?: string | undefined }
): string | null;
```

The composable entry service already supports `note` on individual intakes (line 12 of composable-entry-service.ts) and propagates it to the IntakeRecord (line 93). The food section just never passes it.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix water entry name display from food screen</name>
  <files>src/components/food-salt/food-section.tsx, src/lib/utils.ts</files>
  <action>
Two changes needed:

**A) In `src/components/food-salt/food-section.tsx` — Pass food name as note on water intake**

In the `handleDetailSubmit` function, where the water intake is pushed (around line 175-180):

```typescript
// CURRENT:
intakes.push({
  type: "water",
  amount: Math.round(waterMlNum),
  source: "manual:food_water_content",
});

// CHANGE TO:
intakes.push({
  type: "water",
  amount: Math.round(waterMlNum),
  source: "manual:food_water_content",
  note: foodText.trim() || undefined,
});
```

The `ComposableEntryInput.intakes[].note` field already exists in the type definition and is already propagated to the IntakeRecord by `composable-entry-service.ts` line 93: `...(intake.note !== undefined && { note: intake.note })`. No service changes needed.

**B) In `src/lib/utils.ts` — Add handler for `manual:food_water_content` source in `getLiquidTypeLabel`**

Add a new handler block BEFORE the final `return null` (after the substance handler, around line 92):

```typescript
// Manual sub-sources: "manual:food_water_content" -> note or "Food"
if (source.startsWith("manual:")) {
  return options?.note || "Food";
}
```

This ensures that water entries with source `"manual:food_water_content"` display the food name from the note field (e.g. "2 eggs and toast"), or fall back to "Food" if no note is present. The water-tab.tsx already passes `{ note: record.note }` to `getLiquidTypeLabel` (line 225), so the note will be picked up automatically.
  </action>
  <verify>
    <automated>cd /home/ryan/repos/Personal/intake-tracker && pnpm build 2>&1 | tail -5</automated>
  </verify>
  <done>Water entries created from the food screen display the food name (from note field) as a label badge in the water tab's recent entries list. The getLiquidTypeLabel function handles "manual:*" sources by showing the note or "Food" fallback.</done>
</task>

<task type="auto">
  <name>Task 2: Add sodium display to food recent entries</name>
  <files>src/components/food-salt/food-section.tsx</files>
  <action>
The food section's recent entries currently render: `{date} {weight} {name}`. Need to add `{sodium}` so it becomes: `{date} {sodium} {weight} {name}`.

Sodium is stored as a separate IntakeRecord (type="salt") linked by `groupId`. For eating records without a groupId (plain records), there is no sodium. The approach:

**A) Add a hook to fetch linked sodium amounts for recent eating records**

At the top of `FoodSection`, after the `recentRecords` query, add a `useLiveQuery` that looks up salt IntakeRecords for all groupIds in the recent eating records:

```typescript
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

// Inside FoodSection component, after recentRecords:
const groupIds = (recentRecords || [])
  .map((r) => r.groupId)
  .filter((id): id is string => !!id);

const groupSodiumMap = useLiveQuery(
  async () => {
    if (groupIds.length === 0) return new Map<string, number>();
    const saltRecords = await db.intakeRecords
      .where("groupId")
      .anyOf(groupIds)
      .and((r) => r.type === "salt" && r.deletedAt === null)
      .toArray();
    const map = new Map<string, number>();
    for (const r of saltRecords) {
      if (r.groupId) {
        map.set(r.groupId, (map.get(r.groupId) || 0) + r.amount);
      }
    }
    return map;
  },
  [groupIds.join(",")],
  new Map<string, number>()
);
```

**B) Update the renderEntry in the RecentEntriesList to show sodium**

Change the existing `renderEntry` callback (around line 368-382) to include sodium between date and weight:

```tsx
renderEntry={(record) => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="text-muted-foreground shrink-0">
      {formatDateTime(record.timestamp)}
    </span>
    {record.groupId && groupSodiumMap.get(record.groupId) ? (
      <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
        {groupSodiumMap.get(record.groupId)}mg
      </span>
    ) : null}
    {record.grams && (
      <span className="text-xs font-medium">{record.grams}g</span>
    )}
    {record.note && (
      <span className="text-xs text-muted-foreground/70 truncate">
        {record.note}
      </span>
    )}
  </div>
)}
```

Note: The sodium badge uses the orange color (matching the eating/salt theme) so it stands out visually. Only records with a groupId and linked salt entries will show the sodium value. Plain eating records (no composable group) show no sodium, which is correct.
  </action>
  <verify>
    <automated>cd /home/ryan/repos/Personal/intake-tracker && pnpm build 2>&1 | tail -5</automated>
  </verify>
  <done>Food recent entries display format is `{date} {sodium}mg {weight}g {name}` when sodium exists for a composable group, or `{date} {weight}g {name}` for plain eating records without sodium.</done>
</task>

</tasks>

<verification>
1. `pnpm build` completes without errors
2. `pnpm lint` passes
3. Manual verification: Log a food entry with all fields (name, sodium, water content), then:
   - Check water tab recent entries: the new water entry should show the food name as a label badge
   - Check food screen recent entries: the entry should show date, sodium mg, weight g, and name
</verification>

<success_criteria>
- Water entries created from the food screen display the food name in the water tab's recent entries
- Food recent entries show sodium in the format `{date} {sodium}mg {weight}g {name}`
- Build passes, no TypeScript errors
</success_criteria>
