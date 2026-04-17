#!/usr/bin/env tsx
/**
 * Post-migration smoke check for the schema-migration CI job (Phase 42 D-17).
 *
 * Uses @neondatabase/serverless (the project's existing Neon HTTP driver)
 * to verify that `pnpm db:migrate` produced the expected schema shape on the
 * ephemeral Neon branch referenced by DATABASE_URL.
 *
 * Does NOT use psql. The Ubuntu CI runner does not reliably ship with the
 * postgresql-client package, and the Neon pooled HTTP endpoint is not a
 * standard libpq target in all cases. @neondatabase/serverless is the
 * single DB client used throughout this project — keep it consistent.
 *
 * Exit codes:
 *   0  all checks passed
 *   1  any check failed (error printed to stderr)
 */
import { neon } from "@neondatabase/serverless";

// Pinned expected count: 20 app+push tables + 1 drizzle-kit bookkeeping
// table (__drizzle_migrations) = 21. If this number changes in a future
// drizzle-kit release, update it here after re-running locally to confirm.
const EXPECTED_TABLE_COUNT = 21;

// Representative tables spot-checked by name. Three is enough to catch
// a schema that happened to have the right COUNT but the wrong shape
// (e.g., someone deleted intake_records and added a placeholder).
const SPOT_CHECK_TABLES = [
  "intake_records",
  "push_schedules",
  "prescriptions",
] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL not set — this script must run with an active Neon branch URL in env"
    );
  }
  const sql = neon(url);

  // 1) Count public tables.
  const countRows = (await sql.query(
    `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`
  )) as Array<{ count: number }>;
  const count = countRows[0]?.count ?? 0;
  if (count !== EXPECTED_TABLE_COUNT) {
    const listRows = (await sql.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    )) as Array<{ table_name: string }>;
    console.error(
      `::error::Expected ${EXPECTED_TABLE_COUNT} public tables after migration, found ${count}`
    );
    console.error("Public tables found:");
    for (const r of listRows) console.error(`  - ${r.table_name}`);
    process.exit(1);
  }
  console.log(`Verified: ${count} public tables (expected ${EXPECTED_TABLE_COUNT})`);

  // 2) Spot-check specific tables.
  for (const name of SPOT_CHECK_TABLES) {
    const existsRows = (await sql.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [name]
    )) as Array<{ exists: boolean }>;
    if (!existsRows[0]?.exists) {
      console.error(
        `::error::Expected table public.${name} does not exist after migration`
      );
      process.exit(1);
    }
    console.log(`Verified: public.${name} exists`);
  }

  // 3) Confirm the user_id FK on intake_records targets neon_auth.users_sync.
  // Catches the "FK created against public.users_sync instead" class of bug.
  const fkRows = (await sql.query(
    `SELECT ccu.table_schema || '.' || ccu.table_name AS target
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND tc.table_name = 'intake_records'
       AND kcu.column_name = 'user_id'
     LIMIT 1`
  )) as Array<{ target: string }>;
  const fkTarget = fkRows[0]?.target;
  if (fkTarget !== "neon_auth.users_sync") {
    console.error(
      `::error::intake_records.user_id FK targets '${fkTarget ?? "(none)"}', expected 'neon_auth.users_sync'`
    );
    process.exit(1);
  }
  console.log("Verified: intake_records.user_id -> neon_auth.users_sync");

  console.log("");
  console.log("All schema checks passed.");
}

main().catch((err) => {
  console.error("verify-schema failed:", err);
  process.exit(1);
});
