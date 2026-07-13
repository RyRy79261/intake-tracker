/**
 * Integration tests for the PRN dose-logging schema change (migration 0019)
 * against a real Postgres database.
 *
 * Verifies the DB-level invariants a mocked stub cannot: dose_logs.phase_id /
 * schedule_id are now nullable, `kind` defaults to 'scheduled' and is
 * CHECK-constrained, and the cross-field CHECK enforces that a scheduled dose
 * carries both phase and schedule while a PRN dose need not.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { eq } from "drizzle-orm";
import {
  setupTestDb,
  type TestDbContext,
} from "@/__tests__/helpers/test-db";
import * as schema from "@intake/db/schema";

const NOW = 1_700_000_000_000;
const base = () => ({
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  deviceId: "test-device",
});

let ctx: TestDbContext;

/** Seed a prescription (+ phase + schedule) so dose FKs are satisfiable. */
async function seedChain() {
  const userId = ctx.testUserId;
  await ctx.db.insert(schema.prescriptions).values({
    id: "presc-1",
    userId,
    genericName: "Furosemide",
    indication: "Heart failure",
    isActive: true,
    ...base(),
  });
  await ctx.db.insert(schema.medicationPhases).values({
    id: "phase-1",
    userId,
    prescriptionId: "presc-1",
    type: "maintenance",
    unit: "mg",
    startDate: NOW,
    foodInstruction: "none",
    status: "active",
    ...base(),
  });
  await ctx.db.insert(schema.phaseSchedules).values({
    id: "sched-1",
    userId,
    phaseId: "phase-1",
    time: "08:00",
    scheduleTimeUTC: 360,
    anchorTimezone: "UTC",
    dosage: 1,
    daysOfWeek: [1],
    enabled: true,
    ...base(),
  });
}

const doseBase = () => ({
  userId: ctx.testUserId,
  prescriptionId: "presc-1",
  scheduledDate: "2026-07-13",
  scheduledTime: "08:00",
  status: "taken" as const,
  actionTimestamp: NOW,
  timezone: "UTC",
  ...base(),
});

beforeAll(async () => {
  ctx = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await ctx?.teardown();
}, 30_000);

beforeEach(async () => {
  await ctx.db.delete(schema.doseLogs);
  await ctx.db.delete(schema.phaseSchedules);
  await ctx.db.delete(schema.medicationPhases);
  await ctx.db.delete(schema.prescriptions);
  await seedChain();
});

/**
 * Assert an insert is rejected by a specific CHECK constraint. drizzle wraps
 * the pg error, so the constraint name lives on the `.constraint` property of
 * the underlying node-postgres error (drizzle's `.cause`), not the wrapper's
 * message.
 */
async function expectConstraintViolation(
  fn: () => Promise<unknown>,
  constraint: string,
) {
  let error: unknown;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  expect(error, "expected the insert to be rejected").toBeDefined();
  const cause = (
    error as { cause?: { constraint?: string; message?: string } }
  )?.cause;
  const haystack = `${cause?.constraint ?? ""} ${cause?.message ?? ""} ${
    (error as Error)?.message ?? ""
  }`;
  expect(haystack).toContain(constraint);
}

describe("dose_logs PRN schema (migration 0019, real Postgres)", () => {
  it("accepts a PRN dose with null phase/schedule and an explicit dose_mg", async () => {
    await ctx.db.insert(schema.doseLogs).values({
      id: "dose-prn",
      kind: "prn",
      phaseId: null,
      scheduleId: null,
      doseMg: 40,
      ...doseBase(),
    });

    const rows = await ctx.db
      .select()
      .from(schema.doseLogs)
      .where(eq(schema.doseLogs.id, "dose-prn"));
    expect(rows[0]?.kind).toBe("prn");
    expect(rows[0]?.phaseId).toBeNull();
    expect(rows[0]?.doseMg).toBe(40);
  });

  it("defaults kind to 'scheduled' when omitted", async () => {
    await ctx.db.insert(schema.doseLogs).values({
      id: "dose-sched",
      phaseId: "phase-1",
      scheduleId: "sched-1",
      ...doseBase(),
    });

    const rows = await ctx.db
      .select()
      .from(schema.doseLogs)
      .where(eq(schema.doseLogs.id, "dose-sched"));
    expect(rows[0]?.kind).toBe("scheduled");
  });

  it("rejects a scheduled dose missing its phase/schedule (kind_fields_check)", async () => {
    await expectConstraintViolation(
      () =>
        ctx.db.insert(schema.doseLogs).values({
          id: "dose-bad",
          kind: "scheduled",
          phaseId: null,
          scheduleId: null,
          ...doseBase(),
        }),
      "dose_logs_kind_fields_check",
    );
  });

  it("rejects an unknown kind (kind_check)", async () => {
    await expectConstraintViolation(
      () =>
        ctx.db.insert(schema.doseLogs).values({
          id: "dose-bad-kind",
          kind: "whenever",
          phaseId: "phase-1",
          scheduleId: "sched-1",
          ...doseBase(),
        }),
      "dose_logs_kind_check",
    );
  });
});
