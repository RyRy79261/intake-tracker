# Phase 38: Weight Input Default Value Bug - Research

**Researched:** 2026-04-06
**Phase:** 38-weight-input-default-value-bug
**Question:** What do I need to know to PLAN this phase well?

## Root Cause Analysis

### The Bug

The weight card (`src/components/weight-card.tsx`) defaults to 70 kg instead of the user's last recorded weight. The race condition occurs in the `useEffect` at lines 53-65:

```typescript
useEffect(() => {
  if (pendingWeight !== null) return;
  if (recentRecords && recentRecords.length > 0) {
    const latest = recentRecords[0];
    if (latest) setPendingWeight(latest.weight);
    return;
  }
  // Delay fallback so live query has time to resolve with real data
  const timer = setTimeout(() => {
    setPendingWeight(prev => prev === null ? 70 : prev);
  }, 200);
  return () => clearTimeout(timer);
}, [recentRecords, pendingWeight]);
```

### Why It Happens

1. `useWeightRecords(5)` calls `useLiveQuery(() => getWeightRecords(limit), [limit], [])` -- the third argument `[]` is the **synchronous default** before Dexie resolves
2. On first render, `recentRecords` is `[]` (the default), not the actual DB data
3. The `useEffect` sees `recentRecords.length === 0` and starts a 200ms timeout
4. On slower devices (phones), the Dexie query takes longer than 200ms to resolve
5. The timeout fires, setting `pendingWeight` to 70
6. When the real records finally arrive, `pendingWeight !== null` causes the early return -- the real data is ignored

### The Operator Precedence Issue (Line 44)

```typescript
const isLoading = !recentRecords || recentRecords.length === 0 && pendingWeight === null;
```

Due to operator precedence, this evaluates as:
```typescript
const isLoading = !recentRecords || (recentRecords.length === 0 && pendingWeight === null);
```

This means `isLoading` is only true when there are zero records AND no pending weight. Once the 200ms timeout sets `pendingWeight = 70`, `isLoading` becomes false even though we haven't loaded real data yet.

## Technical Approach

### Key Insight: Distinguish "not yet loaded" from "loaded with zero records"

Currently `useLiveQuery` returns `[]` for both states. The fix is:
- Change default from `[]` to `undefined`
- `undefined` = query hasn't resolved yet (loading state)
- `[]` = query resolved, user has no records
- `WeightRecord[]` = query resolved with data

### Affected Files

1. **`src/hooks/use-health-queries.ts`** (line 69)
   - Change: `useLiveQuery(() => getWeightRecords(limit), [limit], [])` to `useLiveQuery(() => getWeightRecords(limit), [limit])`
   - Omitting the third arg makes the default `undefined`
   - Return type changes from `WeightRecord[]` to `WeightRecord[] | undefined`

2. **`src/components/weight-card.tsx`** (lines 43-65)
   - `isLoading`: Simplify to `recentRecords === undefined`
   - `useEffect`: Remove setTimeout entirely, use direct conditional logic
   - Add Skeleton component for loading state in the input area

3. **`src/components/ui/skeleton.tsx`** (NEW FILE)
   - shadcn Skeleton component does not exist in the project yet
   - Must be added via `pnpm dlx shadcn@latest add skeleton` or created manually
   - Standard shadcn Skeleton is a simple animated div with `animate-pulse` class

### useLiveQuery Behavior (Dexie)

From the Dexie docs, `useLiveQuery(queryFn, deps, defaultValue)`:
- If `defaultValue` is provided, it's returned synchronously on first render before the query resolves
- If `defaultValue` is omitted, `undefined` is returned before the query resolves
- Once the query resolves, the hook triggers a re-render with the actual data
- The hook re-runs the query whenever dependencies change or when the underlying Dexie table data changes (live reactivity)

### Skeleton Component

The project does not currently have a `skeleton.tsx` in `src/components/ui/`. The standard shadcn/ui Skeleton component is minimal:

```typescript
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />
  )
}

export { Skeleton }
```

The weight card header area (lines 158-161) already has a manual loading skeleton using `animate-pulse` and `theme.loadingBg`. The new Skeleton component should be used for the input area loading state to maintain consistency with the shadcn pattern.

## Existing Loading Pattern in Weight Card

The card already has a loading indicator in the header (lines 158-161):
```tsx
{isLoading ? (
  <div className="animate-pulse text-right">
    <div className={cn("h-6 w-16 rounded ml-auto", theme.loadingBg)} />
    <div className="h-4 w-24 bg-muted rounded mt-1 ml-auto" />
  </div>
) : latestWeight ? ( ... ) : null}
```

This uses manual `animate-pulse` divs. The new loading state for the input area should use the same visual language (or optionally replace both with the shadcn Skeleton component for consistency). The CONTEXT.md decisions say to use shadcn Skeleton (D-09, D-11).

## Edge Cases

### Delete All Records
- Per D-14: If `pendingWeight` is already set and user deletes all records, keep the current value
- Per D-15: Only use 69 fallback when `pendingWeight` is null (fresh page load with no records)
- Implementation: The `useEffect` should check `pendingWeight !== null` before applying any fallback

### RecentEntriesList Compatibility
- `RecentEntriesList` receives `records={recentRecords}` -- changing the type to `WeightRecord[] | undefined` needs to be checked for compatibility
- The component likely handles `undefined` or empty arrays already, but should be verified

### InlineEdit Compatibility
- `InlineEdit` already handles `null` value (shows `"--"` via `formatDisplay`)
- During loading, `pendingWeight` stays `null`, so InlineEdit will show `"--"` until data loads
- With Skeleton overlay, this is hidden during loading state

## Risk Assessment

**Risk: LOW** -- This is a surgical bug fix with clear root cause and well-defined fix path.

- No database schema changes
- No new dependencies (Skeleton is a simple component)
- No API changes
- Change is isolated to 2 existing files + 1 new UI component
- Fallback logic change is straightforward (remove timeout, add conditional)

## Validation Architecture

### Testable Properties
1. **Loading state renders correctly** -- Skeleton visible when `recentRecords === undefined`
2. **Last weight pre-fills** -- After records load, `pendingWeight` equals latest record's weight
3. **First-time user gets 69** -- With zero records, `pendingWeight` becomes 69
4. **No race condition** -- No setTimeout in the weight initialization logic
5. **Buttons disabled during loading** -- +/- and Record buttons have `disabled` during loading
6. **Delete-all preserves value** -- If records become empty while `pendingWeight` is set, value persists

## RESEARCH COMPLETE
