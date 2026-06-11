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
 *
 * Production migrations are still applied by apps/web/scripts/migrate.ts
 * (drizzle-orm/neon-http migrator) reading this `out` folder — the migrator
 * switch to `drizzle-kit migrate` is a deferred follow-up.
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
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
