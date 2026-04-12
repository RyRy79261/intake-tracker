# Phase 42: Postgres Schema + Drizzle Setup - Research

**Researched:** 2026-04-12
**Status:** Ready for planning

## Question

What do we need to know to PLAN Phase 42 (mirror 16 Dexie tables to Postgres via Drizzle, with CI-enforced parity)?

---

## 1. Drizzle ORM 0.45.x — relevant API surface

### Package layout (Drizzle 0.45.2 + drizzle-kit)
- Runtime import: `drizzle-orm/pg-core` exposes `pgTable`, `text`, `integer`, `bigint`, `boolean`, `jsonb`, `primaryKey`, `index`, `uniqueIndex`, `foreignKey`, `check`, `sql` builder.
- Neon driver: `drizzle-orm/neon-http` exposes `drizzle(neon(DATABASE_URL))`. Uses the `@neondatabase/serverless` HTTP client already in `package.json` — zero new HTTP dependency.
- CLI: `drizzle-kit` (devDep) provides `generate`, `migrate`, `push`, `studio`, `introspect` subcommands via `npx drizzle-kit <cmd>`.
- Typed helpers: `table.$inferSelect` returns the row type; `table.$inferInsert` returns the insert type. Both drive the parity test comparator.

### Column builder patterns we need
```ts
import { pgTable, text, bigint, boolean, integer, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// TEXT PK (matches crypto.randomUUID() strings from Dexie)
id: text("id").primaryKey(),

// Unix-ms timestamps — bigint with mode:'number'; Postgres bigint is 64-bit
createdAt: bigint("created_at", { mode: "number" }).notNull(),

// Nullable soft-delete
deletedAt: bigint("deleted_at", { mode: "number" }),

// Arrays — native Postgres
contraindications: text("contraindications").array(),
daysOfWeek: integer("days_of_week").array(),

// Text with CHECK constraint (D-04 — easier to evolve than pgEnum)
type: text("type").notNull(),
// added via a table-level check() in the second arg of pgTable:
//   (t) => ({ typeCheck: check("intake_records_type_check", sql`${t.type} IN ('water','salt')`) })
```

### FK + cascade semantics
- `user_id` → `neon_auth.users_sync(id) ON DELETE CASCADE` — declared via `.references(() => users_sync.id, { onDelete: "cascade" })` on a local `users_sync` table reference, OR via raw `foreignKey()` helper when the referenced table lives in another schema.
- Drizzle does NOT model the `neon_auth` schema natively. Two options:
  1. Declare a local `pgTable("users_sync", { id: text("id").primaryKey() }, () => ({ /* pgSchema("neon_auth") */ }))` using `pgSchema` helper.
  2. Use raw `foreignKey({ columns: [t.userId], foreignColumns: [sql`neon_auth.users_sync(id)`] })` — but Drizzle rejects non-column refs.
- **Winning approach:** `pgSchema("neon_auth").table("users_sync", { id: text("id").primaryKey() })` — standard Drizzle idiom for cross-schema FKs. Exported as `usersSync` from schema.ts so every app table can `.references(() => usersSync.id, { onDelete: "cascade" })`.
- Inner FKs (e.g. `medication_phases.prescription_id` → `prescriptions.id`) use `.references(() => prescriptions.id)` WITHOUT `onDelete: "cascade"` per D-08. Prevents orphan cascades; sync engine (Phase 43) orders deletes.

### Indexes
- Compound: `index("idx_intake_user_updated").on(t.userId, t.updatedAt)` — mandatory on every data table per D-06.
- Dexie compound indexes worth mirroring (Claude's Discretion per CONTEXT.md):
  - `intakeRecords [type+timestamp]` → `index("idx_intake_type_ts").on(t.type, t.timestamp)`
  - `inventoryTransactions [inventoryItemId+timestamp]` → same pattern
  - `doseLogs [prescriptionId+scheduledDate]` → same pattern
  - `auditLogs [action+timestamp]` → same pattern
  - `substanceRecords [type+timestamp]` → same pattern
- Not every Dexie single-column index needs a Postgres counterpart — the sync engine only queries by `(user_id, updated_at)`. Single-column indexes on `timestamp`, `updatedAt`, etc. are unused by Drizzle queries but CAN be added if we want Dexie and Drizzle to feel symmetric. Decision deferred to plans — default: ONLY `(user_id, updated_at)` + the Dexie compound indexes that matter for date-range queries.

### drizzle.config.ts (root)
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  driver: "neon-http",       // matches STACK.md
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
});
```

### Migration commands
- `pnpm exec drizzle-kit generate` — emits SQL file in `./drizzle/0000_<name>.sql` + snapshot JSON.
- `pnpm exec drizzle-kit migrate` — applies pending migrations to the DB referenced by `DATABASE_URL`. Tracks via `drizzle.__drizzle_migrations` table (auto-created).
- `drizzle-kit push` NOT used (per D-14).
- Generated SQL files are committed to the repo for reviewability.

---

## 2. Dexie → Drizzle field mapping (ground truth: `src/lib/db.ts` v15)

### The 16 app tables + their field sets

| Dexie table | Cols (excluding sync scaffolding) | Has `timezone`? |
|---|---|---|
| **intakeRecords** | id, type, amount, timestamp, source?, note?, groupId?, originalInputText?, groupSource? | yes |
| **weightRecords** | id, weight, timestamp, note? | yes |
| **bloodPressureRecords** | id, systolic, diastolic, heartRate?, irregularHeartbeat?, position, arm, timestamp, note? | yes |
| **eatingRecords** | id, timestamp, grams?, note?, groupId?, originalInputText?, groupSource? | yes |
| **urinationRecords** | id, timestamp, amountEstimate?, note? | yes |
| **defecationRecords** | id, timestamp, amountEstimate?, note? | yes |
| **substanceRecords** | id, type, amountMg?, amountStandardDrinks?, volumeMl?, description, source, sourceRecordId?, aiEnriched?, timestamp, groupId?, originalInputText?, groupSource? | yes |
| **prescriptions** | id, genericName, indication, notes?, contraindications?:string[], warnings?:string[], isActive | **no** |
| **medicationPhases** | id, prescriptionId, type, unit, startDate, endDate?, foodInstruction, foodNote?, notes?, status, titrationPlanId? | **no** |
| **phaseSchedules** | id, phaseId, time, scheduleTimeUTC, anchorTimezone, dosage, daysOfWeek:number[], enabled, unit? | **no** (has anchorTimezone instead) |
| **inventoryItems** | id, prescriptionId, brandName, currentStock?, strength, unit, pillShape, pillColor, visualIdentification?, refillAlertDays?, refillAlertPills?, isActive, isArchived? | yes |
| **inventoryTransactions** | id, inventoryItemId, timestamp, amount, note?, type, doseLogId? | yes |
| **doseLogs** | id, prescriptionId, phaseId, scheduleId, inventoryItemId?, scheduledDate, scheduledTime, status, actionTimestamp?, rescheduledTo?, skipReason?, note? | yes (own `timezone` field required by type) |
| **dailyNotes** | id, date, prescriptionId?, doseLogId?, note | yes |
| **auditLogs** | id, timestamp, action, details? | yes |
| **titrationPlans** | id, title, conditionLabel, recommendedStartDate?, status, notes?, warnings?:string[] | **no** |

Sync scaffolding on EVERY table: `createdAt:number`, `updatedAt:number`, `deletedAt:number|null`, `deviceId:string`.
Tables listed as "yes" above also carry `timezone:string`. The 5 "no" tables (`prescriptions`, `medicationPhases`, `phaseSchedules`, `titrationPlans`) and `doseLogs` follow their existing Dexie types — phaseSchedules uses `anchorTimezone` not `timezone`; doseLogs DOES have `timezone` and is listed "yes".

**Parity test implication:** the comparator must know, per table, which sync fields are required vs allowed to be absent.

### Union-type fields → `text` + CHECK constraint (D-04)

| Table.field | Union values |
|---|---|
| intakeRecords.type | `'water' \| 'salt'` |
| bloodPressureRecords.position | `'standing' \| 'sitting'` |
| bloodPressureRecords.arm | `'left' \| 'right'` |
| prescriptions? / inventoryItems.pillShape | `'round' \| 'oval' \| 'capsule' \| 'diamond' \| 'tablet'` |
| medicationPhases.type | `'maintenance' \| 'titration'` (PhaseType) |
| medicationPhases.foodInstruction | `'before' \| 'after' \| 'none'` (FoodInstruction) |
| medicationPhases.status | `'active' \| 'completed' \| 'cancelled' \| 'pending'` |
| substanceRecords.type | `'caffeine' \| 'alcohol'` |
| substanceRecords.source | `'water_intake' \| 'eating' \| 'standalone'` |
| doseLogs.status | `'taken' \| 'skipped' \| 'rescheduled' \| 'pending'` (DoseStatus) |
| inventoryTransactions.type | `'refill' \| 'consumed' \| 'adjusted' \| 'initial'` |
| titrationPlans.status | `'draft' \| 'active' \| 'completed' \| 'cancelled'` |
| auditLogs.action | AuditAction — 28 values (lines 24-53 of db.ts) |

Each becomes `text("col").notNull()` + a `check()` constraint named `<table>_<col>_check`. AuditAction's 28-value list is long but one-time.

### Array fields (Postgres native arrays per D-03)
- `prescriptions.contraindications?: string[]` → `text("contraindications").array()`
- `prescriptions.warnings?: string[]` → `text("warnings").array()`
- `titrationPlans.warnings?: string[]` → `text("warnings").array()`
- `phaseSchedules.daysOfWeek: number[]` → `integer("days_of_week").array().notNull()`

### Column naming: camelCase TS → snake_case SQL
Drizzle column builder second positional arg is the SQL name. Convention: `text("group_id")` + TS property `groupId`. Plans will use this uniformly.

---

## 3. Push tables (4) — final P41-aligned names per D-16

Per CONTEXT.md, these are defined in `src/db/schema.ts` under new names:

| New name | Replaces | Columns |
|---|---|---|
| `push_subscriptions` | (same) | id SERIAL PK, **user_id TEXT** (FK → neon_auth.users_sync), endpoint TEXT, p256dh TEXT, auth_key TEXT, created_at/updated_at BIGINT (ms) or TIMESTAMPTZ — see below |
| `push_schedules` | `push_dose_schedules` | id SERIAL PK, user_id TEXT, time_slot TEXT, day_of_week INT, medications_json TEXT, UNIQUE(user_id, time_slot, day_of_week) |
| `push_sent_log` | (same) | id SERIAL PK, user_id TEXT, time_slot TEXT, sent_date DATE, follow_up_index INT default 0, sent_at TIMESTAMPTZ default NOW(), UNIQUE(user_id, time_slot, sent_date, follow_up_index) |
| `push_settings` | (same) | user_id TEXT PK, enabled BOOLEAN, follow_up_count INT, follow_up_interval_minutes INT, day_start_hour INT |

**Critical constraint (D-19):** `src/lib/push-db.ts` is NOT rewritten in P42. Its raw SQL queries reference the existing push table shapes (`push_subscriptions`, `push_dose_schedules`, `push_sent_log`, `push_settings`) with SERIAL id, TEXT user_id, `created_at`/`updated_at` as TIMESTAMPTZ, etc. The Drizzle schema must define tables with **column shapes that match what push-db.ts expects** so the existing raw SQL keeps working.

This means the push tables in Drizzle:
- Keep SERIAL id (use `serial("id").primaryKey()`)
- Keep TIMESTAMPTZ for `created_at`/`updated_at` on push_subscriptions (use `timestamp("created_at", { withTimezone: true })`)
- **Rename** `push_dose_schedules` → `push_schedules` — BUT `push-db.ts` still queries `push_dose_schedules`. Phase 41 finishes by reverting the rename OR `push-db.ts` still uses the old name.

**Gap check:** Re-read `push-db.ts` and `41-CONTEXT.md` D-10/D-11/D-12 closely:
- D-10/D-11 (P41) says push tables are **truncated**, not renamed.
- P42 D-16 says tables get renamed to final P41-aligned names (`push_schedules` is the new one).
- But `push-db.ts` (unchanged in P42 per D-19) still contains `JOIN push_dose_schedules`.

**Resolution:** Either (a) the rename IS part of P42 plans AND `push-db.ts` is updated as a small edit to use new name (push-db.ts stays on raw SQL but its table names change), OR (b) we keep the current names in Drizzle and defer renaming to P43. CONTEXT.md D-16 explicitly says "the rename happens on an empty dataset" in P42, implying P42 owns the rename. So `push-db.ts` MUST be touched enough to swap table names (not rewritten to Drizzle, just a find/replace of `push_dose_schedules` → `push_schedules`).

**This is a concrete task for the plans.** It's a 4-line change (rename one table name in ~4 SQL queries) — inside the P42 scope per "single source of truth" goal.

**`user_id` FK addition:** Push tables currently have `user_id TEXT NOT NULL` with NO FK to `neon_auth.users_sync`. P41 truncates them to enable identity migration. P42 adds the FK as part of the Drizzle definition. Since `push-db.ts` only INSERTs via `user_id = ${userId}` (and the app passes Neon Auth user IDs), the FK is additive — it doesn't break existing queries, it just rejects writes with user_ids not in `neon_auth.users_sync`.

---

## 4. Schema parity test — design

### Goal
Detect when `src/lib/db.ts` and `src/db/schema.ts` drift apart in:
- Table set (presence of all 16 Dexie tables in Drizzle)
- Field set per table (names only — types are too loose to strict-compare)
- Sync scaffolding per table (createdAt/updatedAt/deletedAt/deviceId always present; timezone conditionally)

### Exemption
`user_id` is always allowed on Drizzle tables — not part of Dexie interfaces.

### Type extraction approach — decision

Two candidates from D-13:

**Option A: ts-morph walk of `src/lib/db.ts`**
- Pros: runtime introspection, no build-time coupling, handles interface inheritance cleanly, easy to enumerate tables + fields.
- Cons: adds `ts-morph` dev dependency (~5MB), slow startup.

**Option B: `expect-type` compile-time assertion**
- Pros: zero runtime cost, leverages TypeScript's own type checker.
- Cons: requires hand-written assertions per table; doesn't enumerate dynamically; drift in new tables isn't auto-detected unless a new assertion is added.

**Option C (new — lighter than A): Static AST walk via TypeScript Compiler API directly (`typescript` package, already installed transitively)**
- Walk `src/lib/db.ts` using `ts.createProgram` + `ts.forEachChild`, find exported `interface` declarations and the `db.version(15).stores({...})` call, extract the field names.
- Pros: no new dependency (TS is already there via Next.js), runtime, scales to new tables automatically.
- Cons: more code than ts-morph.

**Recommendation for planner:** Option C. TypeScript is already a transitive dep of Next.js. A ~100-line extraction module that opens `src/lib/db.ts`, finds the 16 exported interface declarations by matching the type name against a known list (enumerated from `db.version(15).stores(...)`), and returns `Record<tableName, string[]>`.

The parity test then does:
```ts
for (const [dexieTable, dexieFields] of Object.entries(dexieSchema)) {
  const drizzleTable = (schema as any)[dexieTableToDrizzleName[dexieTable]];
  const drizzleFields = Object.keys(drizzleTable).filter(k => !k.startsWith("_"));
  // Or: use getTableColumns(drizzleTable) from drizzle-orm to list columns
  const extra = drizzleFields.filter(f => !dexieFields.includes(f) && f !== "userId" /* snake_case: user_id */);
  const missing = dexieFields.filter(f => !drizzleFields.includes(f));
  expect(extra, `${dexieTable} has Drizzle-only columns: ${extra.join(",")}`).toEqual([]);
  expect(missing, `${dexieTable} is missing Dexie fields: ${missing.join(",")}`).toEqual([]);
}
```

Drizzle 0.45 exposes `getTableColumns(table)` from `drizzle-orm` which returns a record of column names → column objects. This is the canonical way to enumerate.

### Name mapping table
The test needs a Dexie-camelCase → Drizzle-snake_case mapping:
```ts
const tableNameMap: Record<string, string> = {
  intakeRecords: "intake_records",
  weightRecords: "weight_records",
  bloodPressureRecords: "blood_pressure_records",
  eatingRecords: "eating_records",
  urinationRecords: "urination_records",
  defecationRecords: "defecation_records",
  substanceRecords: "substance_records",
  prescriptions: "prescriptions",
  medicationPhases: "medication_phases",
  phaseSchedules: "phase_schedules",
  inventoryItems: "inventory_items",
  inventoryTransactions: "inventory_transactions",
  dailyNotes: "daily_notes",
  doseLogs: "dose_logs",
  auditLogs: "audit_logs",
  titrationPlans: "titration_plans",
};
```

And a field-name camelCase → snake_case converter (or the comparison is done at the camelCase level since `getTableColumns` returns TS property names, not SQL column names).

**Cleaner:** Compare by TS property name (both sides produce camelCase). Drizzle's `getTableColumns()` returns TS property keys on the table object literal, not SQL column names. So `intakeRecords.id` and `intakeRecordsDrizzle.id` both key as `id`; `groupId` ↔ `groupId`. Much easier.

---

## 5. reset-neon-db.ts script — shape

### Goal
Idempotently drop every app table while preserving `neon_auth.*`. Runs:
- Once before the very first `drizzle-kit migrate` (to kill pre-Drizzle state: old `push_subscriptions`, `push_dose_schedules`, `push_sent_log`, `push_settings` with their original types and no FK).
- Re-runnable whenever a clean slate is wanted (Phase 43 sync engine testing, dev environment reset, ephemeral CI branch reset).

### Drop order (respect inner FKs)

Reverse topological order:
1. `inventory_transactions` (FK → inventory_items, dose_logs)
2. `dose_logs` (FK → prescriptions, medication_phases, phase_schedules, inventory_items)
3. `daily_notes` (FK → prescriptions, dose_logs)
4. `substance_records` (FK → intake_records)
5. `intake_records`, `eating_records`, `weight_records`, `blood_pressure_records`, `urination_records`, `defecation_records`, `audit_logs` (no dependents)
6. `phase_schedules` (FK → medication_phases)
7. `inventory_items` (FK → prescriptions)
8. `medication_phases` (FK → prescriptions, titration_plans)
9. `titration_plans` (no deps)
10. `prescriptions` (no deps)
11. Push tables (in any order): `push_sent_log`, `push_schedules`, `push_dose_schedules` (legacy name if still present), `push_subscriptions`, `push_settings`
12. Drizzle migration history table: `__drizzle_migrations` (dropping this forces re-migration on next `migrate`)

**Simpler approach:** `DROP TABLE IF EXISTS <name> CASCADE` for each — CASCADE removes dependent objects (inner FK constraints) automatically, so drop order doesn't matter. Cleaner and safer.

**Absolute NO-DROP list:** any table in `neon_auth` schema. The script operates only on `public.*` tables.

### Implementation
```ts
// scripts/reset-neon-db.ts
import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const TABLES = [
  // 16 app tables (new Drizzle names)
  "intake_records", "weight_records", "blood_pressure_records",
  "eating_records", "urination_records", "defecation_records",
  "substance_records", "prescriptions", "medication_phases",
  "phase_schedules", "inventory_items", "inventory_transactions",
  "daily_notes", "dose_logs", "audit_logs", "titration_plans",
  // 4 push tables (new names)
  "push_subscriptions", "push_schedules", "push_sent_log", "push_settings",
  // Legacy push name (dropped if still present)
  "push_dose_schedules",
  // Drizzle migration tracker
  "__drizzle_migrations",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = neon(url);

  for (const t of TABLES) {
    console.log(`DROP TABLE IF EXISTS ${t} CASCADE`);
    // Use raw SQL tagged template — neon() returns a fetch-based client
    await sql(`DROP TABLE IF EXISTS ${t} CASCADE`);
  }
  console.log("✓ Neon public schema reset. neon_auth preserved.");
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Run via: `pnpm exec tsx scripts/reset-neon-db.ts` — matches existing `scripts/*.ts` pattern.

**Safety note:** Script has NO interactive prompt. It's meant to be run manually only when the operator knows the target branch is safe to wipe. Document this in a comment. For CI, the target is always an ephemeral test branch that gets deleted anyway.

---

## 6. Neon branch lifecycle for CI (per D-17)

Per `.planning/research/ARCHITECTURE.md` §"Neon branch lifecycle pattern" and P41 precedent:

- CI pipeline runs `neonctl branches create --parent main --name ci-$GITHUB_RUN_ID` at job start.
- Extracts the branch's connection string, exports as `DATABASE_URL` for subsequent steps.
- Runs `pnpm exec tsx scripts/reset-neon-db.ts` (optional — fresh branch is already clean, but explicit reset is defensive).
- Runs `pnpm exec drizzle-kit migrate` against the branch.
- Runs `pnpm test` which now includes schema-parity + any integration tests.
- On job finish (success OR failure), deletes the branch: `neonctl branches delete ci-$GITHUB_RUN_ID`.
- Requires: `NEON_API_KEY` secret in GitHub Actions, `neonctl` installed via `npx neonctl@latest` (or via pnpm dlx).

**Phase 42 scope:** the CI job that runs `drizzle-kit migrate` against an ephemeral branch. This is net-new CI work — current `ci.yml` has no job that touches Postgres. Adding one new job named `schema-migration` or integrating migration into the existing `data-integrity` job.

**Cheaper alternative for Phase 42 specifically:** Since Phase 42 delivers only schema + migrations (no sync service tests that read from Postgres), the migration can run against the main Neon test branch in CI, without branching. Parity test is a pure source-code comparison and needs zero DB access. This dramatically simplifies the CI work: we only need to verify the migration SQL is applyable — which `drizzle-kit generate` + snapshot commit + lint-level review achieves without running `migrate` in CI at all.

**Recommendation for planner:** Defer the ephemeral-branch CI pattern to Phase 43 (sync engine core) where integration tests actually need a live DB. For Phase 42, the CI work is just:
1. Ensure `schema-parity.test.ts` runs as part of `pnpm test` (automatic — vitest picks it up).
2. Commit the `drizzle/0000_*.sql` migration file so reviewers see the SQL diff.
3. Optional: a tiny GH Actions step that runs `pnpm exec drizzle-kit generate` and errors if it produces an uncommitted diff (catches "forgot to regenerate after schema.ts change"). This is equivalent to a lockfile freshness check.

---

## 7. Gotchas and open questions

1. **`push-db.ts` table rename side effect** — the Drizzle `push_schedules` rename (from `push_dose_schedules`) requires a corresponding one-line find/replace in `push-db.ts`. If the planner says "push-db.ts is untouched," the rename won't work. Plans must explicitly include this ~4-line edit (3 references to the table in `getDueNotifications()` and possibly elsewhere).

2. **Serial vs TEXT primary keys on push tables** — the 4 push tables use `SERIAL` PKs per the original `push-migration.sql`, which Drizzle defines as `serial("id").primaryKey()`. This means the parity test must NOT compare push tables against Dexie interfaces (there are none) — push tables are Drizzle-only, fully exempted from the parity comparator.

3. **`neon_auth.users_sync` table may not exist yet in non-P41 environments** — when P42 runs `drizzle-kit migrate` on a fresh branch, the FK creation fails if `neon_auth.users_sync` is absent. Solution: P42's migration SQL includes a `CREATE SCHEMA IF NOT EXISTS neon_auth;` and possibly a stub table (unlikely — Neon Auth provisions this automatically when auth is configured on the branch). Alternative: gate the FK on env detection — only declare the FK if `NEON_AUTH_BASE_URL` is set. **But** CONTEXT.md D-07 hard-requires the FK. Safest: document that the migration requires Phase 41 Neon Auth to have been provisioned on the target branch first (which is the whole P41→P42 dependency chain).

4. **Dexie has no user_id — parity test must explicitly exempt it.** Already D-12, handled in comparator.

5. **`currentStock` on `inventoryItems` is deprecated** (line 210 of db.ts) but still present in the interface. Parity test should include it so Drizzle has a matching column. Drizzle column: `currentStock: integer("current_stock")` (nullable). Document it as "deprecated — will be dropped when Phase 3 service layer stops reading it" in schema.ts comment.

6. **`phaseSchedules.time` is deprecated** (line 192 of db.ts) but still present. Same treatment: Drizzle column + deprecation comment.

7. **Parity test and `deviceId` casing** — Dexie uses `deviceId` (camelCase TS property); Drizzle table columns are also camelCase TS keys (`deviceId: text("device_id")`). `getTableColumns(t).deviceId` is the column object; the key is `deviceId`. No case mismatch if we consistently use camelCase for TS properties.

8. **`$inferSelect` vs `getTableColumns`** — `$inferSelect` gives you a TypeScript type at compile time; for a runtime enumeration in a test, `getTableColumns(table)` is the right API (returns `Record<string, Column>` at runtime).

9. **`drizzle-zod` install only — no schemas generated in P42.** Per D-20, we add the package to package.json but don't import it anywhere in P42. Phase 43 owns the sync-payload Zod schemas.

10. **CI parity test is synchronous.** No Postgres connection needed — both sides are source-code inspection. Runs in every `pnpm test` invocation at zero incremental cost.

---

## 8. File inventory (new, modified, deleted)

**New files:**
- `src/db/schema.ts` — all 20 table definitions (16 Dexie-mirrored + 4 push)
- `drizzle.config.ts` — root config
- `drizzle/0000_init.sql` — generated migration (checked in)
- `drizzle/meta/_journal.json` + `drizzle/meta/0000_snapshot.json` — drizzle-kit state (checked in)
- `scripts/reset-neon-db.ts` — clean-slate script
- `src/__tests__/schema-parity.test.ts` — CI drift detector
- `src/__tests__/dexie-schema-extractor.ts` — helper module (TS compiler API) imported by parity test
- `src/lib/drizzle.ts` — (optional, Claude's discretion) Drizzle client singleton. NOT used in P42 but useful for P43 onramp. Defer — not in P42 scope.

**Modified files:**
- `package.json` — add `drizzle-orm@^0.45.2`, `drizzle-zod@latest`, dev: `drizzle-kit@latest`
- `src/lib/push-db.ts` — rename `push_dose_schedules` → `push_schedules` in raw SQL (approximately 3-4 references)
- `.github/workflows/ci.yml` — optional: add `drizzle-kit generate` freshness check step to the `typecheck` or `build` job

**Deleted files:**
- `scripts/push-migration.sql` — superseded by Drizzle migrations

**Untouched:**
- `src/lib/db.ts` — Dexie stays at v15
- `src/lib/push-db.ts` query LOGIC — only string literal renames, no shape changes
- All service files, hooks, components

---

## 9. Dependencies install commands

```bash
# Runtime
pnpm add drizzle-orm@^0.45.2 drizzle-zod@latest

# Dev
pnpm add -D drizzle-kit@latest
```

Versions align with STACK.md §"Database ORM: Drizzle ORM".

---

## 10. Plan decomposition sketch

Natural decomposition into 3 plans based on dependency chains:

**Plan 42-01: Drizzle schema definition + package install (Wave 1)**
- Install `drizzle-orm`, `drizzle-zod`, `drizzle-kit`
- Create `drizzle.config.ts`
- Create `src/db/schema.ts` with all 20 table definitions
- Delete `scripts/push-migration.sql`
- Edit `src/lib/push-db.ts` to rename `push_dose_schedules` → `push_schedules`
- No DB push yet; schema.ts compiles and typechecks

**Plan 42-02: Migration pipeline + reset script (Wave 2, depends on 42-01)**
- Run `drizzle-kit generate` to emit `drizzle/0000_init.sql` + snapshot, commit the generated files
- Create `scripts/reset-neon-db.ts`
- Document manual run in README / CLAUDE.md
- `drizzle-kit migrate` is run MANUALLY against the Neon test branch as a one-off operator action (NOT as part of the phase execution autonomously — requires DATABASE_URL)
- UAT item: operator runs reset + migrate against Neon test branch, confirms tables exist

**Plan 42-03: Schema parity test + CI integration (Wave 3, depends on 42-01)**
- Create `src/__tests__/dexie-schema-extractor.ts` (TS compiler API walker)
- Create `src/__tests__/schema-parity.test.ts` (compares Dexie ↔ Drizzle)
- Verify test runs as part of `pnpm test` (no CI changes needed — auto-picked by vitest)
- Optional: add `drizzle-kit generate` freshness check to ci.yml `typecheck` job

Plan 42-03 can run in parallel with Plan 42-02 (both depend only on 42-01).

---

## RESEARCH COMPLETE
