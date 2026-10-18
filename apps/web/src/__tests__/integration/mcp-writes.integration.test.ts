/**
 * Integration tests for the MCP log writes (`src/lib/mcp/writes.ts`) against
 * a real Postgres database.
 *
 * The writes go straight to the server mirror, so what matters is that the
 * rows look like the app's own: one group per entry, the app's intake
 * sources, a fresh server stamp so the next pull brings them down, and a
 * shape the push validator accepts when the app later edits and pushes the
 * row back. Delete must reach only the connector's own entries and only the
 * caller's rows.
 *
 * Wiring as in mcp-queries.integration.test.ts: a lazy `vi.mock` getter swaps
 * the db client for the testcontainer, and the SUT is imported after setup.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, type TestDbContext } from "@/__tests__/helpers/test-db";
import { eatingFixture, intakeFixture } from "@/__tests__/helpers/mcp-query-fixtures";
import * as schema from "@intake/db/schema";
import { opSchema_, type TableName } from "@intake/db/sync-payload";
import type * as WritesMod from "@/lib/mcp/writes";

const OTHER_USER_ID = "other-user-integration";
const NOW = 1_790_000_000_000;
const EATEN_AT = NOW - 30 * 60_000;

let ctx: TestDbContext;
let writes: typeof WritesMod;

vi.mock("@intake/db/client", () => ({
  get db() {
    return ctx.db;
  },
}));

beforeAll(async () => {
  ctx = await setupTestDb();
  writes = await import("@/lib/mcp/writes");
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
  await ctx.db.delete(schema.substanceRecords);
  await ctx.db.delete(schema.intakeRecords);
  await ctx.db.delete(schema.eatingRecords);
});

async function groupRows(groupId: string) {
  const [eating, intakes, substances] = await Promise.all([
    ctx.db.select().from(schema.eatingRecords).where(eq(schema.eatingRecords.groupId, groupId)),
    ctx.db.select().from(schema.intakeRecords).where(eq(schema.intakeRecords.groupId, groupId)),
    ctx.db
      .select()
      .from(schema.substanceRecords)
      .where(eq(schema.substanceRecords.groupId, groupId)),
  ]);
  return { eating, intakes, substances };
}

/** The row as pull sends it, pushed back unchanged: the validator must accept it. */
function expectPushable(tableName: TableName, row: Record<string, unknown>) {
  const { serverUpdatedAt: _stamp, userId: _user, ...pulled } = row;
  const parsed = opSchema_.safeParse({ queueId: 1, op: "upsert", tableName, row: pulled });
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
}

describe("logFood", () => {
  it("writes one eating record and its intakes as one group, like the Food card", async () => {
    const result = await writes.logFood(
      ctx.testUserId,
      {
        description: "Chicken laksa, 1 bowl",
        grams: 450.4,
        waterMl: 300,
        sodiumMg: 1200,
        sugarG: 6,
        potassiumMg: 0.4, // rounds to nothing: no row
        timestamp: EATEN_AT,
        timezone: "Europe/Berlin",
      },
      NOW,
    );

    const { eating, intakes, substances } = await groupRows(result.group_id);
    expect(eating).toHaveLength(1);
    expect(eating[0]).toMatchObject({
      userId: ctx.testUserId,
      note: "Chicken laksa, 1 bowl",
      grams: 450,
      timestamp: EATEN_AT,
      timezone: "Europe/Berlin",
      groupSource: "mcp_food",
      deletedAt: null,
      serverUpdatedAt: NOW,
    });
    expect(
      intakes.map((r) => [r.type, r.amount, r.source]).sort(),
    ).toEqual([
      ["salt", 1200, "manual:sodium"],
      ["sugar", 6, "manual:sugar"],
      ["water", 300, "manual:food_water_content"],
    ]);
    expect(substances).toHaveLength(0);
    expect(result.logged).toEqual({
      description: "Chicken laksa, 1 bowl",
      grams: 450,
      water_ml: 300,
      sodium_mg: 1200,
      sugar_g: 6,
    });

    expectPushable("eatingRecords", eating[0]!);
    for (const row of intakes) expectPushable("intakeRecords", row);
  });

  it("falls back to UTC when the user has no stored zone", async () => {
    const result = await writes.logFood(
      ctx.testUserId,
      { description: "Toast", timestamp: EATEN_AT },
      NOW,
    );
    expect(result.timezone).toBe("UTC");
    const { eating, intakes } = await groupRows(result.group_id);
    expect(eating[0]?.grams).toBeNull();
    expect(intakes).toHaveLength(0);
  });
});

describe("logDrink", () => {
  it("writes the full volume as water, with caffeine and alcohol, like the Drink module", async () => {
    const result = await writes.logDrink(
      ctx.testUserId,
      {
        description: "Irish coffee",
        volumeMl: 250,
        caffeineMg: 80,
        abvPercent: 10,
        sugarG: 12,
        timestamp: EATEN_AT,
      },
      NOW,
    );

    const { eating, intakes, substances } = await groupRows(result.group_id);
    expect(eating).toHaveLength(0);
    expect(intakes.map((r) => [r.type, r.amount, r.source]).sort()).toEqual([
      ["sugar", 12, "manual:sugar"],
      ["water", 250, "drink"],
    ]);
    const byType = Object.fromEntries(substances.map((s) => [s.type, s]));
    expect(byType.caffeine).toMatchObject({ amountMg: 80, volumeMl: 250, source: "standalone" });
    // 250 ml × 10 % × 0.789 g/ml ÷ 10 g = 1.97 standard drinks.
    expect(byType.alcohol).toMatchObject({ abvPercent: 10, amountStandardDrinks: 1.97 });
    expect(result.logged).toMatchObject({ caffeine_mg: 80, standard_drinks: 1.97 });

    for (const row of intakes) expectPushable("intakeRecords", row);
    for (const row of substances) expectPushable("substanceRecords", row);
  });
});

describe("deleteLoggedEntry", () => {
  it("tombstones every row of a connector entry with a fresh server stamp", async () => {
    const { group_id } = await writes.logDrink(
      ctx.testUserId,
      { description: "Latte", volumeMl: 300, caffeineMg: 120, timestamp: EATEN_AT },
      NOW,
    );

    const result = await writes.deleteLoggedEntry(ctx.testUserId, group_id, NOW + 1000);
    expect(result).toEqual({ deleted: true, group_id, rows: 2 });

    const { intakes, substances } = await groupRows(group_id);
    for (const row of [...intakes, ...substances]) {
      expect(row.deletedAt).toBe(NOW + 1000);
      expect(row.updatedAt).toBe(NOW + 1000);
      expect(row.serverUpdatedAt).toBe(NOW + 1000);
    }
    expect(await writes.deleteLoggedEntry(ctx.testUserId, group_id, NOW + 2000)).toEqual({
      deleted: false,
      reason: "not_found",
    });
  });

  it("refuses an entry the user logged in the app", async () => {
    const groupId = "app-group-1";
    await ctx.db
      .insert(schema.eatingRecords)
      .values(eatingFixture(ctx.testUserId, { groupId, groupSource: "ai_food_parse" }));
    await ctx.db
      .insert(schema.intakeRecords)
      .values(intakeFixture(ctx.testUserId, { groupId, groupSource: "ai_food_parse" }));

    expect(await writes.deleteLoggedEntry(ctx.testUserId, groupId, NOW)).toEqual({
      deleted: false,
      reason: "not_connector_entry",
    });
    const { eating, intakes } = await groupRows(groupId);
    expect([...eating, ...intakes].every((r) => r.deletedAt === null)).toBe(true);
  });

  it("never reaches another user's rows", async () => {
    const { group_id } = await writes.logFood(
      OTHER_USER_ID,
      { description: "Their lunch", timestamp: EATEN_AT },
      NOW,
    );
    expect(await writes.deleteLoggedEntry(ctx.testUserId, group_id, NOW)).toEqual({
      deleted: false,
      reason: "not_found",
    });
    const { eating } = await groupRows(group_id);
    expect(eating[0]?.deletedAt).toBeNull();
  });
});
