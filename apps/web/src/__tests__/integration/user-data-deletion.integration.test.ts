/**
 * Integration tests for the server-side user-data deletion paths against a
 * real Postgres database (audit sync-engine#6).
 *
 * The unit tests for /api/sync/wipe, /api/account/delete and
 * /api/sync/cleanup mock the DB, so they never exercised the inner foreign
 * keys between the synced tables (inventory_transactions.dose_log_id,
 * daily_notes.dose_log_id / prescription_id, substance_records.source_record_id
 * ...). None of those FKs cascade, so a wrong delete order fails with an FK
 * violation for any user who has logged a dose against inventory. These tests
 * seed exactly that dose-linked graph and run every deletion entry point.
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
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { setupTestDb, type TestDbContext } from "@/__tests__/helpers/test-db";
import * as schema from "@intake/db/schema";

let ctx: TestDbContext;

vi.mock("@intake/db/client", () => ({
  get db() {
    return ctx.db;
  },
}));

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "test-user-integration" },
      });
  },
}));

const OTHER_USER = "other-user";
const NOW = 1_700_000_000_000;
const base = () => ({
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  deviceId: "test-device",
});

/**
 * Seed a full medication graph for `userId`, including every inner FK that
 * does not cascade: a consumed inventory transaction and a daily note that
 * both point at a dose log, and a substance record that points at an intake.
 */
async function seedUser(userId: string) {
  const p = (id: string) => `${userId}-${id}`;
  await ctx.db.insert(schema.intakeRecords).values({
    id: p("intake"),
    userId,
    type: "water",
    amount: 250,
    timestamp: NOW,
    timezone: "UTC",
    ...base(),
  });
  await ctx.db.insert(schema.substanceRecords).values({
    id: p("substance"),
    userId,
    type: "caffeine",
    amountMg: 80,
    description: "Coffee",
    source: "water_intake",
    sourceRecordId: p("intake"),
    timestamp: NOW,
    timezone: "UTC",
    ...base(),
  });
  await ctx.db.insert(schema.prescriptions).values({
    id: p("rx"),
    userId,
    genericName: "Metoprolol",
    indication: "Hypertension",
    isActive: true,
    ...base(),
  });
  await ctx.db.insert(schema.titrationPlans).values({
    id: p("plan"),
    userId,
    title: "Ramp up",
    conditionLabel: "Hypertension",
    status: "active",
    ...base(),
  });
  await ctx.db.insert(schema.medicationPhases).values({
    id: p("phase"),
    userId,
    prescriptionId: p("rx"),
    titrationPlanId: p("plan"),
    type: "maintenance",
    unit: "mg",
    startDate: NOW,
    foodInstruction: "none",
    status: "active",
    ...base(),
  });
  await ctx.db.insert(schema.phaseSchedules).values({
    id: p("sched"),
    userId,
    phaseId: p("phase"),
    time: "08:00",
    scheduleTimeUTC: 360,
    anchorTimezone: "UTC",
    dosage: 1,
    daysOfWeek: [1],
    enabled: true,
    ...base(),
  });
  await ctx.db.insert(schema.inventoryItems).values({
    id: p("inv"),
    userId,
    prescriptionId: p("rx"),
    brandName: "Lopressor",
    strength: 50,
    unit: "mg",
    pillShape: "round",
    pillColor: "white",
    isActive: true,
    timezone: "UTC",
    ...base(),
  });
  await ctx.db.insert(schema.doseLogs).values({
    id: p("dose"),
    userId,
    prescriptionId: p("rx"),
    phaseId: p("phase"),
    scheduleId: p("sched"),
    inventoryItemId: p("inv"),
    scheduledDate: "2026-07-13",
    scheduledTime: "08:00",
    status: "taken",
    actionTimestamp: NOW,
    timezone: "UTC",
    ...base(),
  });
  await ctx.db.insert(schema.inventoryTransactions).values({
    id: p("tx"),
    userId,
    inventoryItemId: p("inv"),
    doseLogId: p("dose"),
    timestamp: NOW,
    amount: -1,
    type: "consumed",
    timezone: "UTC",
    ...base(),
  });
  await ctx.db.insert(schema.dailyNotes).values({
    id: p("note"),
    userId,
    date: "2026-07-13",
    prescriptionId: p("rx"),
    doseLogId: p("dose"),
    note: "Felt dizzy",
    timezone: "UTC",
    ...base(),
  });
  await ctx.db.insert(schema.userProfile).values({
    id: p("profile"),
    userId,
    conditions: ["Hypertension"],
    shareConditionsWithAI: false,
    ...base(),
  });
}

const SYNCED_TABLES = [
  schema.inventoryTransactions,
  schema.dailyNotes,
  schema.doseLogs,
  schema.inventoryItems,
  schema.phaseSchedules,
  schema.medicationPhases,
  schema.titrationPlans,
  schema.prescriptions,
  schema.substanceRecords,
  schema.auditLogs,
  schema.defecationRecords,
  schema.urinationRecords,
  schema.eatingRecords,
  schema.bloodPressureRecords,
  schema.weightRecords,
  schema.intakeRecords,
  schema.userProfile,
  schema.insightReports,
] as const;

async function countRows(userId: string): Promise<number> {
  let total = 0;
  for (const table of SYNCED_TABLES) {
    const rows = await ctx.db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.userId, userId));
    total += rows.length;
  }
  return total;
}

beforeAll(async () => {
  ctx = await setupTestDb();
  await ctx.pool.query(
    `INSERT INTO neon_auth.users_sync (id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [OTHER_USER],
  );
}, 60_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await ctx?.teardown();
}, 30_000);

beforeEach(async () => {
  // Children first — the same FK order the code under test must use.
  for (const table of SYNCED_TABLES) {
    await ctx.db.delete(table);
  }
  await seedUser(ctx.testUserId);
  await seedUser(OTHER_USER);
});

describe("user data deletion (real Postgres, dose-linked graph)", () => {
  it("wipeCloudData deletes every synced row despite dose-linked FKs", async () => {
    const { wipeCloudData } = await import("@/lib/user-data-deletion");
    expect(await countRows(ctx.testUserId)).toBeGreaterThan(0);

    const deleted = await wipeCloudData(ctx.testUserId);

    expect(deleted.doseLogs).toBe(1);
    expect(deleted.inventoryTransactions).toBe(1);
    expect(deleted.dailyNotes).toBe(1);
    expect(await countRows(ctx.testUserId)).toBe(0);
    // Another account's rows are untouched.
    expect(await countRows(OTHER_USER)).toBe(11);
  });

  it("deleteAllUserData deletes every synced row despite dose-linked FKs", async () => {
    const { deleteAllUserData } = await import("@/lib/user-data-deletion");

    await deleteAllUserData(ctx.testUserId);

    expect(await countRows(ctx.testUserId)).toBe(0);
    expect(await countRows(OTHER_USER)).toBe(11);
  });

  it("POST /api/sync/cleanup succeeds for a user with dose-linked data", async () => {
    const { POST } = await import("@/app/api/sync/cleanup/route");

    const res = await POST(
      new NextRequest("https://example.test/api/sync/cleanup", {
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: Record<string, number> };
    expect(body.deleted.doseLogs).toBe(1);
    expect(body.deleted.inventoryTransactions).toBe(1);
    // Cleanup only undoes a migration's record tables; the profile stays.
    const profiles = await ctx.db
      .select()
      .from(schema.userProfile)
      .where(eq(schema.userProfile.userId, ctx.testUserId));
    expect(profiles).toHaveLength(1);
    expect(await countRows(OTHER_USER)).toBe(11);
  });
});
