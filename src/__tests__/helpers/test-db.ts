/**
 * Testcontainers-based Postgres helper for integration tests.
 *
 * Spins up a real Postgres 16 container, creates the neon_auth schema
 * (which Neon provides in production), applies Drizzle migrations, and
 * seeds a test user that satisfies FK constraints.
 *
 * Usage:
 *   const ctx = await setupTestDb();
 *   // ctx.db is a real drizzle instance backed by Postgres
 *   // ctx.testUserId is seeded in neon_auth.users_sync
 *   await ctx.teardown();
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import * as fs from "node:fs";
import * as path from "node:path";

const TEST_USER_ID = "test-user-integration";

export interface TestDbContext {
  db: NodePgDatabase<typeof schema>;
  pool: pg.Pool;
  container: StartedPostgreSqlContainer;
  testUserId: string;
  connectionString: string;
  teardown: () => Promise<void>;
}

export async function setupTestDb(): Promise<TestDbContext> {
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("testdb")
    .withUsername("test")
    .withPassword("test")
    .start();

  const connectionString = container.getConnectionUri();

  const pool = new pg.Pool({ connectionString });

  // Create the neon_auth schema that Neon provides in production.
  // All app tables have FK constraints referencing neon_auth.users_sync(id).
  await pool.query(`CREATE SCHEMA IF NOT EXISTS neon_auth`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS neon_auth.users_sync (
      id text PRIMARY KEY NOT NULL
    )
  `);

  // Apply Drizzle migrations (raw SQL files from drizzle/ folder)
  const migrationsDir = path.resolve(process.cwd(), "drizzle");
  const sqlFiles = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of sqlFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    // Drizzle migrations use --> statement-breakpoint as separator
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
  }

  // Seed the test user so FK constraints are satisfied
  await pool.query(
    `INSERT INTO neon_auth.users_sync (id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [TEST_USER_ID],
  );

  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    container,
    testUserId: TEST_USER_ID,
    connectionString,
    teardown: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
