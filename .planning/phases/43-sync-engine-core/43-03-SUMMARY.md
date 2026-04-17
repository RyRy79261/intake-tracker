---
phase: 43-sync-engine-core
plan: 03
subsystem: api
tags: [sync, lww, drizzle-zod, neon-auth, api-security, postgres]

# Dependency graph
requires:
  - phase: 41-neon-auth-privy-removal
    provides: withAuth HOF + Neon Auth cookie session pattern
  - phase: 42-postgres-schema-drizzle-setup
    provides: src/db/schema.ts (Drizzle source of truth) and drizzle-zod dependency
provides:
  - drizzle-zod discriminated union pushBodySchema covering all 16 data tables
  - schemaByTableName lookup for downstream pull route (Plan 04) and engine (Plan 06)
  - POST /api/sync/push with record-level LWW merge (clamp + deletedAt-wins + strict-> tie rule)
  - src/lib/drizzle.ts lazy-init Neon HTTP client singleton (first runtime Drizzle client in the codebase)
  - Server-authoritative ack payload shape: { accepted: [{queueId, serverUpdatedAt}, ...] }
affects:
  - 43-04 pull route (reuses schemaByTableName)
  - 43-06 sync engine (reuses PushBody / PushOp client types)
  - 43-07 pilot intake-service wiring (engine depends on this route's contract)
  - 43-08 E2E tests (hit this route against a Neon branch)
  - Phase 44 sync service integration (every service pushes via this handler)

# Tech tracking
tech-stack:
  added:
    - "drizzle-zod v0.8.3 — first runtime use; createInsertSchema + .omit({userId:true})"
    - "zod/v4 import subpath — required so drizzle-zod v0.8 emitted types compile"
    - "drizzle-orm/neon-http — first runtime Drizzle client in codebase (src/lib/drizzle.ts)"
  patterns:
    - "Discriminated union on tableName for heterogeneous batch API validation"
    - "Lazy-init Drizzle Proxy singleton (matches getSQL() side-effect-free pattern from push-db.ts)"
    - "Server-authoritative ack: every op gets a {queueId, serverUpdatedAt} entry regardless of write/skip"
    - "LWW clamp-before-compare: Math.min(client.updatedAt, serverNow + 60_000) before strict-> compare"
    - "deletedAt-wins-tie: non-null server deletedAt + null incoming -> skip + ack server ts (resurrection-proof)"

key-files:
  created:
    - src/lib/sync-payload.ts
    - src/app/api/sync/push/route.ts
    - src/lib/drizzle.ts
  modified:
    - src/__tests__/sync-push-route.test.ts (replaced Wave-0 stub with 7 passing tests)

key-decisions:
  - "Import z from 'zod/v4' to match drizzle-zod v0.8 emitted ZodObject types (zod 3.25 ships v4 API under /v4 subpath)"
  - "Create src/lib/drizzle.ts now (Rule 3 blocking) — no prior runtime Drizzle client existed; lazy Proxy singleton keeps imports test-safe"
  - "Cast drizzleDb to any at the .insert() call — TS intersects 16 table insert-types into a super-type; runtime is safe because drizzle-zod already validated row shape per table"
  - "Strip op.row.userId before spread even though drizzle-zod .omit({userId:true}) drops it at parse — belt-and-suspenders prevents future regression if schema is relaxed"

patterns-established:
  - "Sync API route structure: withAuth + safeParse + for-op loop + ack array return"
  - "Security pattern: every SELECT/INSERT scoped by eq(table.userId, auth.userId!); op.row.userId never read"
  - "Server-clock-authoritative timestamps: all writes use clampedUpdatedAt, ack returns what was actually written"

requirements-completed:
  - SYNC-02
  - SYNC-04

# Metrics
duration: ~22min
completed: 2026-04-17
---

# Phase 43 Plan 03: Push Route with LWW Merge Summary

**POST /api/sync/push with Neon Auth session gating, drizzle-zod discriminated-union validation, 60s clock-skew clamp, strict-> LWW (server wins tie), deletedAt-wins-tie, and server-authoritative ack per queueId.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-04-17T16:11:00Z (approx — start of agent run)
- **Completed:** 2026-04-17T16:32:56Z
- **Tasks:** 2 (Task 1 atomic; Task 2 TDD RED → GREEN)
- **Files created:** 3 (sync-payload.ts, drizzle.ts, push/route.ts)
- **Files modified:** 1 (sync-push-route.test.ts)

## Accomplishments

- `src/lib/sync-payload.ts` — drizzle-zod discriminated union keyed by `tableName` covering all 16 data tables; every per-table row schema uses `createInsertSchema(...).omit({userId: true})`; ops array capped at `.max(500)`; exports `pushBodySchema`, `PushOp`, `PushBody`, `TableName`, `schemaByTableName`.
- `src/app/api/sync/push/route.ts` — `withAuth`-wrapped POST handler implementing D-12 LWW precedence (deletedAt-wins → strict-> → server-wins-tie), Pattern 9 clock-skew clamp (MAX_FUTURE_MS=60_000), and server-authoritative ack. Every DB operation user-scoped via `auth.userId!`. Zero `console.log`, zero `op.row.userId` references.
- `src/lib/drizzle.ts` — first runtime Drizzle client in the codebase; lazy Proxy singleton over `drizzle-orm/neon-http` + `@neondatabase/serverless`. Side-effect-free import makes test mocking trivial.
- `src/__tests__/sync-push-route.test.ts` — 7 passing tests replacing the Wave-0 MISSING stub: LWW, server-wins-tie, deletedAt-wins, clamp future, rejects-client-forged-userId, rejects-oversized-batch (501), returns-accepted-array.

## Task Commits

1. **Task 1: drizzle-zod discriminated union for push body** — `1f77dfd` (feat)
2. **Task 2 RED: populate sync-push-route tests** — `59ad444` (test)
3. **Task 2 GREEN: POST /api/sync/push with LWW merge + lazy Drizzle client** — `0709c9d` (feat)

_TDD gate sequence verified:_ Task 2 has test(...) commit (`59ad444`) followed by feat(...) commit (`0709c9d`). No refactor needed — code landed clean on first GREEN.

## Files Created/Modified

- `src/lib/sync-payload.ts` (NEW, 222 lines) — drizzle-zod discriminated union; 16 per-table row schemas with `.omit({userId: true})`; `pushBodySchema` with `z.array().max(500)` DoS cap; `schemaByTableName` lookup for push/pull routes.
- `src/app/api/sync/push/route.ts` (NEW, ~135 lines) — POST handler with withAuth + LWW merge. MAX_FUTURE_MS=60_000 clamp. User-scoped Drizzle queries. PHI-safe logging (`[sync/push]` prefix, error object only).
- `src/lib/drizzle.ts` (NEW, ~50 lines) — lazy-init Drizzle Neon HTTP client via Proxy wrapper. First runtime Drizzle client in the repo.
- `src/__tests__/sync-push-route.test.ts` (MODIFIED, Wave-0 stub → 346 lines) — 7 unit tests with mocked `@/lib/auth-middleware` (pass-through + fixed userId) and `@/lib/drizzle` (controllable existingRows stub + captured insertCalls).

## Decisions Made

- **zod/v4 import subpath** — drizzle-zod v0.8.3 emits types from `zod/v4`. The installed zod 3.25 ships the v4 API under the `/v4` subpath, so `import { z } from "zod/v4"` resolves the `ZodObject` type mismatch that blocked the discriminated union from type-checking. Documented inline in sync-payload.ts.
- **Create src/lib/drizzle.ts now (Rule 3 blocking)** — Plan told me to "grep for existing drizzle client"; none existed. Created a lazy Proxy singleton that delays `neon(DATABASE_URL)` construction until first property access, matching the `getSQL()` pattern in push-db.ts. Keeps module-load side-effect-free for test mocking.
- **Type-cast `drizzleDb` to `any` at the `.insert()` call** — TypeScript intersects the 16 possible table insert-types from `schemaByTableName` into a super-type requiring every table's required fields. Runtime is safe because `pushBodySchema` already validated the row against the exact per-table schema before this branch runs. Narrow escape hatch, limited to one line with explanatory comment.
- **Defensive `delete rowWithoutUserId.userId` before spread** — `drizzle-zod.omit({userId: true})` already drops it at parse time, but stripping again at write time guards against a future regression where the schema is relaxed. Paired with an `expect(insertCalls[0].values.userId).not.toBe("attacker")` test assertion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created missing Drizzle client helper**
- **Found during:** Task 2 (route implementation — needed `drizzleDb`)
- **Issue:** The plan said to "find the drizzle client helper, typically src/lib/drizzle.ts" but grep confirmed no such file existed. The route cannot function without a Drizzle client.
- **Fix:** Created `src/lib/drizzle.ts` as a lazy Proxy singleton over `drizzle-orm/neon-http`. Pattern matches the existing `getSQL()` lazy-init shape from `src/lib/push-db.ts` (flagged by 43-PATTERNS.md as the correct template).
- **Files modified:** src/lib/drizzle.ts (new)
- **Verification:** All 7 unit tests pass with `vi.mock("@/lib/drizzle")`; TypeScript builds clean.
- **Committed in:** 0709c9d (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Switched to `zod/v4` import subpath**
- **Found during:** Task 1 (sync-payload.ts TS errors)
- **Issue:** drizzle-zod v0.8.3 emits types referencing `zod/v4`'s `ZodObject`. Using plain `import { z } from "zod"` caused 16 TS2740 errors per discriminated union option ("Type 'ZodObject' is missing properties _type, _parse, ...").
- **Fix:** Changed import to `import { z } from "zod/v4"`. Installed zod 3.25.76 exposes the v4 API under the `/v4` subpath for forward compatibility, so the discriminated union now type-matches drizzle-zod output.
- **Files modified:** src/lib/sync-payload.ts
- **Verification:** `pnpm tsc --noEmit` clean; runtime sanity-check with 500 valid ops passes, 501 returns `{code:'too_big', maximum:500}`.
- **Committed in:** 1f77dfd (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 Blocking)
**Impact on plan:** Both fixes necessary for the plan to execute as specified. No scope creep — every change is in service of the plan's stated deliverables. Auth-middleware pattern, threat model, LWW precedence, ack shape, and all 7 acceptance criteria tests land exactly as specified in 43-03-PLAN.md.

## Issues Encountered

- **TS2769 `No overload matches this call` on `drizzleDb.insert(table).values(...)`** — The `table` variable is a union of all 16 Drizzle tables. TypeScript intersects their insert-shape overloads into a super-type requiring every table's required fields. Runtime is fine because only one branch of the union applies per op, and the row shape was already validated by pushBodySchema. Resolved with a narrowly-scoped `as any` cast + explanatory inline comment. Documented under Decisions.
- **E2E / real-Neon integration not covered here** — By design. 43-03-PLAN.md scope is the handler + unit tests with mocked DB. Plan 08 runs the full push cycle against a real Neon branch.

## Verification Evidence

```
$ pnpm vitest run src/__tests__/sync-push-route.test.ts
 ✓ src/__tests__/sync-push-route.test.ts (7 tests) 425ms

 Test Files  1 passed (1)
      Tests  7 passed (7)

$ pnpm tsc --noEmit 2>&1 | grep "error TS" | wc -l
0

$ grep -c "auth.userId!" src/app/api/sync/push/route.ts
4   # ≥3 required

$ grep -c "op.row.userId" src/app/api/sync/push/route.ts
0   # == 0 required

$ grep -c "console.log" src/app/api/sync/push/route.ts
0   # == 0 required (PHI avoidance)

$ grep "MAX_FUTURE_MS = 60" src/app/api/sync/push/route.ts
const MAX_FUTURE_MS = 60_000;

$ grep -c "createInsertSchema" src/lib/sync-payload.ts
19  # ≥14 required (16 data tables + 3 doc-comment mentions)

$ grep -c "z.literal(" src/lib/sync-payload.ts
16  # == 16 required (one per data table)

$ grep -c "it(\"" src/__tests__/sync-push-route.test.ts
7   # == 7 required

$ grep -c "it.todo" src/__tests__/sync-push-route.test.ts
0   # == 0 required
```

All acceptance criteria green. All 8 threat-register mitigations (T-43-03-01 through -08) enforced by tests and/or grep gates.

## Self-Check: PASSED

**Files exist:**
- FOUND: src/lib/sync-payload.ts
- FOUND: src/app/api/sync/push/route.ts
- FOUND: src/lib/drizzle.ts
- FOUND: src/__tests__/sync-push-route.test.ts (modified from Wave-0 stub)

**Commits exist:**
- FOUND: 1f77dfd (Task 1 — sync-payload.ts)
- FOUND: 59ad444 (Task 2 RED — tests)
- FOUND: 0709c9d (Task 2 GREEN — route + drizzle client)

## User Setup Required

None — no external service configuration required. The route uses `DATABASE_URL` which is already set from Phase 42.

## Next Phase Readiness

- **43-04 (pull route):** `schemaByTableName` and the `src/lib/drizzle.ts` lazy client are ready to import. Plan 04 can reuse the discriminated-union pattern for its `pullBodySchema` (cursors map).
- **43-06 (sync engine):** `PushBody` / `PushOp` types are exported and ready to import on the client. The engine's push path builds request payloads against these types and consumes the `{ accepted: [{queueId, serverUpdatedAt}] }` ack shape.
- **43-08 (E2E):** Real push cycle against a Neon branch. This plan's unit tests mock the DB; the handler is ready to hit real Postgres now.
- **Phase 44 (service integration):** Every service will push via this handler. The LWW rules, clamp, and ack shape are locked.

## Threat Flags

None. All security surface introduced by this plan (push route body, user_id scoping, LWW merge, clock-skew clamp) is already enumerated in the plan's `<threat_model>` register (T-43-03-01 through T-43-03-08) with mitigations enforced by tests and grep gates.

---
*Phase: 43-sync-engine-core*
*Completed: 2026-04-17*
