/**
 * Phase 41 one-shot: wipe push tables before switching auth identity.
 *
 * Why: push_subscriptions.user_id was populated with Privy DIDs. After Neon Auth
 * swap, those DIDs become orphaned — no new Neon Auth user will ever match them.
 * Rather than attempt a mapping migration, we truncate and let the existing
 * subscribeToPush() flow re-register the device under the new identity on first
 * login (see src/hooks/use-push-schedule-sync.ts useDoseReminderToggle).
 *
 * Single-user, single-device: one notification gap during the migration is
 * acceptable (per D-10 / T-41-12).
 *
 * Run with: pnpm db:truncate-push
 * Requires: DATABASE_URL in env (same Neon connection string used by push-db.ts)
 *
 * NOT wired into any automated pipeline — operator-invoked only.
 */
import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";

loadEnvConfig(process.cwd());

export async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[truncate-push] DATABASE_URL is required");
    process.exit(1);
  }

  const sql = neon(url);

  // Phase 42 renamed push_dose_schedules → push_schedules. Keep the old name
  // in the list so re-runs on a pre-Phase-42 prod branch still clear it, but
  // list the new name first so fresh Drizzle-migrated branches also truncate.
  const tables = [
    "push_subscriptions",
    "push_schedules",
    "push_dose_schedules",
    "push_sent_log",
    "push_settings",
  ];

  console.log(`[truncate-push] Starting truncate of ${tables.length} push tables...`);

  const existing = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename = ANY(${tables})
  ` as Array<{ tablename: string }>;
  const present = new Set(existing.map((r) => r.tablename));

  const missing = tables.filter((t) => !present.has(t));
  if (missing.length > 0) {
    console.log(`[truncate-push] Skipping missing tables (fresh branch?): ${missing.join(", ")}`);
  }

  let cleared = 0;
  for (const table of tables) {
    if (!present.has(table)) continue;
    // Table name comes from a static allowlist above, not user input — safe to interpolate.
    await sql.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    cleared++;
  }

  console.log(`[truncate-push] Done. ${cleared} table(s) cleared, ${missing.length} skipped.`);
}

main().catch((err) => {
  console.error("[truncate-push] Failed:", err);
  process.exit(1);
});
