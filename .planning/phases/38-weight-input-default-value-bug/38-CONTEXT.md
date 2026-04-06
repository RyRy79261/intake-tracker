# Phase 38: Weight Input Default Value Bug - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix weight input defaulting to 70 instead of the last recorded value. The root cause is a race between `useLiveQuery`'s synchronous default (`[]`) and a 200ms setTimeout fallback that sets 70. On slower devices, the timeout fires before the Dexie query resolves.

</domain>

<decisions>
## Implementation Decisions

### Default value strategy
- **D-01:** Remove the 200ms setTimeout fallback entirely — do not race against the DB
- **D-02:** Keep `pendingWeight` as `null` until `useLiveQuery` resolves with real data
- **D-03:** Once resolved with records, set `pendingWeight` to the latest record's weight
- **D-04:** Once resolved with zero records (confirmed empty), fall back to 69 kg

### Query resolution detection
- **D-05:** Change `useWeightRecords`'s `useLiveQuery` default from `[]` to `undefined`
- **D-06:** `undefined` = query hasn't resolved yet (loading); `[]` = resolved with zero records; `[...records]` = resolved with data

### isLoading state
- **D-07:** Simplify isLoading to `recentRecords === undefined` — loading only while query is unresolved
- **D-08:** Fix the operator precedence issue on current line 44

### Loading UX
- **D-09:** Show shadcn `Skeleton` component in the weight display area while `isLoading` is true
- **D-10:** Disable +/- buttons and Record button during loading state
- **D-11:** Use shadcn's existing Skeleton component — no custom shimmer implementations

### First-time user fallback
- **D-12:** Use 69 kg as the default for brand-new users with zero weight records
- **D-13:** This only triggers after the DB query confirms zero records exist — never as a timeout race

### Edge case: delete all records
- **D-14:** If user deletes all records and `pendingWeight` is already set, keep the current value
- **D-15:** Only use the 69 fallback when `pendingWeight` is null (fresh page load with no records)

### Claude's Discretion
- Exact skeleton dimensions and placement within the weight card
- Whether to adjust `useWeightRecords` signature or create a wrapper
- Test coverage for the loading/resolution states

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Key source files
- `src/components/weight-card.tsx` — the component with the bug (lines 43-65 are the core issue)
- `src/hooks/use-health-queries.ts` lines 68-70 — `useWeightRecords` hook using `useLiveQuery`
- `src/components/ui/inline-edit.tsx` — InlineEdit component used for weight display
- `src/components/ui/skeleton.tsx` — shadcn Skeleton component to use for loading state

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shadcn Skeleton` component (`src/components/ui/skeleton.tsx`) — ready to use for loading placeholder
- `InlineEdit` component — already handles `null` value by showing `"--"` via `formatDisplay`
- `useDeleteWithToast` and `useEditRecord` hooks — existing patterns for mutation handling

### Established Patterns
- `useLiveQuery(queryFn, deps, defaultValue)` — third arg is the synchronous default before resolution
- Other cards (water, salt) don't have this race condition because they use different default logic
- Weight card already has loading skeleton in the header area (lines 158-161) — can reference for consistency

### Integration Points
- `useWeightRecords` in `use-health-queries.ts` — changing default from `[]` to `undefined` affects the return type
- `weight-card.tsx` line 44 — `isLoading` check needs updating to match new resolution semantics
- `weight-card.tsx` lines 53-65 — the `useEffect` with setTimeout needs complete rewrite

</code_context>

<specifics>
## Specific Ideas

- Use shadcn's Skeleton component for loading state — keep it consistent with shadcn patterns throughout the app
- The fix should be surgical: change the default, fix the useEffect, update isLoading — no broader refactoring

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 38-weight-input-default-value-bug*
*Context gathered: 2026-04-06*
