import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

/**
 * Drizzle Kit configuration — Phase 42.
 *
 * Schema source of truth: src/db/schema.ts (20 tables: 16 Dexie-mirrored + 4 push).
 * Migrations live in /drizzle/ and are committed to the repo.
 *
 * Usage:
 *   pnpm exec drizzle-kit generate  # emit SQL from schema.ts
 *   pnpm exec drizzle-kit migrate   # apply pending migrations to DATABASE_URL
 *
 * NEVER use `drizzle-kit push` in this project (D-14 in 42-CONTEXT.md).
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
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
