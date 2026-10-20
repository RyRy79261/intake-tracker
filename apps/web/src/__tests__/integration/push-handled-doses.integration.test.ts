/**
 * getHandledScheduleIds (lib/push-db.ts) against a real Postgres: which
 * doses get no server push at their slot time. Taken and skipped doses are
 * handled. A dose rescheduled to a new instant (`remind_at`) gets no push at
 * the old slot time either: the dormant server cannot send at the new time.
 * A pending dose, a legacy rescheduled row with no `remind_at`, a deleted
 * row and a row of another day are not handled.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  setupTestDb,
  type TestDbContext,
} from "@/__tests__/helpers/test-db";
import * as schema from "@intake/db/schema";

let ctx: TestDbContext;

// push-db runs its queries through the neon tagged template. Run the same
// text and parameters on the test database instead.
vi.mock("@neondatabase/serverless", () => ({
  neon: () => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + `$${i}` + part);
    const res = await ctx.pool.query(text, values);
    return res.rows;
  },
}));

const { getHandledScheduleIds } = await import("@/lib/push-db");

const NOW = 1_700_000_000_000;
const DATE = "2026-10-19";
const base = () => ({
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null as number | null,
  deviceId: "test-device",
});

const SCHEDULES = ["taken", "skipped", "moved", "legacy", "pending", "deleted", "otherday"];

beforeAll(async () => {
  ctx = await setupTestDb();
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
  for (const id of SCHEDULES) {
    await ctx.db.insert(schema.phaseSchedules).values({
      id,
      userId,
      phaseId: "phase-1",
      time: "08:30",
      scheduleTimeUTC: 510,
      anchorTimezone: "UTC",
      dosage: 1,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      enabled: true,
      ...base(),
    });
  }
  const log = (
    scheduleId: string,
    status: "taken" | "skipped" | "rescheduled" | "pending",
    extra: { remindAt?: number; scheduledDate?: string; deletedAt?: number } = {},
  ) => ({
    id: `log-${scheduleId}`,
    userId,
    prescriptionId: "presc-1",
    phaseId: "phase-1",
    scheduleId,
    scheduledDate: extra.scheduledDate ?? DATE,
    scheduledTime: "08:30",
    status,
    actionTimestamp: NOW,
    timezone: "UTC",
    ...base(),
    ...(extra.remindAt !== undefined && { remindAt: extra.remindAt }),
    ...(extra.deletedAt !== undefined && { deletedAt: extra.deletedAt }),
  });
  await ctx.db.insert(schema.doseLogs).values([
    log("taken", "taken"),
    log("skipped", "skipped"),
    log("moved", "rescheduled", { remindAt: NOW + 3_600_000 }),
    log("legacy", "rescheduled"),
    log("pending", "pending"),
    log("deleted", "taken", { deletedAt: NOW }),
    log("otherday", "taken", { scheduledDate: "2026-10-18" }),
  ]);
}, 60_000);

afterAll(async () => {
  await ctx?.teardown();
}, 30_000);

describe("getHandledScheduleIds (real Postgres)", () => {
  it("skips taken, skipped and moved doses; a rescheduled dose with a new time is not pushed at its old time", async () => {
    const handled = await getHandledScheduleIds(ctx.testUserId, DATE, SCHEDULES);
    expect([...handled].sort()).toEqual(["moved", "skipped", "taken"]);
  });

  it("returns nothing for no schedules", async () => {
    expect((await getHandledScheduleIds(ctx.testUserId, DATE, [])).size).toBe(0);
  });
});
