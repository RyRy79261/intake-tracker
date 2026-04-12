# Phase 42: Postgres Schema + Drizzle Setup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 42-Postgres Schema + Drizzle Setup
**Areas discussed:** Schema shape & types, User ownership & FK model, Parity validation (CI), Migration & cleanup flow

---

## Schema Shape & Types

### File layout

| Option | Description | Selected |
|--------|-------------|----------|
| Single src/db/schema.ts | All 16 Dexie + 4 push tables in one file. Matches STACK.md directive. ~500 lines is manageable. | ✓ |
| Split per domain | src/db/schema/{health,medication,push,system}.ts with barrel index. | |
| Split Dexie-mirror vs infra | user-data.ts (16 tables) + push.ts (4 tables) to separate parity-target from infra. | |

**User's choice:** Single src/db/schema.ts

### Timestamp mapping

| Option | Description | Selected |
|--------|-------------|----------|
| BIGINT | Raw unix ms, zero conversion between Dexie and Postgres. | ✓ |
| TIMESTAMPTZ | Native Postgres datetime; sync engine must convert every row. | |
| Both (BIGINT + generated TIMESTAMPTZ) | BIGINT for sync truth, generated TIMESTAMPTZ for ad-hoc queries. | |

**User's choice:** BIGINT

### IDs and arrays

| Option | Description | Selected |
|--------|-------------|----------|
| TEXT ids + native Postgres arrays | id TEXT PK (crypto.randomUUID strings), text[]/integer[] matches Dexie shape. | ✓ |
| UUID ids + JSONB arrays | Requires parsing Dexie strings to UUID; JSONB for flexible arrays. | |
| TEXT ids + JSONB arrays | Pragmatic text ids, JSONB arrays for future nested structures. | |

**User's choice:** TEXT ids + native Postgres arrays

### Enum-like union types

| Option | Description | Selected |
|--------|-------------|----------|
| TEXT with CHECK constraint | Easy to evolve; just edit the check. Matches TS union expansion. | ✓ |
| Postgres native enums (pgEnum) | Type-safe but ALTER TYPE to add values is painful. | |
| Plain TEXT, no constraint | Rely on Drizzle TS + Dexie types for validation. | |

**User's choice:** TEXT with CHECK constraint

---

## User Ownership & FK Model

### user_id placement

| Option | Description | Selected |
|--------|-------------|----------|
| Flat user_id TEXT column, id stays PK | Every table gets user_id TEXT NOT NULL + index. Simple mental model. | ✓ |
| Compound PK (user_id, id) | Guarantees tenant isolation at storage layer but Dexie only has id PK. | |
| Separate ownership table | record_ownership join. Over-engineered for single-user app. | |

**User's choice:** Flat user_id TEXT column, id stays PK

### FK cascade behavior

| Option | Description | Selected |
|--------|-------------|----------|
| FK with ON DELETE CASCADE | References neon_auth.users_sync(id); deleting user wipes data. | ✓ |
| FK with ON DELETE RESTRICT | Deleting a user is blocked if they have data. | |
| Loose TEXT, no FK | Decouples data tables from neon_auth internal table name. | |

**User's choice:** FK with ON DELETE CASCADE

### Cross-table (inner) FKs

| Option | Description | Selected |
|--------|-------------|----------|
| Real FKs, no cascade | Drizzle references() without cascade. Prevents orphans; sync engine deletes in dep order. | ✓ |
| Real FKs with ON DELETE CASCADE | Deleting prescription auto-deletes phases/schedules/inventory/dose logs. | |
| No FKs, relationships documented in code | Postgres tables stand alone; simpler sync but orphan risk. | |

**User's choice:** Real FKs, no cascade

---

## Parity Validation (CI)

### Parity test mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime field comparison test | Vitest imports Dexie interfaces + Drizzle tables, compares field names + types. | ✓ |
| drizzle-zod vs Dexie zod schemas | Generate Zod from Drizzle; maintain Zod for Dexie; assert structural equality. | |
| JSON snapshot comparison | Emit both schemas to JSON, snapshot-compare. | |
| TypeScript-level assertion | expect-type / tsd to assert $inferSelect matches Dexie interface at compile time. | |

**User's choice:** Runtime field comparison test

### Field scope

| Option | Description | Selected |
|--------|-------------|----------|
| All fields match, user_id exempt | Every field name + basic type must match; user_id is the only allowed drift. | ✓ |
| Only primary data fields | Allow sync scaffolding fields (createdAt/updatedAt/etc.) to differ per side. | |
| Structural equality, no exemptions | Drizzle must shadow user_id in Dexie interface via adapter type. | |

**User's choice:** All fields match, user_id exempt

### Test location & gate

| Option | Description | Selected |
|--------|-------------|----------|
| src/__tests__/schema-parity.test.ts + pnpm test | Matches existing bundle-security.test.ts pattern; runs in CI. | ✓ |
| Dedicated scripts/check-schema-parity.ts + CI-only | Standalone script skipped locally. | |
| Both local test + CI step | Redundant belt-and-braces. | |

**User's choice:** src/__tests__/schema-parity.test.ts + pnpm test

---

## Migration & Cleanup Flow

### drizzle-kit workflow

| Option | Description | Selected |
|--------|-------------|----------|
| generate + migrate (versioned SQL) | Timestamped SQL files in /drizzle/, reproducible, git-reviewable. | ✓ |
| push (schema sync, no history) | Diffs schema.ts against DB; faster but no migration history. | |
| Both — push in dev, generate for commits | Most flexible; requires discipline. | |

**User's choice:** generate + migrate (versioned SQL)

### DB cleanup mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| scripts/reset-neon-db.ts + drizzle-kit migrate | Custom drop script preserving neon_auth.*, then apply migrations. | ✓ |
| drizzle-kit drop + migrate | Built-in drop then re-migrate; less control. | |
| Manual psql DROP SCHEMA then migrate | One-time manual; not repeatable. | |

**User's choice:** Script that drops all app tables, then drizzle-kit migrate

### Existing push-migration.sql reconciliation

| Option | Description | Selected |
|--------|-------------|----------|
| Redefine in Drizzle, rename push_dose_schedules→push_schedules, delete old SQL | All 4 push tables move into schema.ts under final P41 names; delete scripts/push-migration.sql. | ✓ |
| Keep existing names, redefine in Drizzle | Preserve push_dose_schedules naming; skip data migration. | |
| Drizzle schema + keep scripts/push-migration.sql as legacy | Don't delete old SQL; risk of confusion. | |

**User's choice:** Redefine in Drizzle, rename push_dose_schedules→push_schedules, delete old SQL

### CI migrate & verify

| Option | Description | Selected |
|--------|-------------|----------|
| Neon test branch + drizzle-kit migrate in CI workflow | Ephemeral branch per CI run; same pattern as P41 E2E. | ✓ |
| Dedicated long-lived staging branch | Faster but tests collide; contradicts P41 isolation pattern. | |
| Only run migrate locally; CI validates schema.ts syntax | Lightweight; misses migration errors until deploy. | |

**User's choice:** Neon test branch + drizzle-kit migrate in CI workflow

---

## Claude's Discretion

- Exact per-column indexes beyond (user_id, updatedAt)
- Dexie camelCase → Drizzle snake_case column naming mechanics
- Exact drop-ordering inside reset-neon-db.ts
- Whether to generate a migration_history audit row
- Exact CI workflow YAML structure (matches P41 pattern)
- Partial index on deleted_at for "active rows only" queries
- Whether drizzle-kit studio is added as a dev script
- Parity test's type-extraction mechanism (ts-morph walk vs expect-type compile-time)

## Deferred Ideas

- drizzle-zod runtime schemas → Phase 43
- push-db.ts conversion to Drizzle → Phase 43+
- Sync metadata shape (dirty batches, cursors) → Phase 43
- Per-field timestamp merge → Future (post-v2.0)
- IndexedDB → Postgres data upload → Phase 45
- CRDT sync → explicitly out of scope
- Cloud-backed Zustand user_settings → SYNC-F04 future
- Postgres ENUM migration path if text+CHECK gets painful → future
