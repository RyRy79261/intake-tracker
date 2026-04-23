import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

loadEnvConfig(process.cwd());

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

migrate(db, { migrationsFolder: "./drizzle" })
  .then(() => {
    console.log("Migrations applied successfully");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
