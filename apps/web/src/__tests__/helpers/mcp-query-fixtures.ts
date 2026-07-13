/**
 * Fixture builders for MCP query-function integration tests.
 *
 * The MCP read queries in `src/lib/mcp/queries.ts` run against real Postgres
 * (see `mcp-queries.integration.test.ts`, which wires `setupTestDb()` into
 * `@intake/db/client` via `vi.mock`). Every record table carries a wall of
 * NOT NULL sync columns (createdAt/updatedAt/deviceId/timezone/…) that are
 * irrelevant to what a query test asserts, so these builders fill sane
 * defaults and let each test override only the fields under test.
 *
 * Ids are unique per process via a monotonic counter — no randomness, so
 * failures are reproducible.
 */
import type * as schema from "@intake/db/schema";

type WeightInsert = typeof schema.weightRecords.$inferInsert;

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** NOT NULL sync columns shared by every record table. */
function syncColumns(ts: number) {
  return {
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null as number | null,
    deviceId: "test-device",
    timezone: "UTC",
  };
}

/**
 * A weight_records insert row. Defaults to 72.5 kg at `Date.now()`; pass
 * `timestamp`, `deletedAt`, `userId`, etc. to override.
 */
export function weightFixture(
  userId: string,
  overrides: Partial<WeightInsert> = {},
): WeightInsert {
  const ts = overrides.timestamp ?? Date.now();
  return {
    id: uid("weight"),
    userId,
    weight: 72.5,
    timestamp: ts,
    note: null,
    ...syncColumns(ts),
    ...overrides,
  };
}
