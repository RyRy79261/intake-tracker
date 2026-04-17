---
phase: 43-sync-engine-core
plan: 04
subsystem: api
tags: [sync, api, security, cursor, drizzle, zod, neon-auth, pull]

# Dependency graph
requires:
  - phase: 41-neon-auth-privy-removal
    provides: withAuth higher-order route guard + auth.userId! non-null convention
  - phase: 42-postgres-schema-drizzle-setup
    provides: src/db/schema.ts (16 tables, bigint updatedAt, user_id text NOT NULL)
  - phase: 43-sync-engine-core (plan 01)
    provides: stub test file src/__tests__/sync-pull-route.test.ts
  - phase: 43-sync-engine-core (plan 03)
    provides: pushBodySchema + schemaByTableName + TableName + src/lib/drizzle.ts client
provides:
  - POST /api/sync/pull — cursor-paginated per-table SELECT with tombstones and serverTime anchor
  - pullBodySchema + PullBody + PullResponse types exported from src/lib/sync-payload.ts
  - PULL_SOFT_CAP = 500 constant consumed by route and future sync engine
affects:
  - Plan 43-05 (sync-topology.ts — pull route intentionally does NOT import it)
  - Plan 43-06 (engine loop — imports pullBodySchema, PullResponse, PULL_SOFT_CAP to drive pull cycle)
  - Phase 44 (status UI — will surface pull cursor progress via lastPulledAt)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pull route captures serverTime BEFORE any SELECT for cursor race safety (Pattern 7 / T-sync-07)"
    - "Soft-cap + 1 detection idiom: limit(CAP + 1) then slice(0, CAP) with hasMore = rows.length > CAP"
    - "Tombstones (deletedAt != null) flow through pull untouched — client applies as soft-deletes"
    - "Every Drizzle SELECT in auth-guarded routes carries eq(table.userId, auth.userId!) (T-sync-05)"
    - "zod/v4 partialRecord used for cursor map (plain z.record with enum key is exhaustive)"
    - "Route test strategy: mock @/lib/auth-middleware + @/lib/drizzle at module boundary, dynamic import AFTER mocks"

key-files:
  created:
    - src/app/api/sync/pull/route.ts
  modified:
    - src/lib/sync-payload.ts (added pullBodySchema + PullBody + PullResponse + PULL_SOFT_CAP)
    - src/__tests__/sync-pull-route.test.ts (replaced Plan 01 stub; 6 real tests)

key-decisions:
  - "Iterate Object.keys(schemaByTableName) directly instead of importing TABLE_PUSH_ORDER from Plan 05 — pull order has no correctness dependency (unlike push) and this decouples Plan 04 from Plan 05's parallel wave-2 work"
  - "Use zod/v4 z.partialRecord(tableNameSchema, ...) for cursor map — plain z.record with an enum key treats the enum as exhaustive and would reject the common case of a client tracking only a subset of tables"
  - "Capture serverTime as Date.now() BEFORE the per-table loop (not per-table) so every response carries a single coherent anchor the client can clamp to"
  - "Return generic 500 messages with [sync/pull] log prefix; never log the request body (PHI discipline from push route)"

patterns-established:
  - "Pattern: pull response shape is { result: Record<TableName, {rows, hasMore}>, serverTime } — Plan 06 engine loop decodes via PullResponse type"
  - "Pattern: test assertion for user_id scoping walks drizzle SQL AST (column .name + parameter .value) with a visited-set guard to avoid circular PgTable→PgColumn refs"

requirements-completed: [SYNC-03]

# Metrics
duration: ~35min
completed: 2026-04-17
---

# Phase 43 Plan 04: POST /api/sync/pull Route Summary

**Cursor-paginated per-table pull endpoint returning tombstone-inclusive changes since client cursors, soft-capped at 500 rows/table with a serverTime anchor for race-safe cursor advancement.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-17T18:36:50Z
- **Completed:** 2026-04-17T18:40:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- POST /api/sync/pull ships behind withAuth; every WHERE clause scopes by eq(table.userId, auth.userId!)
- pullBodySchema + PullBody + PullResponse type added alongside push exports for single-file audit
- PULL_SOFT_CAP = 500 detection idiom (LIMIT cap+1, slice cap, flag hasMore) implemented and tested
- serverTime captured BEFORE any SELECT so client can clamp cursor to serverTime - 30s (Pattern 7)
- Tombstones (deletedAt != null) flow through pull unfiltered; client-side soft-delete apply
- 6 unit tests passing (user_id scope, ASC order, soft-cap+hasMore, tombstones, serverTime, 401 via withAuth)
- 7/7 push route regression tests green — no cross-plan regression
- pnpm tsc --noEmit: 0 errors

## Task Commits

1. **Task 1: Extend sync-payload.ts with pullBodySchema + PullResponse** — `2fb8082` (feat)
2. **Task 2 RED: Failing sync-pull-route.test.ts with 6 real assertions** — `4d4bad2` (test)
3. **Task 2 GREEN: Implement POST /api/sync/pull + partialRecord fix** — `53af0a8` (feat)

_TDD RED/GREEN gates visible in git log: test commit precedes feat commit._

## Files Created/Modified
- `src/app/api/sync/pull/route.ts` (NEW) — withAuth-guarded POST handler; per-table cursor-paginated SELECT with LWW-friendly tombstone passthrough and serverTime anchor
- `src/lib/sync-payload.ts` (MOD) — appended pull-side exports: PULL_SOFT_CAP constant, tableNameSchema enum, pullBodySchema (partialRecord), PullBody, PullResponse; no changes to existing push exports
- `src/__tests__/sync-pull-route.test.ts` (REPLACED) — removed Plan 01 MISSING stub + 6 it.todo; added 6 real tests matching validation row names verbatim; mocks @/lib/auth-middleware and @/lib/drizzle

## Decisions Made

1. **Skip sync-topology.ts dependency for pull iteration.** Plan 04 depends only on Plans 01 and 03. Plan 05 (Wave 2 parallel) owns sync-topology.ts with TABLE_PUSH_ORDER. Since pull order has no correctness dependency — the client re-calls pull until every table reports hasMore: false, and reads tolerate arriving in any order — the route iterates Object.keys(schemaByTableName) directly. This keeps Plan 04 independent of Plan 05's wave work. Decision documented as a comment in route.ts citing D-08.

2. **zod/v4 partialRecord over z.record for cursor map.** Initial implementation used z.record(tableNameSchema, z.number().int().min(0)), which in zod/v4 treats the enum key as exhaustive — safeParse({ cursors: {} }) fails with "expected number, received undefined" on every enum member. D-07 allows missing cursors (default to 0 server-side), so switched to z.partialRecord. Unknown keys still fail with invalid_key (T-43-04-05 cursor injection still mitigated). Negative/non-integer cursors still fail with min(0) / int().

3. **Drizzle AST walker in test instead of JSON.stringify.** Initial user_id assertion stringified the where-condition object, which blew up on drizzle's circular PgTable→PgColumn → column.table back-reference. Replaced with a recursive collector that walks queryChunks and column `.name` / parameter `.value` leaves with a WeakSet visited guard. Reusable pattern for future where-clause assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Switched cursor map schema from z.record to z.partialRecord**
- **Found during:** Task 2 (GREEN — initial tests all failed with 400)
- **Issue:** zod/v4's z.record(enumSchema, valueSchema) requires every enum member to be present in the input. The plan's behavior spec explicitly requires `pullBodySchema.safeParse({ cursors: {} })` to succeed, and D-07 says "missing cursor keys default to 0 (full pull)". Plain z.record made every test fail at the 400 boundary.
- **Fix:** Replaced `z.record(tableNameSchema, z.number().int().min(0))` with `z.partialRecord(tableNameSchema, z.number().int().min(0))`. All six required behaviors (empty cursors, subset cursors, unknown-key rejection, negative-value rejection) verified. Doc comment added citing D-07.
- **Files modified:** src/lib/sync-payload.ts
- **Verification:** All 6 pull tests pass; standalone zod/v4 probe confirmed partialRecord semantics match D-07.
- **Committed in:** 53af0a8 (Task 2 GREEN commit — bundled with route implementation since the schema change unblocked the whole test suite).

**2. [Rule 3 - Blocking] Replaced JSON.stringify-based user_id assertion with AST walker**
- **Found during:** Task 2 (GREEN — after partialRecord fix, 5 of 6 tests green; user_id scope test threw "Converting circular structure to JSON")
- **Issue:** Drizzle's `and(eq(table.userId, ...), eq(table.updatedAt, ...))` AST contains circular back-references from each PgColumn to its owning PgTable and back. JSON.stringify's default behavior aborts on circular refs; the custom replacer didn't fully guard (the `columns`-in-object check was true for the column object too, not just the table).
- **Fix:** Replaced with a recursive `collect()` function that walks `queryChunks` and collects `name` (column) + `value` (parameter) leaves into a Set, using a WeakSet visited guard and explicit skip of any object that has both `columns` and `schema` keys (the PgTable heuristic). Assertion then checks the token set contains both "user_id" and "user-test".
- **Files modified:** src/__tests__/sync-pull-route.test.ts
- **Verification:** Test now passes reliably; pattern portable to future where-clause assertions in push tests if needed.
- **Committed in:** 53af0a8 (Task 2 GREEN commit).

---

**Total deviations:** 2 auto-fixed (1 bug in zod schema choice, 1 blocking issue in test serialization strategy)
**Impact on plan:** Both fixes necessary for the plan's own acceptance criteria to pass. No scope creep. No changes to the route's external contract — just a zod-dialect adjustment and a test-side assertion refactor.

## Issues Encountered

- Parallel executor worktree reset at startup moved HEAD from 81eaf78 to dc9427f as required by `<worktree_branch_check>`. No work lost — only the starting position was normalised for the plan base.
- Plan 05's sync-topology.ts stub test exists in the repo but sync-topology.ts hasn't shipped yet; full tsc initially surfaced TS2307 on that test file. Unrelated to Plan 04 (pre-existing from Wave 1 infra) and resolved itself once Plan 05's commits landed before I reached the final tsc check. No action taken — out of scope (scope boundary rule).

## User Setup Required

None — POST /api/sync/pull runs entirely against the existing Neon Postgres database + Neon Auth session. No new env vars, no external service config.

## Next Phase Readiness

**For Plan 06 (sync-engine core loop):**
- Import signature ready: `import { pullBodySchema, type PullResponse, PULL_SOFT_CAP } from "@/lib/sync-payload"`.
- Pull endpoint at `POST /api/sync/pull`, body `{ cursors: Record<TableName, number> }`, returns `{ result: Record<TableName, {rows, hasMore}>, serverTime }`.
- Engine must clamp next cursor to `min(maxRowUpdatedAt, serverTime - 30_000)` for T-sync-07 compliance (Plan 06 responsibility).
- Engine must re-call pull until every entry has `hasMore: false` for complete page (D-08).

**For Plan 05 (sync-topology.ts):** Pull route deliberately does NOT consume TABLE_PUSH_ORDER. Plan 05's export is only required by the push engine + E2E tests, not the pull route.

**For Phase 44 (status UI):** `lastPulledAt` can be sourced from the client engine after each successful pull; the server only provides `serverTime` as a race anchor, not as a status timestamp.

## TDD Gate Compliance

- RED gate: `4d4bad2` test(43-04): add failing tests for POST /api/sync/pull — 6 failing assertions, zero stub markers left.
- GREEN gate: `53af0a8` feat(43-04): implement POST /api/sync/pull route — 6/6 passing; 7/7 push regression passing.
- REFACTOR gate: not needed — the partialRecord fix and AST walker fix both landed inside the GREEN commit as Rule 1/3 auto-fixes while tests were still driving toward green, not as post-green cleanups.

## Self-Check: PASSED

Files:
- FOUND: src/app/api/sync/pull/route.ts
- FOUND: src/lib/sync-payload.ts (pullBodySchema + PULL_SOFT_CAP + PullResponse)
- FOUND: src/__tests__/sync-pull-route.test.ts (6 real tests, 0 todo, 0 MISSING)

Commits:
- FOUND: 2fb8082 feat(43-04): add pullBodySchema and PullResponse to sync-payload
- FOUND: 4d4bad2 test(43-04): add failing tests for POST /api/sync/pull
- FOUND: 53af0a8 feat(43-04): implement POST /api/sync/pull route

Acceptance criteria:
- PASS: grep "export const pullBodySchema" sync-payload.ts → 1 match
- PASS: grep "PULL_SOFT_CAP = 500" sync-payload.ts → 1 match
- PASS: grep "export type PullResponse" sync-payload.ts → 1 match
- PASS: grep "export const pushBodySchema" sync-payload.ts → 1 match (no push-side regression)
- PASS: grep "pullBodySchema.safeParse" pull/route.ts → 1 match
- PASS: grep "serverTime = Date.now()" pull/route.ts → 2 matches (code + doc comment)
- PASS: grep "auth.userId!" pull/route.ts → 2 matches
- PASS: grep "console.log" pull/route.ts → 0 matches (correct — log only via console.error prefix)
- PASS: grep "limit(PULL_SOFT_CAP + 1)" pull/route.ts → 2 matches (code + doc comment)
- PASS: withAuth wraps POST export
- PASS: 6 real it() blocks with exact validation names; 0 todo; 0 MISSING
- PASS: pnpm vitest run src/__tests__/sync-pull-route.test.ts → 6 passed
- PASS: pnpm vitest run src/__tests__/sync-push-route.test.ts → 7 passed (regression)
- PASS: pnpm tsc --noEmit → 0 errors

---
*Phase: 43-sync-engine-core*
*Completed: 2026-04-17*
