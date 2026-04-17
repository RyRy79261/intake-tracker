---
status: resolved
phase: 42-postgres-schema-drizzle-setup
plan: 02
source: [42-02-PLAN.md Task 5]
started: 2026-04-17
updated: 2026-04-17
executed_by: orchestrator (authorized by user — prod still on local storage, Neon is dev-only)
---

## Operator UAT — 42-02 Task 5

All Task-5 verification steps were run end-to-end against the Neon dev branch
(`ep-square-boat-ag2ctrsl-pooler`, database `neondb`). `DATABASE_URL` was
sourced from `.env.local`.

### 1. `pnpm db:reset`

```
Resetting Neon public schema (22 tables)...
  DROP TABLE IF EXISTS inventory_transactions CASCADE
  DROP TABLE IF EXISTS dose_logs CASCADE
  DROP TABLE IF EXISTS daily_notes CASCADE
  DROP TABLE IF EXISTS substance_records CASCADE
  DROP TABLE IF EXISTS intake_records CASCADE
  DROP TABLE IF EXISTS eating_records CASCADE
  DROP TABLE IF EXISTS weight_records CASCADE
  DROP TABLE IF EXISTS blood_pressure_records CASCADE
  DROP TABLE IF EXISTS urination_records CASCADE
  DROP TABLE IF EXISTS defecation_records CASCADE
  DROP TABLE IF EXISTS audit_logs CASCADE
  DROP TABLE IF EXISTS phase_schedules CASCADE
  DROP TABLE IF EXISTS inventory_items CASCADE
  DROP TABLE IF EXISTS medication_phases CASCADE
  DROP TABLE IF EXISTS titration_plans CASCADE
  DROP TABLE IF EXISTS prescriptions CASCADE
  DROP TABLE IF EXISTS push_sent_log CASCADE
  DROP TABLE IF EXISTS push_schedules CASCADE
  DROP TABLE IF EXISTS push_subscriptions CASCADE
  DROP TABLE IF EXISTS push_settings CASCADE
  DROP TABLE IF EXISTS push_dose_schedules CASCADE
  DROP TABLE IF EXISTS __drizzle_migrations CASCADE

✓ Neon public schema reset. Auth schema preserved.
  Next step: pnpm db:migrate
```

**Result:** PASS

### 2. `pnpm db:migrate`

```
Reading config file '/home/ryan/repos/Personal/intake-tracker/drizzle.config.ts'
Using '@neondatabase/serverless' driver for database querying
[✓] migrations applied successfully!
```

**Result:** PASS — `drizzle/0000_init.sql` applied in one migration.

### 3. Public table count (`\dt public.*`)

20 tables present (no psql locally — queried via `@neondatabase/serverless`):

```
audit_logs, blood_pressure_records, daily_notes, defecation_records,
dose_logs, eating_records, intake_records, inventory_items,
inventory_transactions, medication_phases, phase_schedules, prescriptions,
push_schedules, push_sent_log, push_settings, push_subscriptions,
substance_records, titration_plans, urination_records, weight_records
```

**Result:** PASS — 20 tables, exactly matching the 20 `pgTable` definitions in `src/db/schema.ts`.

### 4. `intake_records` FK shape (`\d public.intake_records`)

```
user_id → neon_auth.users_sync.id ON DELETE CASCADE
```

**Result:** PASS — FK references `neon_auth.users_sync(id)` with `ON DELETE CASCADE`, matching the Phase 41 contract.

### 5. `push_schedules` rename (`\d public.push_schedules`)

```
found: push_schedules
not found: push_dose_schedules
```

**Result:** PASS — Post-Phase-41 canonical name is in place. Legacy name eliminated.

### 6. `neon_auth` schema preservation

```
SELECT schema_name FROM information_schema.schemata WHERE schema_name='neon_auth'
→ 1 row returned
```

**Result:** PASS — `neon_auth` schema (owned by Neon Auth) was preserved through reset.

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

**Overall:** PASS — operator workflow verified end-to-end on a real Neon branch.

## Gaps

### 1. reset-neon-db.ts allowlist can miss orphan tables — low severity
- **Finding:** Before the reset run, `public.user_settings` (8 columns, 0 rows) was present on the Neon dev branch from an earlier out-of-band experiment. `reset-neon-db.ts` uses a hardcoded allowlist of the 22 known tables, so the orphan survived the reset. After `db:migrate` it appeared alongside the 20 Drizzle-owned tables.
- **Impact:** Not a regression of this phase — the 20 schema.ts tables all applied cleanly and migration succeeded. Dev-only dev branch; prod runs local storage, so no user data at risk.
- **Remediation in this UAT:** The orphan was dropped manually (`DROP TABLE IF EXISTS user_settings CASCADE`) so the branch now has exactly 20 tables.
- **Design follow-up (not blocking Phase 42 completion):** Consider replacing the allowlist in `reset-neon-db.ts` with a dynamic query that drops every `public.*` base table (while still preserving `neon_auth`). Log as a future gap-closure item only if the allowlist proves fragile in practice — the allowlist is also a safety net against accidentally dropping tables an operator might want to keep.
- **status:** noted (not blocking)
