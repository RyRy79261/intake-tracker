import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

loadEnvConfig(process.cwd());

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Migrations were extracted to the @intake/db package in Phase 2. This script
// (still the production migrator, run by vercel-build) now reads them from
// packages/db/migrations. cwd is apps/web when invoked via `pnpm db:migrate`.
const migrationsFolder = path.resolve(
  process.cwd(),
  "../../packages/db/migrations",
);

migrate(db, { migrationsFolder })
  .then(() => {
    console.log("Migrations applied successfully");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
