---
phase: 13-liquid-presets-and-ai-lookup
plan: 01
subsystem: data-layer
tags: [zustand, anthropic, presets, crud, persist-migration, singleton]

# Dependency graph
requires: []
provides:
  - LiquidPreset interface and DEFAULT_LIQUID_PRESETS constant (8 presets)
  - liquidPresets CRUD actions in settings-store (add/update/delete)
  - Persist v2 migration seeding defaults for existing users
  - Shared Anthropic client singleton (getClaudeClient) with model constants
affects: [13-02-PLAN, 13-03-PLAN]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk", "vitest"]
  patterns: ["Zustand persist migration with version bump", "Shared API client singleton", "per-100ml substance unit convention"]

key-files:
  created:
    - src/app/api/ai/_shared/claude-client.ts
    - src/stores/__tests__/settings-store-presets.test.ts
    - vitest.config.ts
  modified:
    - src/lib/constants.ts
    - src/stores/settings-store.ts
    - package.json

key-decisions:
  - "Substance stored as per-100ml (not absolute) per D-01 convention"
  - "Anthropic SDK model IDs use dated versions for reproducibility"
  - "Vitest added as test framework (first unit tests in project)"

patterns-established:
  - "LiquidPreset per-100ml unit: caffeine in mg/100ml, alcohol in std-drinks/100ml"
  - "Zustand persist version migration: bump version, add migration branch for version < N"
  - "Shared Claude client: import getClaudeClient() instead of new Anthropic() per route"

requirements-completed: [LIQD-02]

# Metrics
duration: 6min
completed: 2026-03-24
---

# Phase 13 Plan 01: Liquid Presets Data Layer Summary

**LiquidPreset CRUD in Zustand with 8 default presets (5 caffeine, 3 alcohol), persist v2 migration, and shared Anthropic client singleton**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T07:00:29Z
- **Completed:** 2026-03-24T07:07:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- LiquidPreset interface with 7 required fields plus optional aiConfidence, stored per-100ml per D-01
- 8 default presets seeded from existing COFFEE_PRESETS and substanceConfig values
- Full CRUD (add with UUID, update by id, delete by id) with no-op safety for missing ids
- Persist version bumped to 2 with migration that seeds presets for upgrading users
- Shared Anthropic client singleton with fast (Haiku) and quality (Sonnet) model tiers
- Unit test infrastructure (vitest) with 7 passing tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DEFAULT_LIQUID_PRESETS constant and shared Claude client** - `636e8c5` (feat)
2. **Task 2 RED: Failing tests for liquidPresets CRUD** - `7b52027` (test)
3. **Task 2 GREEN: liquidPresets CRUD implementation** - `1f4cc79` (feat)

## Files Created/Modified
- `src/lib/constants.ts` - Added LiquidPreset interface and DEFAULT_LIQUID_PRESETS array (8 presets)
- `src/app/api/ai/_shared/claude-client.ts` - Shared Anthropic SDK singleton with model constants
- `src/stores/settings-store.ts` - Added liquidPresets field, CRUD actions, persist v2 migration
- `src/stores/__tests__/settings-store-presets.test.ts` - 7 unit tests for preset CRUD operations
- `vitest.config.ts` - Vitest configuration with @ path alias
- `package.json` - Added @anthropic-ai/sdk dependency, vitest devDependency, test script

## Decisions Made
- Used per-100ml substance units (mg/100ml for caffeine, std-drinks/100ml for alcohol) per D-01 convention from research -- absolute amounts calculated at log time from volume
- Anthropic model IDs use dated versions (claude-haiku-4-5-20251001, claude-sonnet-4-5-20250514) for reproducibility
- Added vitest as test framework -- first unit tests in the project; vitest chosen for native ESM and Vite compatibility
- Persist migration version 2 seeds defaults using < 2 check (not === 1) to handle both v0 and v1 upgrades

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed vitest test infrastructure**
- **Found during:** Task 2 (TDD RED phase)
- **Issue:** No test framework installed in project; plan specified TDD but no vitest/jest available
- **Fix:** Installed vitest, created vitest.config.ts with @ path alias resolution, added test script to package.json
- **Files modified:** package.json, pnpm-lock.yaml, vitest.config.ts
- **Verification:** All 7 tests run and fail correctly in RED phase, pass in GREEN phase
- **Committed in:** 7b52027 (Task 2 RED commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test infrastructure was prerequisite for TDD task. No scope creep.

## Issues Encountered
- Pre-existing ESLint lint errors in `pnpm build` (no-restricted-imports in hooks/) -- confirmed these exist on main branch before any changes. Out of scope, not caused by this plan.
- Zustand persist middleware logs "Unable to update item" warnings in vitest (node environment has no localStorage) -- expected behavior, doesn't affect test correctness.

## User Setup Required

None for this plan. The ANTHROPIC_API_KEY environment variable will be needed when Plans 02/03 wire up the AI lookup routes, but the client singleton created here merely throws a clear error if the key is missing.

## Next Phase Readiness
- LiquidPreset type and CRUD actions ready for Plan 02 (UI components) to consume
- Claude client singleton ready for Plan 03 (AI migration) to use in API routes
- Default presets provide immediate data for UI rendering without any user configuration

## Self-Check: PASSED

All 5 created/modified files verified on disk. All 3 task commits verified in git history.

---
*Phase: 13-liquid-presets-and-ai-lookup*
*Completed: 2026-03-24*
