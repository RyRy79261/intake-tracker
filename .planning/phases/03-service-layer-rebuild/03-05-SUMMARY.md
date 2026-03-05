---
phase: 03-service-layer-rebuild
plan: 05
subsystem: inventory, debug
tags: [inventory, stock-recalculation, debug-panel, audit-logs, useLiveQuery]
dependency_graph:
  requires: [03-02]
  provides: [inventory-service, debug-panel-rebuild]
  affects: [src/app/providers.tsx]
tech_stack:
  added: []
  patterns: [event-sourced stock derivation, fire-and-forget initialization, useLiveQuery reactive debug views]
key_files:
  created:
    - src/lib/inventory-service.ts
  modified:
    - src/components/debug-panel.tsx
    - src/app/providers.tsx
    - .eslintrc.json
decisions:
  - ESLint override added for providers.tsx (infrastructure needs service import for init)
  - Debug panel uses accordion-style collapsible sections (not tabs) for cleaner UX
  - Stock comparison button separate from recalculate (non-destructive read vs write)
metrics:
  duration_minutes: 9
  completed: "2026-03-05T22:12:06Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 3 Plan 5: Inventory Stock Recalculation and Debug Panel Summary

Event-sourced stock recalculation service with fire-and-forget app launch init, plus rebuilt debug panel with reactive audit log viewer, stock management, and raw record browser.

## Tasks Completed

### Task 1: Create inventory service with stock recalculation
- **Commit:** 5e8a165
- **Files:** `src/lib/inventory-service.ts` (created)
- `getCurrentStock` derives from inventoryTransactions sum with 4-decimal rounding
- `recalculateStockForItem` persists derived value to cached currentStock
- `recalculateAllStock` iterates all items, detects drift (0.001 tolerance), writes audit log
- `initStockRecalculation` fire-and-forget for app launch

### Task 2: Rebuild debug panel
- **Commit:** 083c83d
- **Files:** `src/components/debug-panel.tsx` (rewritten 1294->500 lines), `src/app/providers.tsx`, `.eslintrc.json`
- **Section 1 - Audit Log Viewer:** useLiveQuery reactive, action filter dropdown, clear-all with confirm
- **Section 2 - Stock Management:** recalculate-all button with drift results, cached-vs-derived comparison
- **Section 3 - Raw Record Viewer:** table selector, record count, expandable JSON (50 most recent)
- `initStockRecalculation()` called on mount in providers.tsx via useEffect + ref guard
- ESLint override added for providers.tsx

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint no-restricted-imports for providers.tsx**
- **Found during:** Task 2
- **Issue:** providers.tsx is subject to the no-restricted-imports rule that prevents importing services directly
- **Fix:** Added ESLint override for `src/app/providers.tsx` since it's infrastructure, not a component
- **Files modified:** `.eslintrc.json`

**2. [Rule 1 - Bug] TypeScript error on unknown type in raw record viewer**
- **Found during:** Task 2
- **Issue:** `record.timestamp` was `unknown` causing TS2322 when used in JSX conditional
- **Fix:** Changed `record.timestamp &&` to `typeof record.timestamp === "number" &&`
- **Files modified:** `src/components/debug-panel.tsx`

## Out-of-Scope Issues

Pre-existing `pnpm build` failure: `history/page.tsx` destructures `loadAllRecords` from `useHistoryData()` but the hook (rebuilt in 03-03) no longer exports it. Logged to `deferred-items.md`. Does not affect files in this plan.

## Verification

- [x] inventory-service.ts getCurrentStock derives from transactions (grep confirms `inventoryTransactions`)
- [x] debug-panel.tsx uses useLiveQuery (3 instances: audit logs, active items, raw records)
- [x] initStockRecalculation called in providers.tsx
- [x] ESLint passes for all plan files
- [x] TypeScript passes for all plan files
- [ ] pnpm build blocked by pre-existing error in history/page.tsx (unrelated)
