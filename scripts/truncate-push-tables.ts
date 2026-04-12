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
import { neon } from "@neondatabase/serverless";

export async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[truncate-push] DATABASE_URL is required");
    process.exit(1);
  }

  const sql = neon(url);

  console.log("[truncate-push] Starting atomic truncate of 3 push tables...");

  // Neon HTTP driver supports multi-statement transactions via sql.transaction([...]).
  // If the installed driver version does not support transactions, fall back to
  // sequential TRUNCATE ... CASCADE calls — NOT atomic, but acceptable for a
  // one-shot migration on a single-user system with no concurrent writers.
  try {
    await sql.transaction([
      sql`TRUNCATE TABLE push_subscriptions RESTART IDENTITY CASCADE`,
      sql`TRUNCATE TABLE push_schedules RESTART IDENTITY CASCADE`,
      sql`TRUNCATE TABLE push_sent_log RESTART IDENTITY CASCADE`,
    ]);
  } catch (err) {
    console.warn(
      "[truncate-push] sql.transaction unavailable, running sequentially:",
      err
    );
    await sql`TRUNCATE TABLE push_subscriptions RESTART IDENTITY CASCADE`;
    await sql`TRUNCATE TABLE push_schedules RESTART IDENTITY CASCADE`;
    await sql`TRUNCATE TABLE push_sent_log RESTART IDENTITY CASCADE`;
  }

  console.log("[truncate-push] Done. 3 tables cleared.");
}

main().catch((err) => {
  console.error("[truncate-push] Failed:", err);
  process.exit(1);
});
