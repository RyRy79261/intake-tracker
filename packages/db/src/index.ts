/**
 * `@intake/db` server barrel.
 *
 * `import "server-only"` poisons this entry: importing `@intake/db` (the
 * default export) from any client component fails the build. It re-exports the
 * Neon Drizzle client (`./client`, itself server-only) and the Postgres schema
 * (`./schema`, isomorphic table metadata).
 *
 * Boundary map (consume the narrowest entry you need):
 *   - `@intake/db`              → this barrel (server-only): client + schema
 *   - `@intake/db/client`       → the Neon connection (server-only)
 *   - `@intake/db/schema`       → drizzle table defs (isomorphic, no secrets)
 *   - `@intake/db/sync-payload` → client-safe push/pull zod schemas
 *
 * The client sync engine and Dexie migration code must import only
 * `@intake/db/sync-payload` (or `@intake/db/schema` for table metadata) — never
 * this barrel or `@intake/db/client`.
 */
import "server-only";

export * from "./client";
export * from "./schema";
