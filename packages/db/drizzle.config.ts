import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

/**
 * Drizzle Kit configuration — Phase 42.
 *
 * Schema source of truth: src/schema.ts (the @intake/db package).
 * Migrations live in packages/db/migrations/ and are committed to the repo.
 *
 * Usage (from packages/db, e.g. `pnpm --filter @intake/db db:generate`):
 *   pnpm exec drizzle-kit generate  # emit SQL from schema.ts
 *   pnpm exec drizzle-kit migrate   # apply pending migrations (Phase 5c)
 *
 * Phase 5c adds `db:migrate` = `drizzle-kit migrate`, run in production by the
 * decoupled `migrate-prod.yml` workflow against `DATABASE_URL_UNPOOLED` (Neon's
 * DIRECT endpoint — `drizzle-kit migrate` opens a TCP session for transactional
 * DDL/advisory locks, which the pooled PgBouncer endpoint can't serve safely).
 * The cutover (retiring apps/web/scripts/migrate.ts + the `vercel-build` migrate
 * step) is gated on the owner provisioning the unpooled secret + a one-time Neon
 * preview-branch validation — see DEFERRED.md.
 *
 * NEVER use `drizzle-kit push` in this project (D-14 in 42-CONTEXT.md).
 */
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  // NOTE: drizzle-kit 0.31.x dropped the "neon-http" driver option. For Neon
  // Postgres, we omit the driver field — drizzle-kit connects via the standard
  // `postgres` dialect using DATABASE_URL. Runtime code still uses
  // drizzle-orm/neon-http for actual queries; this config file only affects
  // `drizzle-kit` CLI commands (generate, migrate).
  // driver: "neon-http" — removed per plan acceptance criteria grep check;
  // if operator needs to re-enable, pin drizzle-kit to 0.28.x or older.
  dbCredentials: {
    // Prefer Neon's DIRECT (unpooled) endpoint for `drizzle-kit migrate` —
    // transactional DDL + advisory locks need a real session, not the pooled
    // PgBouncer transaction-mode endpoint. Falls back to DATABASE_URL so CI
    // (ephemeral Neon branches, which expose a direct URL as DATABASE_URL) and
    // `drizzle-kit generate` (no connection) keep working unchanged.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
