---
phase: 43-sync-engine-core
plan: 01
subsystem: testing
tags: [sync, vitest, playwright, fake-indexeddb, scaffolding, nyquist]

# Dependency graph
requires:
  - phase: 42-postgres-schema-drizzle-setup
    provides: Drizzle schema (src/db/schema.ts) + drizzle-zod availability that future sync route tests will import
provides:
  - 7 vitest stub test files (sync-queue, sync-topology, sync-backoff, sync-engine, sync-push-route, sync-pull-route, migration/dexie-v16) — each fails with a clear MISSING message referencing the implementing plan
  - 1 Playwright E2E stub (e2e/sync-engine.spec.ts) with `push`/`pull`/`offline reconnect` grep tags matching 43-VALIDATION.md
  - Verified fake-indexeddb@6.2.5 is installed as a dev dependency and auto-polyfill is already wired into src/__tests__/setup.ts (Task 1 was a no-op on the baseline — see Deviations)
affects: [43-02, 43-03, 43-04, 43-05, 43-06, 43-07, 43-08, 44-*, 45-*]

# Tech tracking
tech-stack:
  added: []  # fake-indexeddb was already present on baseline
  patterns:
    - "MISSING-stub pattern: describe(...) containing one failing `it('MISSING — ...', () => expect.fail(...))` + it.todo entries for each planned assertion — gives Nyquist sampling a deterministic red signal without watch-mode flags"
    - "Per-file plan cross-reference: each MISSING message names the plan number (43-02-PLAN.md, etc.) that will implement the missing module, so executors can trace failures back to the owning plan"
    - "E2E stub with grep-addressable tags: comment `// tag: push` aligns the test body with --grep strings documented in 43-VALIDATION.md"

key-files:
  created:
    - src/__tests__/sync-queue.test.ts
    - src/__tests__/sync-topology.test.ts
    - src/__tests__/sync-backoff.test.ts
    - src/__tests__/sync-engine.test.ts
    - src/__tests__/sync-push-route.test.ts
    - src/__tests__/sync-pull-route.test.ts
    - src/__tests__/migration/dexie-v16.test.ts
    - e2e/sync-engine.spec.ts
  modified: []

key-decisions:
  - "Task 1 (fake-indexeddb install + setup.ts wire) was a no-op: the baseline already had fake-indexeddb@6.2.5 in devDependencies and `import 'fake-indexeddb/auto'` at line 1 of src/__tests__/setup.ts. No commit was required — verified and documented instead."
  - "Kept stub messages explicit about the owning plan number so each failure doubles as a forward reference (e.g. `sync-queue.ts not implemented — see 43-05-PLAN.md`)."
  - "E2E spec uses `test.skip(...)` (Playwright), NOT `describe.skip`/`it.skip` — matches plan acceptance criterion and keeps CI green pre-Wave 5."
  - "Vitest stubs use `it.todo(...)` for planned assertions (skipped, not failing) + one explicit `expect.fail(...)` MISSING test per file — 6 total red signals across sync-*.test.ts, 33 todos."

patterns-established:
  - "Stub-first Nyquist gate: every future Wave 1-3 test name in 43-VALIDATION.md already has a file + describe + it.todo landing spot — executors land assertions on first commit rather than manufacturing test files mid-implementation"

requirements-completed: [SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05]
# NOTE: These requirements are only *scaffolded* by this plan (stub test files exist).
# Each requirement's real implementation + green test lands in Waves 1-5 (plans 02-08).
# Marking them as "completed" here is scoped to Wave 0 responsibility: every SYNC-XX
# requirement has at least one failing stub test gating its implementation.

# Metrics
duration: ~6 min
completed: 2026-04-17
---

# Phase 43 Plan 01: Wave 0 Test Scaffolding Summary

**7 vitest stub files + 1 Playwright E2E spec produce 6 MISSING-labeled failures and 33 it.todo placeholders covering SYNC-01..05, gating every Wave 1-3 implementation plan with a deterministic Nyquist red signal.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-17T16:22:00Z (approx; worktree reset to base 471bb85)
- **Completed:** 2026-04-17T16:23:57Z
- **Tasks:** 3 (Task 1 was a no-op on baseline — no commit; Tasks 2 and 3 each produced one atomic commit)
- **Files modified:** 8 created, 0 modified

## Accomplishments

- 7 vitest stub files covering SYNC-01..05 — each fails with a clear `MISSING — ... not implemented yet (Plan NN)` message and registers 4-8 `it.todo` placeholders for the assertions future plans must land
- 1 Playwright E2E spec (`e2e/sync-engine.spec.ts`) with `test.describe("sync-engine")` and three `test.skip` bodies tagged `push`/`pull`/`offline reconnect` — matches the `--grep` strings in 43-VALIDATION.md rows 64-66
- Verified fake-indexeddb@6.2.5 dev-dep + setup.ts auto-import are already present on the baseline (Task 1 pre-satisfied by Phase 41/42 work)
- `pnpm vitest run src/__tests__/sync-*.test.ts` reports `6 failed | 33 todo` (meets plan-level verification: 6 MISSING failures, ≥20 todos, no import errors)

## Task Commits

Each task was committed atomically with `--no-verify` (parallel worktree mode):

1. **Task 1: Install fake-indexeddb and wire polyfill into vitest setup** — no commit required. Baseline already had `fake-indexeddb@6.2.5` in `package.json` devDependencies and `import "fake-indexeddb/auto"` at line 1 of `src/__tests__/setup.ts`. `vitest.config.ts` already references `setupFiles: ["src/__tests__/setup.ts"]`. Verified via `pnpm ls fake-indexeddb --depth 0` (prints `fake-indexeddb@6.2.5`) and `grep -n "fake-indexeddb/auto" src/__tests__/setup.ts` (matches line 1).
2. **Task 2: Create stub vitest files for sync-queue, sync-topology, sync-backoff, sync-engine** — `a53b785` (test)
3. **Task 3: Create stub tests for sync-push-route, sync-pull-route, dexie-v16 migration, and sync-engine E2E** — `1369c8a` (test)

**Plan metadata:** to be added by this summary commit (separate from per-task commits).

## Files Created/Modified

- `src/__tests__/sync-queue.test.ts` — SYNC-01 atomicity + SYNC-02 coalesce stub (1 MISSING + 4 todo)
- `src/__tests__/sync-topology.test.ts` — SYNC-02 FK invariants stub (1 MISSING + 4 todo)
- `src/__tests__/sync-backoff.test.ts` — SYNC-02 backoff math stub (1 MISSING + 4 todo)
- `src/__tests__/sync-engine.test.ts` — SYNC-01/02/03/05 loop + triggers stub (1 MISSING + 8 todo)
- `src/__tests__/sync-push-route.test.ts` — SYNC-04 server-side LWW stub (1 MISSING + 7 todo)
- `src/__tests__/sync-pull-route.test.ts` — SYNC-03 cursor + scope stub (1 MISSING + 6 todo)
- `src/__tests__/migration/dexie-v16.test.ts` — v16 migration data-preservation stub (1 MISSING + 6 todo)
- `e2e/sync-engine.spec.ts` — Playwright stub with `push`/`pull`/`offline reconnect` grep tags (4 `test.skip` bodies)

## Decisions Made

- **Task 1 no-op rather than unnecessary install:** baseline already has `fake-indexeddb@6.2.5` in devDependencies and the `import "fake-indexeddb/auto"` polyfill at line 1 of `src/__tests__/setup.ts`. Running `pnpm add -D fake-indexeddb` would have been a no-op at best and potentially churned `pnpm-lock.yaml` at worst. Documented the pre-existing state in the summary instead of manufacturing a commit.
- **Stub MISSING messages name the implementing plan number:** each `expect.fail(...)` message references the plan file that will land the real implementation (e.g. `see 43-05-PLAN.md`). Gives executors an instant forward pointer when a gate fires.
- **`test.skip` over `test.todo` for Playwright:** Playwright's `test.skip(title, fn)` signature is the standard way to register a not-yet-running spec; `test.todo` exists but lacks the body slot for `// tag: ...` comments that the `--grep` strings need to match. Plan acceptance criterion confirmed: "uses Playwright's `test.skip()` so CI doesn't fail pre-Wave 5."

## Deviations from Plan

### Auto-fixed / Pre-existing Conditions

**1. [Pre-existing — not a deviation per se] fake-indexeddb already installed on baseline**
- **Found during:** Task 1 (Install fake-indexeddb and wire polyfill)
- **Issue:** Plan instructed `pnpm add -D fake-indexeddb` and adding the auto-import to setup.ts. Both were already in place on the plan's base commit (`471bb85`).
- **Fix:** Skipped the install step; verified current state matches plan's target state.
- **Verification:** `pnpm ls fake-indexeddb --depth 0` prints `fake-indexeddb@6.2.5`; `grep -n "fake-indexeddb/auto" src/__tests__/setup.ts` matches line 1; `vitest.config.ts:8` references `setupFiles: ["src/__tests__/setup.ts"]`.
- **Committed in:** N/A — no change to commit.

---

**Total deviations:** 0 auto-fixed (1 pre-existing baseline match documented)
**Impact on plan:** None. Task 1's acceptance criteria were already satisfied; Tasks 2 and 3 executed verbatim per plan.

## Issues Encountered

None. All three tasks' `<verify>` commands passed on first run:
- Task 2: `pnpm vitest run src/__tests__/sync-{queue,topology,backoff,engine}.test.ts` → `4 failed | 20 todo` as required.
- Task 3: `pnpm vitest run src/__tests__/sync-{push,pull}-route.test.ts src/__tests__/migration/dexie-v16.test.ts` → `3 failed | 19 todo` as required.
- Plan-level: `pnpm vitest run src/__tests__/sync-*.test.ts` → `6 failed | 33 todo` (meets "6 MISSING-labeled failures" and "≥ 20 it.todo skips").
- E2E grep tags: `test.describe("sync-engine"` matches 1×; `push`, `pull`, `offline reconnect` each match ≥ 1 test body.

## User Setup Required

None — this plan is test-only scaffolding. No env vars, no external services, no schema changes.

## Next Phase Readiness

- **Ready for Plan 43-02 (v16 migration):** `src/__tests__/migration/dexie-v16.test.ts` exists with `describe("v16 migration: _syncQueue + _syncMeta tables added", ...)` and 6 `it.todo` assertions the migration implementer will fill in.
- **Ready for Plans 43-03 / 43-04 (push/pull routes):** stub files exist with all SYNC-04 + SYNC-03 assertions pre-registered as `it.todo`.
- **Ready for Plans 43-05 / 43-06 (queue + engine):** stub files exist; executors can land sync-queue/sync-topology/sync-backoff/sync-engine module code and convert `it.todo` → `it` in the same commit.
- **Ready for Plan 43-08 (E2E):** `e2e/sync-engine.spec.ts` has three `test.skip` bodies with `tag: push`/`pull`/`offline reconnect` comments; the `--grep` strings in 43-VALIDATION.md will hit them once the `test.skip` becomes `test`.
- **No blockers.** Phase 43 Wave 0 is complete; Wave 1 can start immediately.

## Self-Check: PASSED

Verified all claims after writing SUMMARY.md:

- Files exist (all 8):
  - FOUND: src/__tests__/sync-queue.test.ts
  - FOUND: src/__tests__/sync-topology.test.ts
  - FOUND: src/__tests__/sync-backoff.test.ts
  - FOUND: src/__tests__/sync-engine.test.ts
  - FOUND: src/__tests__/sync-push-route.test.ts
  - FOUND: src/__tests__/sync-pull-route.test.ts
  - FOUND: src/__tests__/migration/dexie-v16.test.ts
  - FOUND: e2e/sync-engine.spec.ts
- Commits exist:
  - FOUND: a53b785 (test(43-01): add sync-queue/topology/backoff/engine stub tests)
  - FOUND: 1369c8a (test(43-01): add sync route, v16 migration, and E2E stubs)
- Plan-level verification:
  - `pnpm vitest run src/__tests__/sync-*.test.ts` → `6 failed | 33 todo` (matches success criterion)
  - E2E grep tags: `push` matches 2×, `pull` matches 2×, `offline reconnect` matches 2×

---
*Phase: 43-sync-engine-core*
*Completed: 2026-04-17*
