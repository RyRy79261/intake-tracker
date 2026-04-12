# Phase 42: Postgres Schema + Drizzle Setup - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Mirror all 16 Dexie tables (plus 4 push tables owned by Phase 41) to Postgres via Drizzle ORM schema-as-code. Every data row gets a `user_id` foreign key referencing `neon_auth.users_sync(id)` with cascade delete. Wipe the existing Neon test database, apply the fresh Drizzle schema via versioned SQL migrations, and gate CI on a runtime parity test that detects Dexie ↔ Drizzle field drift.

Phase 42 delivers the Postgres schema and migration pipeline **only** — no sync engine, no service integration, no data movement from IndexedDB. Phase 43 owns bidirectional sync; Phase 45 owns data migration.

</domain>

<decisions>
## Implementation Decisions

### Schema Shape & Types
- **D-01:** Single `src/db/schema.ts` file holds all 20 table definitions (16 Dexie-mirrored + 4 push). Matches STACK.md §"Database ORM: Drizzle ORM" directive and keeps the parity-test target contiguous.
- **D-02:** Unix-ms numeric timestamps map to Postgres `bigint` columns — zero conversion between Dexie and Postgres, sync engine passes values through unchanged. Client-side queries remain the norm; ad-hoc Postgres datetime querying is not a requirement.
- **D-03:** Id columns are `text NOT NULL PRIMARY KEY` (Dexie already stores `crypto.randomUUID()` strings). Array fields (`Prescription.contraindications/warnings` → `text[]`, `PhaseSchedule.daysOfWeek` → `integer[]`) use Postgres native array types — no JSON parsing overhead during sync.
- **D-04:** Dexie union types (`PhaseType`, `DoseStatus`, `TitrationPlanStatus`, `IntakeRecord.type`, etc.) are stored as `text` with `CHECK (col IN (...))` constraints. Easier to evolve than `pgEnum` — adding a new union member is a single ALTER TABLE rather than an `ALTER TYPE`.
- **D-05:** All 16 tables carry the existing Dexie sync scaffolding: `createdAt bigint`, `updatedAt bigint`, `deletedAt bigint` (nullable), `deviceId text`, `timezone text` (where Dexie has it — not `prescriptions`/`medicationPhases`/`phaseSchedules`/`doseLogs` which omit it, or `titrationPlans` which omits it). Parity test enforces per-table presence.

### User Ownership & FK Model
- **D-06:** Every data table gets a flat `user_id text NOT NULL` column. `id` remains the primary key — no compound `(user_id, id)` PK. Indexed as `(user_id, updatedAt)` for sync pull queries.
- **D-07:** `user_id` references `neon_auth.users_sync(id) ON DELETE CASCADE`. Deleting a Neon Auth user wipes all their rows across all 20 tables automatically. Matches the single-user-app mental model.
- **D-08:** Cross-table relationships inside the Dexie domain (e.g. `medication_phases.prescription_id → prescriptions.id`, `phase_schedules.phase_id → medication_phases.id`, `inventory_transactions.inventory_item_id → inventory_items.id`, `dose_logs.prescription_id/phase_id/schedule_id`, `substance_records.source_record_id → intake_records.id`) are defined as real Drizzle `references()` FKs **without** cascade. Prevents orphans; sync engine must push in dependency order (Phase 43 concern).
- **D-09:** Every inner FK is scoped by `user_id` in queries but Postgres does not enforce `(user_id, id)` composite uniqueness — the `id` PK is globally unique (UUIDs), so cross-user collisions are structurally impossible.

### Parity Validation (CI)
- **D-10:** CI parity test at `src/__tests__/schema-parity.test.ts` (runtime Vitest, same location as `bundle-security.test.ts`). Runs as part of `pnpm test` — no separate CI step, no separate script. Drift causes a normal test failure with diff output.
- **D-11:** Test imports Dexie TS interfaces from `src/lib/db.ts` and Drizzle table objects from `src/db/schema.ts`. For each Dexie table, it compares field names and basic type shapes against the corresponding Drizzle `$inferSelect` type. Union types (Dexie) vs `text` + CHECK (Drizzle) are considered equivalent by the comparator.
- **D-12:** `user_id` is the only allowed drift — it exists on every Drizzle table but has no counterpart in Dexie interfaces (Dexie IDB is implicitly single-user). Test's exemption list is exactly `["user_id"]` and fails if any other field differs.
- **D-13:** Dexie interface → field list extraction uses a TypeScript utility approach (not runtime introspection — Dexie `.schema` only knows indexes, not full field sets). Claude's discretion on exact mechanism: either a ts-morph walk of `src/lib/db.ts`, or a compile-time type test via `expect-type` that forces the runtime test to stay in sync.

### Migration & Cleanup Flow
- **D-14:** `drizzle-kit generate + drizzle-kit migrate` (versioned SQL under `/drizzle/`). Migrations are committed, reviewable, and reproducible. `drizzle-kit push` is NOT used in this project.
- **D-15:** `scripts/reset-neon-db.ts` idempotently drops every app table (all 16 Dexie-mirrored tables + the 4 push tables under both old and new names) while **preserving** the `neon_auth.*` schema. Run once before the first Drizzle migration, and usable again whenever the test branch needs a clean slate. Uses `@neondatabase/serverless` directly.
- **D-16:** All 4 push tables get redefined in `src/db/schema.ts` under their final P41-aligned names: `push_subscriptions`, `push_schedules` (was `push_dose_schedules`), `push_sent_log`, `push_settings`. `scripts/push-migration.sql` is **deleted** — Drizzle becomes the single source of truth. Phase 41 already truncates these tables as part of the Privy removal, so the rename happens on an empty dataset.
- **D-17:** CI workflow runs `drizzle-kit migrate` against an ephemeral Neon test branch per run (same Neon-branch-per-CI pattern as Phase 41 E2E, documented in `.planning/research/ARCHITECTURE.md`). Branch is created from main, migrations are applied, parity + integration tests run, branch is deleted at the end. No shared staging branch.
- **D-18:** `drizzle.config.ts` at project root. Schema path: `./src/db/schema.ts`. Out dir: `./drizzle/`. Driver: `neon-http` (matches existing `@neondatabase/serverless` usage). `DATABASE_URL` env var already exists.

### Integration with Phase 41 & Existing Code
- **D-19:** `src/lib/push-db.ts` is NOT rewritten in this phase — it stays on raw `@neondatabase/serverless` queries. Phase 42 only defines the Drizzle schema and migrations; converting `push-db.ts` to Drizzle queries is a Phase 43 or later concern. (Phase 41 already drops the authToken plumbing, so `push-db.ts` will be internally consistent.)
- **D-20:** `drizzle-zod` is installed (per STACK.md) but its use is limited to generating Zod validators for sync payloads in Phase 43 — Phase 42 does not emit runtime Zod schemas.
- **D-21:** No Dexie schema changes in this phase. `src/lib/db.ts` remains at version 15. The Drizzle schema snapshot targets v15 tables exactly.

### Claude's Discretion
- Exact per-column indexes beyond `(user_id, updatedAt)` — planner may add compound indexes mirroring the Dexie indexes that matter for sync queries (`[type+timestamp]`, etc.)
- Dexie → Drizzle column naming convention (camelCase in TS, snake_case in SQL — both supported via Drizzle's column builder)
- Exact drop-ordering in `reset-neon-db.ts` to respect inner FKs
- Whether to generate a `migration_history` audit row at the end of the first migration
- Exact CI workflow YAML structure (matches whatever shape Phase 41 ends up using)
- Whether `deleted_at` gets a partial index for "active rows only" queries
- Whether `drizzle-kit studio` is added as a dev script
- The parity test's exact type-extraction mechanism (ts-morph walk vs expect-type compile-time assertion)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Architecture
- `.planning/research/STACK.md` §"Database ORM: Drizzle ORM" — Drizzle 0.45.x + neon-http driver choice, why not Prisma/raw SQL, installation commands
- `.planning/research/STACK.md` §"Sync Engine" — context on how Phase 43 will use the schema, informs FK design
- `.planning/research/ARCHITECTURE.md` §"Neon branch lifecycle pattern" — CI test branch creation/teardown pattern (same as Phase 41 E2E)

### Requirements
- `.planning/REQUIREMENTS.md` §"NeonDB Schema" — SCHEMA-01 through SCHEMA-04 acceptance criteria
- `.planning/REQUIREMENTS.md` §"Out of Scope" — CRDT sync excluded (record-level LWW only), granular per-table sync controls excluded

### Roadmap
- `.planning/ROADMAP.md` §"Phase 42" — goal, dependencies (Phase 41), success criteria

### Prior Phase
- `.planning/phases/41-neon-auth-privy-removal/41-CONTEXT.md` §"Push Identity Migration" — D-10/D-11 (push tables truncated), D-12 (user_id stays as text)
- `.planning/phases/41-neon-auth-privy-removal/41-01-PLAN.md` — withAuth + getSession pattern that future Drizzle-backed routes will sit beside

### Existing Code (must be read before modifying)
- `src/lib/db.ts` — Dexie schema (version 15), all 16 table interfaces + index definitions. This is the ground truth the Drizzle schema must mirror.
- `src/lib/push-db.ts` — current raw-SQL push data access (untouched in P42)
- `scripts/push-migration.sql` — legacy hand-written push table definitions (deleted in P42)
- `src/__tests__/bundle-security.test.ts` — reference pattern for CI gate tests under `src/__tests__/`
- `package.json` — install target for `drizzle-orm`, `drizzle-kit`, `drizzle-zod`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@neondatabase/serverless@^1.0.2` — already installed; Drizzle's `neon-http` driver wraps it (zero new HTTP client dependency)
- `DATABASE_URL` env var — already set in `.env.local`, `vercel.json`, CI secrets
- `src/__tests__/bundle-security.test.ts` — template for a CI-gating Vitest test that reads source files and asserts structural properties
- `src/lib/push-db.ts` — demonstrates the current raw-SQL pattern; its query shapes inform what the schema must support

### Established Patterns
- Dexie records have a stable sync-scaffolding shape: `id` + `createdAt` + `updatedAt` + `deletedAt` + `deviceId` (+ `timezone` on most). This is the parity anchor.
- Soft-delete via nullable `deletedAt` timestamp (never hard-delete rows) — Drizzle schema must preserve this.
- String UUIDs generated via `crypto.randomUUID()` — no auto-increment / serial keys anywhere.
- Test files live under `src/__tests__/` or colocated; `bundle-security.test.ts` is the closest precedent for a schema-level gate.
- Scripts under `scripts/*.ts` run via `tsx` or `node --loader`; `push-migration.sql` was the only non-TS script — it gets deleted in this phase.

### Integration Points
- New: `src/db/schema.ts` — single source of truth for Postgres schema
- New: `drizzle.config.ts` at project root
- New: `/drizzle/` directory for generated SQL migrations
- New: `scripts/reset-neon-db.ts` for wiping the Neon DB before applying migrations
- New: `src/__tests__/schema-parity.test.ts` — Dexie ↔ Drizzle drift detector
- Modified: `package.json` (add drizzle-orm, drizzle-kit, drizzle-zod); potentially `pnpm test` script order
- Modified: `.github/workflows/*.yml` — CI job runs `drizzle-kit migrate` against ephemeral Neon branch
- Deleted: `scripts/push-migration.sql`
- Untouched: `src/lib/push-db.ts` (stays on raw SQL until Phase 43+)
- Untouched: `src/lib/db.ts` (Dexie stays at v15)

</code_context>

<specifics>
## Specific Ideas

- **Schema is read-heavy from one file.** All 20 tables fit comfortably in a single `src/db/schema.ts` — grep-friendly, one import everywhere, easy to eyeball field differences against Dexie.
- **BIGINT-not-TIMESTAMPTZ is a deliberate sync-engine simplification.** Phase 43 will serialize records as-is; no round-trip rounding or timezone conversion risk. Dexie stores ms numbers, Postgres stores ms numbers.
- **CASCADE on `user_id` FK is explicitly desired** for single-user account deletion — wiping the Neon Auth user row should wipe all their data without a separate cleanup job.
- **Inner FKs without cascade** force the sync engine to handle delete ordering explicitly (push deletes parent-first or use soft-delete). Trades some convenience for clarity.
- **Parity test treats Dexie union types and Drizzle `text + CHECK` as equivalent** — the comparator does NOT demand that Drizzle emit a TypeScript literal union matching Dexie's.
- **Push table rename (`push_dose_schedules` → `push_schedules`) is safe** because Phase 41's truncation happens first. No data migration needed — the old name is dropped by `reset-neon-db.ts` before the new name is created.
- **Migration versioning starts fresh** — this is the first Drizzle migration in the project. No pre-existing `drizzle_migrations` table to reconcile with.

</specifics>

<deferred>
## Deferred Ideas

### Phase 43 (Sync Engine Core)
- `drizzle-zod` runtime schemas for sync-payload validation
- Converting `src/lib/push-db.ts` from raw SQL to Drizzle query builder
- Defining the sync metadata shape (batched dirty records, cursor-based pulls)
- Per-field timestamp merge (STACK.md §"Custom sync module" notes this as a future upgrade)

### Phase 45 (Data Migration)
- IndexedDB → NeonDB data upload wizard
- Row count verification between Dexie and Postgres after migration
- Resumable migration cursors
- Mandatory backup-before-upload

### Future Enhancements (out of v2.0 scope)
- CRDT-based sync (excluded in REQUIREMENTS.md — record-level LWW is the ceiling)
- Server-side insights queries (INTEL-F01) running against NeonDB
- `user_settings` cloud-backed Zustand store (SYNC-F04)
- Postgres ENUMs if text-CHECK evolution becomes painful (migration path exists)

### Not in Scope for Phase 42
- Any actual data writes to Postgres — schema and migrations only
- Converting `push-db.ts` to Drizzle (Phase 43+)
- Dexie version bump — stays at v15
- Service-layer changes (Phase 44)

</deferred>

---

*Phase: 42-postgres-schema-drizzle-setup*
*Context gathered: 2026-04-12*
