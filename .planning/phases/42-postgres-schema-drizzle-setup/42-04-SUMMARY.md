---
phase: 42-postgres-schema-drizzle-setup
plan: 04
subsystem: ci
tags: [drizzle, neon, ci, schema-migration, github-actions, typescript]

requires:
  - phase: 42-01
    provides: src/db/schema.ts with all 20 pgTable definitions
  - phase: 42-02
    provides: drizzle/0000_init.sql migration file + pnpm db:migrate script
  - phase: 42-03
    provides: static parity gate (drizzle-kit freshness check) in CI typecheck job

provides:
  - scripts/verify-schema.ts (Neon HTTP smoke check: 21-table count, spot-checks, FK target)
  - .github/workflows/ci.yml schema-migration job (ephemeral Neon branch lifecycle, pnpm db:migrate, verify-schema.ts)
  - src/__tests__/ci-workflow-structure.test.ts updated with 8 new schema-migration assertions

affects:
  - All future phases that touch src/db/schema.ts or drizzle/ (migration failures now block PR merge)
  - Phase 43 (sync engine) — D-17 gate means any bad FK or CHECK constraint is caught before sync code lands

tech-stack:
  added: []
  patterns:
    - Ephemeral Neon branch per CI run via neondatabase/create-branch-action@v5 (same pattern as e2e job)
    - @neondatabase/serverless sql.query() for post-migration schema verification (no psql dependency)
    - ci-pass unconditional job block — schema-migration must succeed (not success-or-skipped)

key-files:
  created:
    - scripts/verify-schema.ts
  modified:
    - .github/workflows/ci.yml
    - src/__tests__/ci-workflow-structure.test.ts

key-decisions:
  - "EXPECTED_TABLE_COUNT pinned to 21 (20 app/push tables + 1 __drizzle_migrations tracker) — derived from counting CREATE TABLE in drizzle/0000_init.sql"
  - "schema-migration job is unconditional (no needs: [changes] gate) — schema drift can enter via package.json updates, not just src/ changes"
  - "No psql dependency anywhere — @neondatabase/serverless is the sole DB client, consistent with rest of project"
  - "Branch name ci-schema-<run_id> distinct from e2e's ci-e2e-<run_id> to prevent concurrent job collision"
  - "delete-branch-action uses if: always() to prevent orphaned branches on job failure or cancellation"

patterns-established:
  - "Post-migration smoke check pattern: sql.query() against information_schema for table count + EXISTS checks + FK target verification"
  - "Neon ephemeral branch per CI job: create → apply → verify → delete (if: always) — reuses Phase 41 e2e pattern"

requirements-completed:
  - SCHEMA-03
  - SCHEMA-04

duration: 15min
completed: 2026-04-17
---

# Phase 42 Plan 04: Dynamic Schema Migration CI Gate Summary

**Ephemeral Neon branch per PR that applies `pnpm db:migrate` and verifies 21-table schema shape via `@neondatabase/serverless` — no psql, no shared staging branch (D-17)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-17T13:20:00Z
- **Completed:** 2026-04-17T13:35:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `scripts/verify-schema.ts` — post-migration smoke check using `@neondatabase/serverless` that asserts exactly 21 public tables exist after `drizzle-kit migrate`, spot-checks `intake_records`, `push_schedules`, and `prescriptions` by name, and confirms `intake_records.user_id` FK targets `neon_auth.users_sync` (not `public.users_sync`). Exits non-zero with `::error::` annotations on any failure.
- Added `schema-migration` CI job to `.github/workflows/ci.yml` — creates a `ci-schema-<run_id>` Neon branch, installs deps via `pnpm install --frozen-lockfile`, applies migrations with `pnpm db:migrate`, verifies schema shape with `pnpm tsx scripts/verify-schema.ts`, and always deletes the branch. No `psql` or `postgresql-client` dependency anywhere in the job.
- Updated `ci-pass` aggregate job: added `schema-migration` to `needs:` list and to the unconditional check block (must succeed, not success-or-skipped). D-17 is now fully satisfied jointly with 42-03's static freshness check.
- Extended `src/__tests__/ci-workflow-structure.test.ts` with 8 new assertions covering job existence, branch create/delete actions, `pnpm db:migrate` step, `pnpm tsx scripts/verify-schema.ts` step, absence of `psql`, no `changes` gate, `ci-pass` needs inclusion, and `ci-pass` unconditional result check. House style preserved: `extractJobBlock()` + `.toContain()`/`.toMatch()`, no `js-yaml` added.

## Task Commits

1. **Task 1: verify-schema.ts + schema-migration CI job** — `d2deb1e` (feat)
2. **Task 2: ci-workflow-structure.test.ts assertions** — `a03020f` (test)

## Files Created/Modified

- `scripts/verify-schema.ts` — 100-line tsx script; imports `neon` from `@neondatabase/serverless`; asserts `EXPECTED_TABLE_COUNT=21`, spot-checks 3 tables, verifies FK target; exits non-zero with clear error on any failure; no new dependencies
- `.github/workflows/ci.yml` — new `schema-migration` job (36 lines) between `e2e` and `supply-chain`; updated `ci-pass` needs array and unconditional check block
- `src/__tests__/ci-workflow-structure.test.ts` — 91 lines added; 8 new it() assertions in a Phase 42 D-17 describe block; total test count 62 (was 54)

## Decisions Made

- **EXPECTED_TABLE_COUNT = 21.** Counted empirically from `drizzle/0000_init.sql`: 20 public tables (16 Dexie-mirrored + 4 push) + 1 `__drizzle_migrations` bookkeeping table created by drizzle-kit. The `neon_auth.users_sync` table is in the `neon_auth` schema, not public, so it does not count.
- **Unconditional job (no `needs: [changes]` gate).** Schema-affecting changes can arrive via `package.json` / `pnpm-lock.yaml` updates (e.g., a drizzle-kit version bump that changes SQL generation). Keeping the job unconditional ensures every PR is verified regardless of which files changed.
- **@neondatabase/serverless, not psql.** Ubuntu runners do not reliably pre-install `postgresql-client`. The Neon pooled HTTP endpoint is not always a standard libpq target. The project already depends on `@neondatabase/serverless` (used by `push-db.ts` and `reset-neon-db.ts`) — using it for verification keeps the stack consistent.
- **Branch name `ci-schema-<run_id>` distinct from `ci-e2e-<run_id>`.** Two concurrent jobs on the same PR would collide if they shared a branch name prefix. The distinct prefix also makes orphaned branch cleanup easier to identify.

## Deviations from Plan

**[Rule 1 - Bug] Removed `psql` word from schema-migration job comment**

- **Found during:** Task 1 verification
- **Issue:** The plan's YAML template included the comment `# Uses @neondatabase/serverless (already a project dep) — no psql / # or postgresql-client install needed`. The word `psql` in a comment still matched the acceptance criterion check `! grep -qE "\bpsql\b" .github/workflows/ci.yml` and would also fail the Task 2 assertion `expect(block).not.toMatch(/\bpsql\b/)`.
- **Fix:** Rephrased comment to `# Uses @neondatabase/serverless (already a project dep) — no / # postgresql-client install needed on the runner.` (removed `psql` word, kept `postgresql-client`).
- **Files modified:** `.github/workflows/ci.yml`
- **Commit:** Inline fix within d2deb1e

## Known Stubs

None. `scripts/verify-schema.ts` is a runnable script with pinned constants (not placeholders). The CI job runs against a real Neon branch (not mocked). `EXPECTED_TABLE_COUNT=21` is empirically derived from the committed migration file.

## Threat Surface Scan

No new network endpoints or auth paths introduced. The `schema-migration` CI job is covered by the plan's threat model (T-42-16 through T-42-21):
- Branch name collision prevented by distinct `ci-schema-` prefix (T-42-16)
- Branch deletion uses `if: always()` to prevent orphans (T-42-17)
- DATABASE_URL passed as env var only, never echoed; verify-schema.ts never prints the URL (T-42-18)
- Fork PRs cannot access NEON_API_KEY by GitHub policy (T-42-19)
- drizzle-kit and verify-schema.ts both exit non-zero on failure (T-42-20)

## Self-Check: PASSED

- `scripts/verify-schema.ts` exists — FOUND
- `.github/workflows/ci.yml` contains `schema-migration:` — FOUND
- `.github/workflows/ci.yml` contains `ci-schema-${{ github.run_id }}` — FOUND
- `.github/workflows/ci.yml` contains `pnpm db:migrate` — FOUND
- `.github/workflows/ci.yml` contains `pnpm tsx scripts/verify-schema.ts` — FOUND
- `.github/workflows/ci.yml` contains no `\bpsql\b` word — CONFIRMED
- `.github/workflows/ci.yml` contains no `doseLogs_noop` — CONFIRMED
- `ci-pass` needs includes `schema-migration` — CONFIRMED
- `ci-pass` unconditional block checks `needs.schema-migration.result` — CONFIRMED
- YAML valid — python3 yaml.safe_load passes
- `pnpm typecheck` — PASSED
- `pnpm lint scripts/verify-schema.ts` — PASSED
- `pnpm lint src/__tests__/ci-workflow-structure.test.ts` — PASSED
- `vitest run src/__tests__/ci-workflow-structure.test.ts` — 62/62 PASSED
- No js-yaml in test file or package.json — CONFIRMED
- Commit `d2deb1e` exists — FOUND
- Commit `a03020f` exists — FOUND
- No file deletions in any task commit — CONFIRMED

---
*Phase: 42-postgres-schema-drizzle-setup*
*Completed: 2026-04-17*
