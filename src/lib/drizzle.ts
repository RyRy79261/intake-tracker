/**
 * Drizzle client (Neon HTTP driver).
 *
 * Lazy-init singleton following the `getSQL()` pattern from src/lib/push-db.ts:
 * the neon client is only constructed when `db` is first accessed, which keeps
 * module import free of side effects and unblocks tests that mock this module
 * via `vi.mock("@/lib/drizzle")` without touching `process.env.DATABASE_URL`.
 *
 * Phase 42 introduced src/db/schema.ts as the single source of truth for all
 * 20 Postgres tables. Phase 43 (sync engine) is the first phase that needs a
 * runtime Drizzle client — pull/push routes and the sync engine both import
 * `db` from here.
 *
 * Env var: DATABASE_URL (Vercel-Neon integration standard; see
 * `feedback_env_vars.md`). Server-only; never imported by browser bundles.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

function getClient(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[drizzle] DATABASE_URL is not set — cannot construct Neon client",
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}

/**
 * Proxy wrapper so callers can `import { db } from "@/lib/drizzle"` and use it
 * like `db.select().from(...)` without waiting on an async init — the first
 * property access lazily constructs the singleton.
 */
export const db: NeonHttpDatabase<typeof schema> = new Proxy(
  {} as NeonHttpDatabase<typeof schema>,
  {
    get(_target, prop, _receiver) {
      const client = getClient();
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);
