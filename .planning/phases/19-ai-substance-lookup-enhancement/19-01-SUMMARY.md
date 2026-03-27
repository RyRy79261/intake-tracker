---
phase: 19-ai-substance-lookup-enhancement
plan: 01
subsystem: api/ai
tags: [ai, substance-lookup, water-content, zod, schema]
dependency_graph:
  requires: []
  provides: [waterContentPercent-in-substance-lookup-api]
  affects: [preset-tab-hydration-accuracy]
tech_stack:
  added: []
  patterns: [schema-extraction-for-nextjs-route-compat, tdd-red-green]
key_files:
  created:
    - src/app/api/ai/substance-lookup/schema.ts
    - src/app/api/ai/substance-lookup/route.test.ts
  modified:
    - src/app/api/ai/substance-lookup/route.ts
decisions:
  - "Extract schema/tool to schema.ts -- Next.js App Router forbids non-route exports from route.ts files"
metrics:
  duration: 22min
  completed: "2026-03-27T13:01:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 19 Plan 01: Add waterContentPercent to Substance Lookup API Summary

AI substance lookup now returns waterContentPercent (0-100) for every beverage query, enabling accurate hydration tracking instead of defaulting to 100% water content.

## What Was Done

### Task 1: Add waterContentPercent to Zod schema, tool definition, and system prompts (TDD)

**RED:** Created 9 failing tests in `route.test.ts` covering Zod schema validation (valid range, boundaries, rejection of out-of-range and missing values) and tool definition validation (required array and properties key).

**GREEN:**
- Added `waterContentPercent: z.number().min(0).max(100)` to `SubstanceLookupResponseSchema`
- Added `waterContentPercent` property to `SUBSTANCE_LOOKUP_TOOL.input_schema.properties` with description and reference values
- Added `"waterContentPercent"` to the tool's `required` array
- Appended water content estimation guidance to both caffeine and alcohol system prompts with reference points (black coffee ~99%, beer ~93%, wine ~87%, spirits ~60%)

### Task 2: Build verification and final validation

- All 9 unit tests pass
- TypeScript build succeeds
- `preset-tab.tsx` confirmed untouched (existing `?? 100` fallback preserved as safety net)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted schema to separate file for Next.js route compatibility**
- **Found during:** Task 2 (build verification)
- **Issue:** Next.js App Router route files only allow specific exports (GET, POST, etc.). Exporting `SubstanceLookupResponseSchema` and `SUBSTANCE_LOOKUP_TOOL` directly from `route.ts` caused a build error: `"SubstanceLookupResponseSchema" is not a valid Route export field`
- **Fix:** Created `schema.ts` in the same directory with the exported schema and tool definition. Updated `route.ts` to import from `./schema` and `route.test.ts` to import from `./schema`
- **Files modified:** `route.ts`, `route.test.ts`, new `schema.ts`
- **Commit:** 2c8074d

## Verification Results

- `pnpm test` -- 9/9 new tests pass, 299/300 total (1 pre-existing failure in `titration-service.test.ts`)
- `pnpm build` -- TypeScript compilation succeeds, production build clean
- `pnpm lint` -- Skipped in worktree due to ESLint plugin conflict (passes in main repo)
- `grep waterContentPercent schema.ts` -- 3 matches (Zod field, tool property, required array)
- `grep "water content" route.ts` -- 2 matches (caffeine prompt, alcohol prompt)
- `preset-tab.tsx` -- zero diff, confirmed untouched

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 88b7e72 | test | Add failing tests for waterContentPercent schema validation |
| 114e46f | feat | Add waterContentPercent to substance-lookup API |
| 2c8074d | refactor | Extract schema to separate file for Next.js route compat |

## Known Stubs

None -- all data flows are wired end-to-end. The API returns `waterContentPercent` which `preset-tab.tsx` already reads via `data.waterContentPercent ?? 100`.

## Self-Check: PASSED

All 3 created/modified files exist. All 3 commit hashes verified in git log.
