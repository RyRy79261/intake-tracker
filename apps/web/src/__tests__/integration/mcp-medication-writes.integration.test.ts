/**
 * Integration tests for the MCP medication writes
 * (`src/lib/mcp/medication-writes.ts`) against a real Postgres database.
 *
 * The rows must be the ones the app itself writes (dose-log-service,
 * inventory-service), so the device reads them as its own after a pull: the
 * deterministic scheduled-dose id, the dose snapshot, the consumed / refill
 * transaction, the cached stock, the synced audit row, a fresh server stamp
 * and a shape the push validator accepts. Scope: only the caller's rows,
 * and delete only the connector's own.
 *
 * Wiring as in mcp-writes.integration.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { setupTestDb, type TestDbContext } from "@/__tests__/helpers/test-db";
import {
  doseLogFixture,
  inventoryItemFixture,
  inventoryTxFixture,
  medicationPhaseFixture,
  phaseScheduleFixture,
  prescriptionFixture,
} from "@/__tests__/helpers/mcp-query-fixtures";
import * as schema from "@intake/db/schema";
import { opSchema_, type TableName } from "@intake/db/sync-payload";
import type * as MedWritesMod from "@/lib/mcp/medication-writes";

const OTHER_USER_ID = "other-user-med-integration";
// 2026-09-21T14:13:20Z, a Monday.
const NOW = 1_790_000_000_000;
const TODAY = "2026-09-21";
const YESTERDAY = "2026-09-20";
const TOMORROW = "2026-09-22";
const DAY_MS = 24 * 60 * 60_000;
const TZ = "UTC";

let ctx: TestDbContext;
let med: typeof MedWritesMod;

vi.mock("@intake/db/client", () => ({
  get db() {
    return ctx.db;
  },
}));

beforeAll(async () => {
  ctx = await setupTestDb();
  med = await import("@/lib/mcp/medication-writes");
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
  await ctx.db.delete(schema.auditLogs);
  await ctx.db.delete(schema.inventoryTransactions);
  await ctx.db.delete(schema.doseLogs);
  await ctx.db.delete(schema.inventoryItems);
  await ctx.db.delete(schema.phaseSchedules);
  await ctx.db.delete(schema.medicationPhases);
  await ctx.db.delete(schema.prescriptions);
});

interface Regimen {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  itemId: string;
}

/** A medicine with one daily 08:00 dose of 20 mg and 40 mg pills, 30 in stock. */
async function seedRegimen(userId: string, opts: { stock?: boolean } = {}): Promise<Regimen> {
  const created = NOW - 30 * DAY_MS;
  const presc = prescriptionFixture(userId, { genericName: "Furosemide", createdAt: created, updatedAt: created });
  await ctx.db.insert(schema.prescriptions).values(presc);
  const phase = medicationPhaseFixture(userId, presc.id, { startDate: created, createdAt: created });
  await ctx.db.insert(schema.medicationPhases).values(phase);
  const sched = phaseScheduleFixture(userId, phase.id, { dosage: 20, unit: "mg", time: "08:00" });
  await ctx.db.insert(schema.phaseSchedules).values(sched);
  let itemId = "";
  if (opts.stock !== false) {
    const item = inventoryItemFixture(userId, presc.id, { strength: 40, currentStock: 30 });
    await ctx.db.insert(schema.inventoryItems).values(item);
    await ctx.db.insert(schema.inventoryTransactions).values(
      inventoryTxFixture(userId, item.id, { amount: 30, type: "initial" }),
    );
    itemId = item.id;
  }
  return { prescriptionId: presc.id, phaseId: phase.id, scheduleId: sched.id, itemId };
}

async function doseLog(id: string) {
  const rows = await ctx.db.select().from(schema.doseLogs).where(eq(schema.doseLogs.id, id));
  return rows[0]!;
}

async function item(id: string) {
  const rows = await ctx.db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id));
  return rows[0]!;
}

async function txsOf(itemId: string) {
  return ctx.db
    .select()
    .from(schema.inventoryTransactions)
    .where(eq(schema.inventoryTransactions.inventoryItemId, itemId));
}

async function audits() {
  return ctx.db.select().from(schema.auditLogs);
}

/** The row as pull sends it, pushed back unchanged: the validator must accept it. */
function expectPushable(tableName: TableName, row: Record<string, unknown>) {
  const { serverUpdatedAt: _stamp, userId: _user, ...pulled } = row;
  const parsed = opSchema_.safeParse({ queueId: 1, op: "upsert", tableName, row: pulled });
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
}

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r as Extract<T, { ok: true }>;
}

describe("logDose — taken", () => {
  it("writes the deterministic log with its snapshot and takes the pills out of stock", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const takenAt = NOW - 6 * 60 * 60_000;
    const res = ok(
      await med.logDose(
        ctx.testUserId,
        { scheduleId: r.scheduleId, date: TODAY, action: "taken", takenAt, timezone: TZ },
        NOW,
      ),
    );

    expect(res.dose_log_id).toBe(med.scheduledDoseLogId(r.scheduleId, TODAY));
    expect(res).toMatchObject({
      status: "taken",
      changed: true,
      pills_consumed: 0.5,
      prescription_name: "Furosemide",
      time: "08:00",
      stock: { inventory_item_id: r.itemId, change: -0.5, stock_after: 29.5 },
    });

    const log = await doseLog(res.dose_log_id);
    expect(log).toMatchObject({
      userId: ctx.testUserId,
      prescriptionId: r.prescriptionId,
      phaseId: r.phaseId,
      scheduleId: r.scheduleId,
      kind: "scheduled",
      scheduledDate: TODAY,
      scheduledTime: "08:00",
      status: "taken",
      actionTimestamp: takenAt,
      doseAmount: 20,
      doseUnit: "mg",
      pillsConsumed: 0.5,
      pillStrength: 40,
      inventoryItemId: r.itemId,
      skipReason: null,
      deviceId: "mcp-connector",
      timezone: TZ,
      deletedAt: null,
      serverUpdatedAt: NOW,
    });
    expectPushable("doseLogs", log);

    const inv = await item(r.itemId);
    expect(inv).toMatchObject({ currentStock: 29.5, serverUpdatedAt: NOW });
    const consumed = (await txsOf(r.itemId)).filter((t) => t.type === "consumed");
    expect(consumed).toHaveLength(1);
    expect(consumed[0]).toMatchObject({ amount: -0.5, doseLogId: res.dose_log_id, deviceId: "mcp-connector" });
    expectPushable("inventoryTransactions", consumed[0]!);

    const auditRows = await audits();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: "dose_taken", userId: ctx.testUserId, serverUpdatedAt: NOW });
    expect(JSON.parse(auditRows[0]!.details!)).toMatchObject({ pillsConsumed: 0.5, dosageMg: 20 });
    expectPushable("auditLogs", auditRows[0]!);
  });

  it("leaves an already-taken dose unchanged", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const first = ok(await med.logDose(ctx.testUserId, { scheduleId: r.scheduleId, date: TODAY, action: "taken", timezone: TZ }, NOW));
    const second = ok(
      await med.logDose(ctx.testUserId, { scheduleId: r.scheduleId, date: TODAY, action: "taken", timezone: TZ }, NOW + 60_000),
    );
    expect(second).toMatchObject({ dose_log_id: first.dose_log_id, changed: false, stock: null, taken_at: NOW });
    expect((await txsOf(r.itemId)).filter((t) => t.type === "consumed")).toHaveLength(1);
    expect((await item(r.itemId)).currentStock).toBe(29.5);
    expect(await audits()).toHaveLength(1);
  });

  it("falls back to a random id when the deterministic id is a tombstone", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const fixed = med.scheduledDoseLogId(r.scheduleId, TODAY);
    await ctx.db.insert(schema.doseLogs).values(
      doseLogFixture(ctx.testUserId, r, { id: fixed, scheduledDate: TODAY, deletedAt: NOW - 1000 }),
    );
    const res = ok(await med.logDose(ctx.testUserId, { scheduleId: r.scheduleId, date: TODAY, action: "taken", timezone: TZ }, NOW));
    expect(res.dose_log_id).not.toBe(fixed);
    expect(res.dose_log_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses a dose of a future day", async () => {
    const r = await seedRegimen(ctx.testUserId);
    for (const action of ["taken", "skipped"] as const) {
      const res = await med.logDose(ctx.testUserId, { scheduleId: r.scheduleId, date: TOMORROW, action, timezone: TZ }, NOW);
      expect(res).toMatchObject({ ok: false, reason: "future_day" });
    }
    expect(await ctx.db.select().from(schema.doseLogs)).toHaveLength(0);
  });

  it("refuses another user's schedule as not found", async () => {
    const theirs = await seedRegimen(OTHER_USER_ID);
    const res = await med.logDose(ctx.testUserId, { scheduleId: theirs.scheduleId, date: TODAY, action: "taken", timezone: TZ }, NOW);
    expect(res).toMatchObject({ ok: false, reason: "not_found" });
    expect(await ctx.db.select().from(schema.doseLogs)).toHaveLength(0);
    expect((await item(theirs.itemId)).currentStock).toBe(30);
  });

  it("refuses a schedule not in the regimen on that weekday", async () => {
    const r = await seedRegimen(ctx.testUserId);
    await ctx.db
      .update(schema.phaseSchedules)
      .set({ daysOfWeek: [2] })
      .where(eq(schema.phaseSchedules.id, r.scheduleId));
    const res = await med.logDose(ctx.testUserId, { scheduleId: r.scheduleId, date: TODAY, action: "taken", timezone: TZ }, NOW);
    expect(res).toMatchObject({ ok: false, reason: "not_in_regimen" });
  });
});

describe("logDose — skipped and not_taken", () => {
  it("skipping a taken dose puts its pills back", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const taken = ok(await med.logDose(ctx.testUserId, { scheduleId: r.scheduleId, date: YESTERDAY, action: "taken", timezone: TZ }, NOW));
    const skipped = ok(
      await med.logDose(
        ctx.testUserId,
        { scheduleId: r.scheduleId, date: YESTERDAY, action: "skipped", skipReason: "Felt dizzy", timezone: TZ },
        NOW + 1000,
      ),
    );
    expect(skipped).toMatchObject({
      dose_log_id: taken.dose_log_id,
      status: "skipped",
      stock: { change: 0.5, stock_after: 30 },
    });
    const log = await doseLog(taken.dose_log_id);
    expect(log).toMatchObject({ status: "skipped", pillsConsumed: 0, skipReason: "Felt dizzy", actionTimestamp: NOW + 1000 });
    expectPushable("doseLogs", log);
    expect((await item(r.itemId)).currentStock).toBe(30);
    const consumed = (await txsOf(r.itemId)).filter((t) => t.type === "consumed").map((t) => t.amount).sort();
    expect(consumed).toEqual([-0.5, 0.5]);
    expect((await audits()).map((a) => a.action).sort()).toEqual(["dose_skipped", "dose_taken"]);
  });

  it("not_taken undoes a take (stock back) and then a skip; with nothing to undo it refuses", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const args = { scheduleId: r.scheduleId, date: TODAY, timezone: TZ };
    ok(await med.logDose(ctx.testUserId, { ...args, action: "taken" }, NOW));
    const untaken = ok(await med.logDose(ctx.testUserId, { ...args, action: "not_taken" }, NOW + 1000));
    expect(untaken).toMatchObject({ status: "pending", stock: { change: 0.5, stock_after: 30 } });
    expect(await doseLog(untaken.dose_log_id)).toMatchObject({ status: "pending", pillsConsumed: 0 });

    expect(await med.logDose(ctx.testUserId, { ...args, action: "not_taken" }, NOW + 2000)).toMatchObject({
      ok: false,
      reason: "nothing_to_undo",
    });

    ok(await med.logDose(ctx.testUserId, { ...args, action: "skipped" }, NOW + 3000));
    const unskipped = ok(await med.logDose(ctx.testUserId, { ...args, action: "not_taken" }, NOW + 4000));
    expect(unskipped).toMatchObject({ status: "pending", stock: null });
    expect(await doseLog(unskipped.dose_log_id)).toMatchObject({ status: "pending", skipReason: null });
    expect((await item(r.itemId)).currentStock).toBe(30);
  });
});

describe("logExtraMedicine", () => {
  it("logs a listed medicine as a PRN dose that takes its pills from stock", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const takenAt = NOW - 90 * 60_000 + 12_345;
    const res = ok(
      await med.logExtraMedicine(
        ctx.testUserId,
        { prescriptionId: r.prescriptionId, amount: 1, unit: "tablet", takenAt, note: " for swelling ", timezone: TZ },
        NOW,
      ),
    );
    expect(res).toMatchObject({
      listed: true,
      pills_consumed: 1,
      date: TODAY,
      time: "12:43",
      stock: { change: -1, stock_after: 29 },
    });
    const log = await doseLog(res.dose_log_id);
    expect(log).toMatchObject({
      kind: "prn",
      prescriptionId: r.prescriptionId,
      phaseId: null,
      scheduleId: null,
      status: "taken",
      scheduledDate: TODAY,
      scheduledTime: "12:43",
      actionTimestamp: NOW - 90 * 60_000 - 20_000, // 12:43:00, the minute, as logPrnDose
      doseMg: 40,
      inventoryItemId: r.itemId,
      note: "for swelling",
      deviceId: "mcp-connector",
    });
    expectPushable("doseLogs", log);
    expect((await item(r.itemId)).currentStock).toBe(29);
  });

  it("logs a medicine by an exact list name as that medicine", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const res = ok(await med.logExtraMedicine(ctx.testUserId, { medicineName: "furosemide", amount: 40, unit: "mg", timezone: TZ }, NOW));
    expect(res).toMatchObject({ listed: true, prescription_id: r.prescriptionId, pills_consumed: 1 });
  });

  it("logs an unlisted medicine by name, with no stock", async () => {
    await seedRegimen(ctx.testUserId);
    const res = ok(
      await med.logExtraMedicine(ctx.testUserId, { medicineName: " Paracetamol ", amount: 500, unit: "mg", timezone: TZ }, NOW),
    );
    expect(res).toMatchObject({ listed: false, prescription_id: null, medicine_name: "Paracetamol", stock: null });
    const log = await doseLog(res.dose_log_id);
    expect(log).toMatchObject({
      kind: "prn",
      prescriptionId: null,
      medicineName: "Paracetamol",
      doseAmount: 500,
      doseUnit: "mg",
      doseMg: 500,
      actionTimestamp: NOW,
      inventoryItemId: null,
    });
    expectPushable("doseLogs", log);
    const auditRow = (await audits())[0]!;
    expect(JSON.parse(auditRow.details!)).toMatchObject({ unlisted: true, kind: "prn" });
  });

  it("refuses another user's prescription and a future time", async () => {
    const theirs = await seedRegimen(OTHER_USER_ID);
    expect(
      await med.logExtraMedicine(ctx.testUserId, { prescriptionId: theirs.prescriptionId, timezone: TZ }, NOW),
    ).toMatchObject({ ok: false, reason: "not_found" });
    expect(
      await med.logExtraMedicine(ctx.testUserId, { medicineName: "Ibuprofen", takenAt: NOW + DAY_MS }, NOW),
    ).toMatchObject({ ok: false, reason: "future_time" });
  });
});

describe("refillStock", () => {
  it("adds a refill transaction and moves the cached stock", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const res = ok(await med.refillStock(ctx.testUserId, { prescriptionId: r.prescriptionId, pills: 28 }, NOW));
    expect(res).toMatchObject({ inventory_item_id: r.itemId, pills_added: 28, stock_after: 58, brand_name: "Lasix" });
    const tx = (await txsOf(r.itemId)).find((t) => t.id === res.transaction_id)!;
    expect(tx).toMatchObject({ type: "refill", amount: 28, timestamp: NOW, deviceId: "mcp-connector", serverUpdatedAt: NOW });
    expectPushable("inventoryTransactions", tx);
    expect((await item(r.itemId)).currentStock).toBe(58);
    expect((await audits())[0]).toMatchObject({ action: "inventory_adjusted" });
  });

  it("refuses a medicine with no stock item, and another user's medicine", async () => {
    const r = await seedRegimen(ctx.testUserId, { stock: false });
    expect(await med.refillStock(ctx.testUserId, { prescriptionId: r.prescriptionId, pills: 10 }, NOW)).toMatchObject({
      ok: false,
      reason: "no_stock_item",
    });
    const theirs = await seedRegimen(OTHER_USER_ID);
    expect(await med.refillStock(ctx.testUserId, { prescriptionId: theirs.prescriptionId, pills: 10 }, NOW)).toMatchObject({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("deleteMedicationRecord", () => {
  it("removes a connector refill and re-derives the stock", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const refill = ok(await med.refillStock(ctx.testUserId, { prescriptionId: r.prescriptionId, pills: 28 }, NOW));
    const res = await med.deleteMedicationRecord(ctx.testUserId, "stock_refill", refill.transaction_id, NOW + 1000);
    expect(res).toMatchObject({ deleted: true, stock: { change: -28, stock_after: 30 } });
    const tx = (await txsOf(r.itemId)).find((t) => t.id === refill.transaction_id)!;
    expect(tx).toMatchObject({ deletedAt: NOW + 1000, serverUpdatedAt: NOW + 1000 });
    expect((await item(r.itemId)).currentStock).toBe(30);
    expect(await med.deleteMedicationRecord(ctx.testUserId, "stock_refill", refill.transaction_id, NOW + 2000)).toEqual({
      deleted: false,
      reason: "not_found",
    });
  });

  it("removes a connector extra dose and reverses its stock transaction", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const extra = ok(
      await med.logExtraMedicine(ctx.testUserId, { prescriptionId: r.prescriptionId, amount: 40, unit: "mg", timezone: TZ }, NOW),
    );
    const res = await med.deleteMedicationRecord(ctx.testUserId, "extra_medicine", extra.dose_log_id, NOW + 1000);
    expect(res).toMatchObject({ deleted: true, stock: { change: 1, stock_after: 30 } });
    expect((await doseLog(extra.dose_log_id)).deletedAt).toBe(NOW + 1000);
    const consumed = (await txsOf(r.itemId)).filter((t) => t.type === "consumed");
    expect(consumed.every((t) => t.deletedAt === NOW + 1000)).toBe(true);
    expect((await item(r.itemId)).currentStock).toBe(30);
  });

  it("refuses the user's own rows and never reaches another user's", async () => {
    const r = await seedRegimen(ctx.testUserId);
    const ownTx = inventoryTxFixture(ctx.testUserId, r.itemId, { amount: 10, type: "refill" });
    await ctx.db.insert(schema.inventoryTransactions).values(ownTx);
    expect(await med.deleteMedicationRecord(ctx.testUserId, "stock_refill", ownTx.id!, NOW)).toEqual({
      deleted: false,
      reason: "not_connector_entry",
    });
    const ownPrn = doseLogFixture(ctx.testUserId, r, { kind: "prn", phaseId: null, scheduleId: null });
    await ctx.db.insert(schema.doseLogs).values(ownPrn);
    expect(await med.deleteMedicationRecord(ctx.testUserId, "extra_medicine", ownPrn.id!, NOW)).toEqual({
      deleted: false,
      reason: "not_connector_entry",
    });

    const theirs = await seedRegimen(OTHER_USER_ID);
    const theirRefill = ok(await med.refillStock(OTHER_USER_ID, { prescriptionId: theirs.prescriptionId, pills: 5 }, NOW));
    expect(await med.deleteMedicationRecord(ctx.testUserId, "stock_refill", theirRefill.transaction_id, NOW)).toEqual({
      deleted: false,
      reason: "not_found",
    });
    const still = await ctx.db
      .select()
      .from(schema.inventoryTransactions)
      .where(and(eq(schema.inventoryTransactions.id, theirRefill.transaction_id)));
    expect(still[0]?.deletedAt).toBeNull();
  });
});
