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
import {
  weightFixture,
  substanceFixture,
  intakeFixture,
  eatingFixture,
  prescriptionFixture,
  medicationPhaseFixture,
  phaseScheduleFixture,
  doseLogFixture,
  inventoryItemFixture,
  inventoryTxFixture,
} from "@/__tests__/helpers/mcp-query-fixtures";
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
  // Delete in FK-dependency order (children before parents).
  await ctx.db.delete(schema.weightRecords);
  await ctx.db.delete(schema.substanceRecords); // FK → intake
  await ctx.db.delete(schema.intakeRecords);
  await ctx.db.delete(schema.eatingRecords);
  await ctx.db.delete(schema.inventoryTransactions); // FK → inventoryItems, doseLogs
  await ctx.db.delete(schema.doseLogs); // FK → prescription/phase/schedule/inventory
  await ctx.db.delete(schema.inventoryItems); // FK → prescriptions
  await ctx.db.delete(schema.phaseSchedules); // FK → phases
  await ctx.db.delete(schema.medicationPhases); // FK → prescriptions
  await ctx.db.delete(schema.prescriptions);
  await ctx.db.delete(schema.titrationPlans);
  await ctx.db.delete(schema.urinationRecords);
});

/** Seed a prescription → phase → schedule chain; returns the FK refs. */
async function seedMedChain(
  userId: string,
  prescriptionOverrides: Parameters<typeof prescriptionFixture>[1] = {},
) {
  const presc = prescriptionFixture(userId, prescriptionOverrides);
  await ctx.db.insert(schema.prescriptions).values(presc);
  const phase = medicationPhaseFixture(userId, presc.id);
  await ctx.db.insert(schema.medicationPhases).values(phase);
  const sched = phaseScheduleFixture(userId, phase.id);
  await ctx.db.insert(schema.phaseSchedules).values(sched);
  return {
    prescriptionId: presc.id,
    phaseId: phase.id,
    scheduleId: sched.id,
    presc,
  };
}

/** Seed a prescription + one inventory item; returns the item id. */
async function seedInventoryItem(
  userId: string,
  itemOverrides: Parameters<typeof inventoryItemFixture>[2] = {},
) {
  const presc = prescriptionFixture(userId);
  await ctx.db.insert(schema.prescriptions).values(presc);
  const item = inventoryItemFixture(userId, presc.id, itemOverrides);
  await ctx.db.insert(schema.inventoryItems).values(item);
  return item.id;
}

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

describe("MCP query fns — querySubstanceHistory (real Postgres)", () => {
  it("filters by substance type, and 'all' returns both", async () => {
    await ctx.db.insert(schema.substanceRecords).values([
      substanceFixture(ctx.testUserId, { type: "caffeine", timestamp: 10 }),
      substanceFixture(ctx.testUserId, {
        type: "alcohol",
        description: "Red wine",
        timestamp: 20,
      }),
    ]);

    const caffeine = await queries.querySubstanceHistory(
      ctx.testUserId,
      "caffeine",
      FULL_RANGE,
    );
    expect(caffeine.items.map((r) => r.type)).toEqual(["caffeine"]);

    const alcohol = await queries.querySubstanceHistory(
      ctx.testUserId,
      "alcohol",
      FULL_RANGE,
    );
    expect(alcohol.items.map((r) => r.type)).toEqual(["alcohol"]);

    const all = await queries.querySubstanceHistory(
      ctx.testUserId,
      "all",
      FULL_RANGE,
    );
    expect(all.items.map((r) => r.type)).toEqual(["caffeine", "alcohol"]);
  });

  it("exposes the alcohol fields (ABV %, standard drinks, volume) that were previously unreachable", async () => {
    await ctx.db.insert(schema.substanceRecords).values(
      substanceFixture(ctx.testUserId, {
        type: "alcohol",
        description: "Espresso martini",
        source: "eating",
        groupId: "grp-1",
        groupSource: "voice",
        abvPercent: 20,
        amountStandardDrinks: 1.5,
        volumeMl: 120,
      }),
    );

    const { items } = await queries.querySubstanceHistory(
      ctx.testUserId,
      "alcohol",
      FULL_RANGE,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "alcohol",
      abvPercent: 20,
      amountStandardDrinks: 1.5,
      volumeMl: 120,
      groupId: "grp-1",
      groupSource: "voice",
      description: "Espresso martini",
    });
  });

  it("is user-scoped and excludes tombstoned rows", async () => {
    await ctx.db.insert(schema.substanceRecords).values([
      substanceFixture(ctx.testUserId, { description: "mine" }),
      substanceFixture(ctx.testUserId, {
        description: "deleted",
        deletedAt: Date.now(),
      }),
      substanceFixture(OTHER_USER_ID, { description: "theirs" }),
    ]);

    const { items } = await queries.querySubstanceHistory(
      ctx.testUserId,
      "all",
      FULL_RANGE,
    );

    expect(items.map((r) => r.description)).toEqual(["mine"]);
  });

  it("filters to the requested time range, oldest first", async () => {
    await ctx.db.insert(schema.substanceRecords).values([
      substanceFixture(ctx.testUserId, { description: "a", timestamp: 1_000 }),
      substanceFixture(ctx.testUserId, { description: "b", timestamp: 5_000 }),
      substanceFixture(ctx.testUserId, { description: "c", timestamp: 9_000 }),
    ]);

    const { items } = await queries.querySubstanceHistory(ctx.testUserId, "all", {
      start: 2_000,
      end: 8_000,
    });

    expect(items.map((r) => r.description)).toEqual(["b"]);
  });
});

describe("MCP query fns — queryIntakeHistory linkage (real Postgres)", () => {
  it("hydrates substance:<id> water rows and exposes groupId/groupSource, leaving plain rows null", async () => {
    const sub = substanceFixture(ctx.testUserId, {
      type: "alcohol",
      description: "Negroni",
      abvPercent: 24,
      amountStandardDrinks: 2,
      amountMg: null,
    });
    await ctx.db.insert(schema.substanceRecords).values(sub);
    await ctx.db.insert(schema.intakeRecords).values([
      intakeFixture(ctx.testUserId, {
        amount: 90,
        source: `substance:${sub.id}`,
        groupId: "grp-9",
        groupSource: "voice",
        timestamp: 100,
      }),
      intakeFixture(ctx.testUserId, {
        amount: 250,
        source: "manual",
        timestamp: 200,
      }),
    ]);

    const { items } = await queries.queryIntakeHistory(
      ctx.testUserId,
      "all",
      FULL_RANGE,
    );

    expect(items).toHaveLength(2);
    const [drink, plain] = items;
    // Water amount is untouched — totals stay honest.
    expect(drink?.amount).toBe(90);
    expect(drink?.groupId).toBe("grp-9");
    expect(drink?.groupSource).toBe("voice");
    expect(drink?.substance).toMatchObject({
      substanceType: "alcohol",
      description: "Negroni",
      abvPercent: 24,
      amountStandardDrinks: 2,
      amountMg: null,
    });
    expect(plain?.substance).toBeNull();
  });

  it("does not hydrate a tombstoned substance", async () => {
    const sub = substanceFixture(ctx.testUserId, { deletedAt: Date.now() });
    await ctx.db.insert(schema.substanceRecords).values(sub);
    await ctx.db.insert(schema.intakeRecords).values(
      intakeFixture(ctx.testUserId, { source: `substance:${sub.id}` }),
    );

    const { items } = await queries.queryIntakeHistory(
      ctx.testUserId,
      "all",
      FULL_RANGE,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.substance).toBeNull();
  });

  it("does not hydrate another user's substance (scope guard)", async () => {
    const sub = substanceFixture(OTHER_USER_ID);
    await ctx.db.insert(schema.substanceRecords).values(sub);
    await ctx.db.insert(schema.intakeRecords).values(
      intakeFixture(ctx.testUserId, { source: `substance:${sub.id}` }),
    );

    const { items } = await queries.queryIntakeHistory(
      ctx.testUserId,
      "all",
      FULL_RANGE,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.substance).toBeNull();
  });
});

describe("MCP query fns — queryEatingHistory (real Postgres)", () => {
  it("returns food rows with groupId and no embedded substances field", async () => {
    await ctx.db.insert(schema.eatingRecords).values([
      eatingFixture(ctx.testUserId, {
        grams: 150,
        groupId: "grp-1",
        timestamp: 100,
      }),
      eatingFixture(ctx.testUserId, { grams: 200, timestamp: 200 }),
    ]);

    const result = await queries.queryEatingHistory(ctx.testUserId, FULL_RANGE);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.groupId).toBe("grp-1");
    // A3: the misleading groupId-only substances join was removed —
    // query_substance_history is the source of truth now.
    expect(result).not.toHaveProperty("substances");
    expect(result.truncated).toBe(false);
  });

  it("is user-scoped and excludes tombstoned rows", async () => {
    await ctx.db.insert(schema.eatingRecords).values([
      eatingFixture(ctx.testUserId, { note: "mine" }),
      eatingFixture(ctx.testUserId, { note: "deleted", deletedAt: Date.now() }),
      eatingFixture(OTHER_USER_ID, { note: "theirs" }),
    ]);

    const { items } = await queries.queryEatingHistory(
      ctx.testUserId,
      FULL_RANGE,
    );

    expect(items.map((r) => r.note)).toEqual(["mine"]);
  });
});

describe("MCP query fns — listRecentDoses name resolution (real Postgres)", () => {
  it("resolves a live prescription's name with archived=false", async () => {
    const refs = await seedMedChain(ctx.testUserId, {
      genericName: "Bisoprolol",
    });
    await ctx.db
      .insert(schema.doseLogs)
      .values(doseLogFixture(ctx.testUserId, refs));

    const { doses } = await queries.listRecentDoses(ctx.testUserId, 50);

    expect(doses).toHaveLength(1);
    expect(doses[0]?.genericName).toBe("Bisoprolol");
    expect(doses[0]?.archived).toBe(false);
  });

  it("resolves a SOFT-deleted prescription's name with archived=true", async () => {
    const refs = await seedMedChain(ctx.testUserId, {
      genericName: "Spironolactone",
      deletedAt: Date.now(),
    });
    await ctx.db
      .insert(schema.doseLogs)
      .values(doseLogFixture(ctx.testUserId, refs));

    const { doses } = await queries.listRecentDoses(ctx.testUserId, 50);

    expect(doses).toHaveLength(1);
    expect(doses[0]?.genericName).toBe("Spironolactone");
    expect(doses[0]?.archived).toBe(true);
  });

  it("returns archived=null and no name for an unmatched (another user's) prescription", async () => {
    // The chain is OTHER_USER's; a testUser-owned dose references those ids
    // (FKs check existence, not ownership). The userId-scoped join must find no
    // match — no name leak — and archived must be null, NOT false. A bare
    // `deletedAt IS NOT NULL` would return false here (NULL IS NOT NULL = FALSE).
    const refs = await seedMedChain(OTHER_USER_ID, { genericName: "Secret" });
    await ctx.db
      .insert(schema.doseLogs)
      .values(doseLogFixture(ctx.testUserId, refs));

    const { doses } = await queries.listRecentDoses(ctx.testUserId, 50);

    expect(doses).toHaveLength(1);
    expect(doses[0]?.genericName).toBeNull();
    expect(doses[0]?.archived).toBeNull();
  });

  it("excludes tombstoned dose logs", async () => {
    const refs = await seedMedChain(ctx.testUserId);
    await ctx.db.insert(schema.doseLogs).values([
      doseLogFixture(ctx.testUserId, refs, { note: "live" }),
      doseLogFixture(ctx.testUserId, refs, {
        note: "gone",
        deletedAt: Date.now(),
      }),
    ]);

    const { doses } = await queries.listRecentDoses(ctx.testUserId, 50);

    expect(doses.map((d) => d.note)).toEqual(["live"]);
  });
});

describe("MCP query fns — listMedications schedule times (real Postgres)", () => {
  it("returns authoritative scheduleTimeUTC + anchorTimezone alongside deprecated time", async () => {
    await seedMedChain(ctx.testUserId, { genericName: "Vymada" });

    const { medications } = await queries.listMedications(ctx.testUserId);

    expect(medications).toHaveLength(1);
    const sched = medications[0]?.active_phases[0]?.schedules[0];
    expect(sched?.time).toBe("08:00");
    expect(sched?.scheduleTimeUTC).toBe(360);
    expect(sched?.anchorTimezone).toBe("UTC");
  });
});

describe("MCP query fns — getInventoryStatus authoritative stock (real Postgres)", () => {
  it("computes stock as the signed sum of transactions (incl. a positive 'consumed' reversal)", async () => {
    const itemId = await seedInventoryItem(ctx.testUserId);
    await ctx.db.insert(schema.inventoryTransactions).values([
      inventoryTxFixture(ctx.testUserId, itemId, { type: "initial", amount: 30 }),
      inventoryTxFixture(ctx.testUserId, itemId, {
        type: "consumed",
        amount: -10,
      }),
      // An "untake" writes a POSITIVE consumed reversal — must count as +5.
      inventoryTxFixture(ctx.testUserId, itemId, {
        type: "consumed",
        amount: 5,
      }),
      inventoryTxFixture(ctx.testUserId, itemId, { type: "refill", amount: 20 }),
    ]);

    const { inventory } = await queries.getInventoryStatus(ctx.testUserId);

    expect(inventory).toHaveLength(1);
    expect(inventory[0]?.stock).toBe(45);
  });

  it("excludes tombstoned and other-user transactions from the sum", async () => {
    const itemId = await seedInventoryItem(ctx.testUserId);
    await ctx.db.insert(schema.inventoryTransactions).values([
      inventoryTxFixture(ctx.testUserId, itemId, { amount: 30 }),
      inventoryTxFixture(ctx.testUserId, itemId, {
        amount: 100,
        deletedAt: Date.now(),
      }),
      inventoryTxFixture(OTHER_USER_ID, itemId, { amount: 999 }),
    ]);

    const { inventory } = await queries.getInventoryStatus(ctx.testUserId);

    expect(inventory[0]?.stock).toBe(30);
  });

  it("reports 0 for transactions that net to zero (real balance, not the fallback)", async () => {
    // currentStock is 999, but SUM=0 (not NULL) must win — COALESCE only falls
    // through on NULL (zero rows), not on a real zero balance.
    const itemId = await seedInventoryItem(ctx.testUserId, { currentStock: 999 });
    await ctx.db.insert(schema.inventoryTransactions).values([
      inventoryTxFixture(ctx.testUserId, itemId, { amount: 10 }),
      inventoryTxFixture(ctx.testUserId, itemId, {
        type: "consumed",
        amount: -10,
      }),
    ]);

    const { inventory } = await queries.getInventoryStatus(ctx.testUserId);

    expect(inventory[0]?.stock).toBe(0);
  });

  it("falls back to 0 for a legacy item with no transactions and null currentStock", async () => {
    await seedInventoryItem(ctx.testUserId);

    const { inventory } = await queries.getInventoryStatus(ctx.testUserId);

    expect(inventory[0]?.stock).toBe(0);
  });

  it("falls back to the legacy currentStock for a zero-transaction item", async () => {
    await seedInventoryItem(ctx.testUserId, { currentStock: 42 });

    const { inventory } = await queries.getInventoryStatus(ctx.testUserId);

    expect(inventory[0]?.stock).toBe(42);
  });

  it("allows negative stock (over-consumed) and returns compounds", async () => {
    const itemId = await seedInventoryItem(ctx.testUserId, {
      compounds: [
        { name: "sacubitril", strength: 49 },
        { name: "valsartan", strength: 51 },
      ],
    });
    await ctx.db.insert(schema.inventoryTransactions).values([
      inventoryTxFixture(ctx.testUserId, itemId, { amount: 10 }),
      inventoryTxFixture(ctx.testUserId, itemId, {
        type: "consumed",
        amount: -30,
      }),
    ]);

    const { inventory } = await queries.getInventoryStatus(ctx.testUserId);

    expect(inventory[0]?.stock).toBe(-20);
    expect(inventory[0]?.compounds).toEqual([
      { name: "sacubitril", strength: 49 },
      { name: "valsartan", strength: 51 },
    ]);
  });
});
