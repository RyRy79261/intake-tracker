---
phase: 42-postgres-schema-drizzle-setup
plan: 03
subsystem: testing
tags: [drizzle, dexie, schema-parity, vitest, ci, typescript-compiler-api]

requires:
  - phase: 42-01
    provides: src/db/schema.ts with all 20 pgTable definitions

provides:
  - src/__tests__/dexie-schema-extractor.ts (TypeScript compiler API walker for Dexie interface extraction)
  - src/__tests__/schema-parity.test.ts (69-test Vitest suite: Dexie ↔ Drizzle field-level parity gate)
  - CI drizzle freshness check in .github/workflows/ci.yml typecheck job

affects:
  - 42-04 (wave 3 — dynamic Neon branch migrate gate complements this static gate)
  - 43-sync-engine-core (parity test will catch any schema drift during sync implementation)
  - All future phases that touch src/lib/db.ts or src/db/schema.ts

tech-stack:
  added: []
  patterns:
    - TypeScript compiler API (ts.createSourceFile + ts.forEachChild) for static source analysis — no ts-morph dep needed
    - it.each() over extracted table list for parameterized per-table CI test output
    - Static TABLE_TO_INTERFACE map (not pluralization heuristics) for explicit, loud failure on new-table additions
    - drizzle-orm getTableColumns() for camelCase TS property name enumeration at runtime

key-files:
  created:
    - src/__tests__/dexie-schema-extractor.ts
    - src/__tests__/schema-parity.test.ts
  modified:
    - .github/workflows/ci.yml (new step in typecheck job)

key-decisions:
  - "Used static TABLE_TO_INTERFACE map instead of pluralization heuristics — English plural rules are inconsistent (Schedule, Log, Note, Plan) and a map fails loudly when a new table is added without updating it"
  - "Attached freshness check to existing typecheck job (not a new job) — same deps as typecheck, ~5s check, no ci-pass needs: list change required"
  - "process.cwd() for default db.ts path in extractor — Vitest sets cwd to project root, more reliable than __dirname in a transformed module context"
  - "DRIZZLE_ONLY_EXEMPTIONS is a compile-time Set constant with no env-var escape hatch — aligns with T-42-12 mitigation"

patterns-established:
  - "Schema drift tests: use TypeScript compiler API to walk source files in tests — no ts-morph needed, works within existing devDeps"
  - "Parity comparator: camelCase TS property names on both sides (getTableColumns returns TS keys, extractor returns interface field names) — no snake_case conversion needed"

requirements-completed:
  - SCHEMA-04

duration: 8min
completed: 2026-04-17
---

# Phase 42 Plan 03: Schema Parity Gate Summary

**Dexie ↔ Drizzle field-level parity enforced by 69-test Vitest suite (TypeScript compiler API walker + getTableColumns) and a drizzle-kit freshness check wired into CI typecheck job**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-17T13:00:00Z
- **Completed:** 2026-04-17T13:08:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created `src/__tests__/dexie-schema-extractor.ts` — walks `src/lib/db.ts` using TypeScript compiler API (`ts.createSourceFile` + `ts.forEachChild`), extracts all 16 Dexie interface field lists via a static table→interface name map, throws a clear error if an expected interface is missing
- Created `src/__tests__/schema-parity.test.ts` — 69 parameterized tests (16 tables × 4 assertions + 5 extractor sanity checks) verifying: every Dexie table has a Drizzle export, every Dexie field exists in Drizzle, no extra Drizzle columns beyond `userId`, every table has `userId`
- Added drizzle migrations freshness check to CI `typecheck` job — runs `drizzle-kit generate` then `git status --porcelain drizzle/`, fails with actionable error message if any uncommitted diff is detected

## Task Commits

1. **Task 1: Dexie schema extractor (TS compiler API walker)** — `b48d244` (feat)
2. **Task 2: Schema parity test** — `9957129` (feat)
3. **Task 3: CI drizzle freshness check** — `431d7c3` (chore)

## Files Created/Modified

- `src/__tests__/dexie-schema-extractor.ts` — TypeScript compiler API walker; exports `extractDexieSchema()` and `DexieTableSchema` interface; 16-entry static TABLE_TO_INTERFACE map; no new dependencies
- `src/__tests__/schema-parity.test.ts` — 69-test Vitest suite comparing Dexie interfaces to Drizzle tables; uses `it.each(DEXIE_TABLES)` for per-table failure reporting; `getTableColumns()` from drizzle-orm for camelCase property enumeration; zero DB connection
- `.github/workflows/ci.yml` — new step added to `typecheck` job (lines 60-70): `pnpm exec drizzle-kit generate && git status --porcelain drizzle/`

## Decisions Made

- **Static TABLE_TO_INTERFACE map over pluralization heuristics.** English plural rules are inconsistent enough (Schedule→Schedules, Log→Logs, DailyNote→dailyNotes, TitrationPlan→titrationPlans) that any regex would have edge cases. The explicit map fails loudly when someone adds a new Dexie table without updating it — that's a feature, not a bug.
- **Attached to `typecheck` job, not a new job.** The freshness check needs pnpm + Node + `drizzle-kit` (already a devDep) — identical deps to `typecheck`. Adding a separate job would require updating `ci-pass`'s `needs:` list and the `ci-workflow-structure.test.ts` assertions. Piggy-backing keeps the CI graph unchanged.
- **`process.cwd()` for default db.ts path.** Vitest sets `process.cwd()` to the project root, which is more reliable than `__dirname` (which can shift under module transforms) or `import.meta.url` (ESM-only).
- **`--porcelain` over `git diff --exit-code`.** `git diff --exit-code` misses untracked new files. New migration SQL files land as untracked after `drizzle-kit generate`, so `--porcelain` is the correct check.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. Both test files passed on first run. CI yaml validated by both `js-yaml` and Python `yaml.safe_load`. All 54 pre-existing `ci-workflow-structure.test.ts` assertions still pass.

## Known Stubs

None. Both test files exercise live code paths against the real `src/lib/db.ts` and `src/db/schema.ts` — no hardcoded field lists or mock data.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. Both files are test-only (never imported by application code). The CI step runs `drizzle-kit generate` in a sandboxed GitHub Actions runner with no DB credentials — pure source-code comparison.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The parity gate is live and will catch Dexie ↔ Drizzle drift from this commit forward
- Plan 42-04 (wave 3, runs in parallel with 42-03) owns the complementary dynamic gate: ephemeral Neon branch + `drizzle-kit migrate`
- Phase 43 (sync engine core) can proceed knowing any schema drift will surface immediately in CI

## Self-Check: PASSED

- `src/__tests__/dexie-schema-extractor.ts` exists — FOUND
- `src/__tests__/schema-parity.test.ts` exists — FOUND
- Commit `b48d244` exists — FOUND
- Commit `9957129` exists — FOUND
- Commit `431d7c3` exists — FOUND
- `pnpm typecheck` — PASSED
- `npx vitest run src/__tests__/schema-parity.test.ts` — 69/69 PASSED
- `npx vitest run src/__tests__/ci-workflow-structure.test.ts` — 54/54 PASSED
- YAML valid (js-yaml + python yaml.safe_load) — PASSED
- No file deletions in any task commit — CONFIRMED
- No modifications to STATE.md, ROADMAP.md, or 42-02 files — CONFIRMED

---
*Phase: 42-postgres-schema-drizzle-setup*
*Completed: 2026-04-17*
