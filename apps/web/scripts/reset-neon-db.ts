#!/usr/bin/env tsx
/**
 * Reset the Neon Postgres public schema to a clean state.
 *
 * Drops every app table (both the Drizzle-owned names and the legacy push table
 * name `push_dose_schedules`) plus the drizzle-kit migration tracker. Uses
 * DROP TABLE IF EXISTS ... CASCADE, so it's idempotent and handles inner FK
 * dependencies automatically.
 *
 * PRESERVES: the auth schema used by Neon Auth (neon_auth.*). This script only
 * operates on unqualified table names which resolve to the `public` schema via
 * Postgres search_path. A runtime assertion rejects any schema-qualified entries.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm db:reset
 *
 * Safety:
 *   - No interactive confirmation — only run against a branch you know is safe to wipe.
 *   - NEVER run against production (script refuses if DATABASE_URL contains "prod").
 *   - Set ALLOW_PROD_RESET=1 to override the production safety check (intentional footgun).
 *   - CI runs against ephemeral branches that are deleted afterward anyway.
 *
 * Tables dropped (each via DROP TABLE IF EXISTS <name> CASCADE):
 *   DROP TABLE IF EXISTS intake_records CASCADE
 *   DROP TABLE IF EXISTS weight_records CASCADE
 *   DROP TABLE IF EXISTS blood_pressure_records CASCADE
 *   DROP TABLE IF EXISTS eating_records CASCADE
 *   DROP TABLE IF EXISTS urination_records CASCADE
 *   DROP TABLE IF EXISTS defecation_records CASCADE
 *   DROP TABLE IF EXISTS substance_records CASCADE
 *   DROP TABLE IF EXISTS prescriptions CASCADE
 *   DROP TABLE IF EXISTS medication_phases CASCADE
 *   DROP TABLE IF EXISTS phase_schedules CASCADE
 *   DROP TABLE IF EXISTS inventory_items CASCADE
 *   DROP TABLE IF EXISTS inventory_transactions CASCADE
 *   DROP TABLE IF EXISTS daily_notes CASCADE
 *   DROP TABLE IF EXISTS dose_logs CASCADE
 *   DROP TABLE IF EXISTS audit_logs CASCADE
 *   DROP TABLE IF EXISTS titration_plans CASCADE
 *   DROP TABLE IF EXISTS push_subscriptions CASCADE
 *   DROP TABLE IF EXISTS push_schedules CASCADE
 *   DROP TABLE IF EXISTS push_sent_log CASCADE
 *   DROP TABLE IF EXISTS push_settings CASCADE
 *   DROP TABLE IF EXISTS push_dose_schedules CASCADE  (legacy name — idempotent)
 *   DROP TABLE IF EXISTS __drizzle_migrations CASCADE
 */
import { neon } from "@neondatabase/serverless";

const TABLES: readonly string[] = [
  // 16 Dexie-mirrored app tables (new Drizzle names)
  // Ordered children-before-parents for cleaner output (CASCADE handles FK deps anyway)
  "inventory_transactions", // FK → inventory_items, dose_logs
  "dose_logs", // FK → prescriptions, medication_phases, phase_schedules, inventory_items
  "daily_notes", // FK → prescriptions, dose_logs
  "substance_records", // FK → intake_records
  "intake_records",
  "eating_records",
  "weight_records",
  "blood_pressure_records",
  "urination_records",
  "defecation_records",
  "audit_logs",
  "phase_schedules", // FK → medication_phases
  "inventory_items", // FK → prescriptions
  "medication_phases", // FK → prescriptions, titration_plans
  "titration_plans",
  "prescriptions",
  // 4 push tables (Phase-41-aligned names)
  "push_sent_log",
  "push_schedules",
  "push_subscriptions",
  "push_settings",
  // Legacy push name — dropped if still present from pre-Phase-42 state
  "push_dose_schedules",
  // drizzle-kit migration tracker — drop so next migrate re-applies cleanly
  "__drizzle_migrations",
] as const;

async function main(): Promise<void> {
  // Runtime assertion: TABLES must contain only unqualified names.
  // Unqualified names resolve via search_path to public — never to neon_auth.
  if (TABLES.some((t) => t.includes("."))) {
    throw new Error(
      "TABLES must contain unqualified names only — schema-qualified names are forbidden to prevent accidental drops outside public schema"
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set — export it or add it to .env.local");
  }

  // Safety heuristic: refuse if the connection string looks like production.
  // Operators can override by setting ALLOW_PROD_RESET=1 (intentional footgun).
  if (/prod/i.test(url) && process.env.ALLOW_PROD_RESET !== "1") {
    throw new Error(
      "DATABASE_URL appears to point at production. Refusing to wipe. " +
        "Set ALLOW_PROD_RESET=1 to override (you probably shouldn't)."
    );
  }

  const sql = neon(url);

  console.log(`Resetting Neon public schema (${TABLES.length} tables)...`);

  for (const table of TABLES) {
    console.log(`  DROP TABLE IF EXISTS ${table} CASCADE`);
    // Use sql.query() for dynamic DDL — tagged-template mode cannot splice
    // identifiers safely. TABLES is a compile-time const array of string
    // literals so identifier injection risk is nil.
    await sql.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
  }

  console.log("");
  console.log("✓ Neon public schema reset. Auth schema preserved.");
  console.log("  Next step: pnpm db:migrate");
}

main().catch((err) => {
  console.error("reset-neon-db failed:", err);
  process.exit(1);
});
