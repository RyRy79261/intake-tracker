/**
 * Integration tests for the MCP read query functions
 * (`src/lib/mcp/queries.ts`) against a real Postgres database.
 *
 * The query fns enforce the connector's safety invariants — user scoping,
 * tombstone filtering, the time-range window, and the MAX_ROWS (5000) row
 * cap with its `truncated` flag — that a mocked Drizzle stub cannot
 * exercise. This file is the harness every Group-1 MCP tool test builds on:
 * seed real rows with the fixture builders, run the query fn, assert the
 * invariant.
 *
 * Wiring: a top-level `vi.mock` swaps the `@intake/db/client` singleton for
 * the testcontainer db via a lazy getter (so `ctx` need not exist at hoist
 * time — it is read only when a query fn touches `db`). The SUT is then
 * dynamically imported inside `beforeAll`, after `ctx` is assigned, so it
 * resolves the mock rather than the real Neon client.
 *
 * NOTE: the 1-year range guard and the fire-and-forget audit row live at the
 * TOOL layer (`runTool`/`validateRange`/`writeMcpAudit` in tools.ts), not in
 * the query fns — they are exercised by the tool-level tests, not here.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import {
  setupTestDb,
  type TestDbContext,
} from "@/__tests__/helpers/test-db";
import { weightFixture } from "@/__tests__/helpers/mcp-query-fixtures";
import * as schema from "@intake/db/schema";
import type * as QueriesMod from "@/lib/mcp/queries";

const OTHER_USER_ID = "other-user-integration";
const FULL_RANGE = { start: 0, end: Number.MAX_SAFE_INTEGER };

let ctx: TestDbContext;
let queries: typeof QueriesMod;

// Top-level so vitest hoists it cleanly (a nested vi.mock warns and will
// error in a future vitest). The getter defers `ctx.db` until a query fn
// actually reads `db`, which is always after `beforeAll` has set `ctx`.
vi.mock("@intake/db/client", () => ({
  get db() {
    return ctx.db;
  },
}));

async function insertWeights(
  rows: Array<ReturnType<typeof weightFixture>>,
): Promise<void> {
  // Chunk to stay well under Postgres' 65535 bind-parameter ceiling
  // (weight_records has ~9 columns; 500 rows ≈ 4.5k params).
  for (let i = 0; i < rows.length; i += 500) {
    await ctx.db.insert(schema.weightRecords).values(rows.slice(i, i + 500));
  }
}

beforeAll(async () => {
  ctx = await setupTestDb();
  queries = await import("@/lib/mcp/queries");

  // A second user, so cross-user scoping can be asserted (FK to users_sync).
  await ctx.pool.query(
    `INSERT INTO neon_auth.users_sync (id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [OTHER_USER_ID],
  );
}, 60_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await ctx?.teardown();
}, 30_000);

beforeEach(async () => {
  await ctx.db.delete(schema.weightRecords);
});

describe("MCP query fns — queryWeightHistory (real Postgres)", () => {
  it("is user-scoped: never returns another user's rows", async () => {
    await insertWeights([
      weightFixture(ctx.testUserId, { weight: 70 }),
      weightFixture(OTHER_USER_ID, { weight: 99 }),
    ]);

    const { items, truncated } = await queries.queryWeightHistory(
      ctx.testUserId,
      FULL_RANGE,
    );

    expect(truncated).toBe(false);
    expect(items).toHaveLength(1);
    expect(items[0]?.weight).toBe(70);
  });

  it("excludes soft-deleted (tombstoned) rows", async () => {
    await insertWeights([
      weightFixture(ctx.testUserId, { weight: 71 }),
      weightFixture(ctx.testUserId, { weight: 200, deletedAt: Date.now() }),
    ]);

    const { items } = await queries.queryWeightHistory(
      ctx.testUserId,
      FULL_RANGE,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.weight).toBe(71);
  });

  it("filters to the requested time range, oldest first", async () => {
    await insertWeights([
      weightFixture(ctx.testUserId, { weight: 60, timestamp: 1_000 }),
      weightFixture(ctx.testUserId, { weight: 61, timestamp: 5_000 }),
      weightFixture(ctx.testUserId, { weight: 62, timestamp: 6_000 }),
      weightFixture(ctx.testUserId, { weight: 63, timestamp: 10_000 }),
    ]);

    const { items } = await queries.queryWeightHistory(ctx.testUserId, {
      start: 2_000,
      end: 8_000,
    });

    expect(items.map((r) => r.weight)).toEqual([61, 62]);
  });

  it("caps at MAX_ROWS (5000) and flags truncated when there are more", async () => {
    const rows = Array.from({ length: 5001 }, (_, i) =>
      weightFixture(ctx.testUserId, { timestamp: 1_000 + i }),
    );
    await insertWeights(rows);

    const { items, truncated } = await queries.queryWeightHistory(
      ctx.testUserId,
      FULL_RANGE,
    );

    expect(items).toHaveLength(5000);
    expect(truncated).toBe(true);
  });

  it("returns exactly MAX_ROWS without truncation at the boundary", async () => {
    const rows = Array.from({ length: 5000 }, (_, i) =>
      weightFixture(ctx.testUserId, { timestamp: 1_000 + i }),
    );
    await insertWeights(rows);

    const { items, truncated } = await queries.queryWeightHistory(
      ctx.testUserId,
      FULL_RANGE,
    );

    expect(items).toHaveLength(5000);
    expect(truncated).toBe(false);
  });
});
