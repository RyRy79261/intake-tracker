import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  deleteIntakeRecord,
  getRecentRecords,
  getAllRecords,
  getRecordsPaginated,
  getRecordsByDateRange,
  undoDeleteIntakeRecord,
  updateIntakeRecord,
} from "@/lib/intake-service";

// Setup is handled by src/__tests__/setup.ts (fake-indexeddb, db.delete/open per test)

describe("intake-service soft-delete", () => {
  const now = Date.now();

  it("deleteIntakeRecord sets deletedAt to a number instead of removing the record", async () => {
    const record = makeIntakeRecord({ id: "del-1", timestamp: now });
    await db.intakeRecords.add(record);

    await deleteIntakeRecord("del-1");

    const stored = await db.intakeRecords.get("del-1");
    expect(stored).toBeDefined();
    expect(stored!.deletedAt).toBeTypeOf("number");
    expect(stored!.deletedAt).not.toBeNull();
  });

  it("deleteIntakeRecord also sets updatedAt to current time", async () => {
    const record = makeIntakeRecord({ id: "del-2", timestamp: now, updatedAt: 1000 });
    await db.intakeRecords.add(record);

    await deleteIntakeRecord("del-2");

    const stored = await db.intakeRecords.get("del-2");
    expect(stored!.updatedAt).toBeGreaterThan(1000);
  });

  it("getRecentRecords excludes soft-deleted records", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "recent-1", type: "water", timestamp: now }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "recent-2", type: "water", timestamp: now - 1000 }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "recent-del", type: "water", timestamp: now - 500 }));

    await deleteIntakeRecord("recent-del");

    const records = await getRecentRecords("water", 10);
    const ids = records.map(r => r.id);
    expect(ids).not.toContain("recent-del");
    expect(ids).toContain("recent-1");
    expect(ids).toContain("recent-2");
  });

  it("getAllRecords excludes soft-deleted records", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "all-1" }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "all-del" }));

    await deleteIntakeRecord("all-del");

    const records = await getAllRecords();
    const ids = records.map(r => r.id);
    expect(ids).not.toContain("all-del");
    expect(ids).toContain("all-1");
  });

  it("getRecordsPaginated excludes soft-deleted records (total count should exclude deleted)", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "page-1", timestamp: now }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "page-2", timestamp: now - 1000 }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "page-del", timestamp: now - 500 }));

    await deleteIntakeRecord("page-del");

    const result = await getRecordsPaginated(1, 20);
    expect(result.total).toBe(2);
    const ids = result.records.map(r => r.id);
    expect(ids).not.toContain("page-del");
  });

  it("getRecordsByDateRange excludes soft-deleted records", async () => {
    const start = now - 10000;
    const end = now + 10000;
    await db.intakeRecords.add(makeIntakeRecord({ id: "range-1", timestamp: now }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "range-del", timestamp: now }));

    await deleteIntakeRecord("range-del");

    const records = await getRecordsByDateRange(start, end);
    const ids = records.map(r => r.id);
    expect(ids).not.toContain("range-del");
    expect(ids).toContain("range-1");
  });

  it("undoDeleteIntakeRecord restores a soft-deleted record", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "undo-1", timestamp: now }));
    await deleteIntakeRecord("undo-1");

    // Verify it's deleted
    let stored = await db.intakeRecords.get("undo-1");
    expect(stored!.deletedAt).not.toBeNull();

    // Undo
    await undoDeleteIntakeRecord("undo-1");

    stored = await db.intakeRecords.get("undo-1");
    expect(stored!.deletedAt).toBeNull();

    // Verify it appears in read queries again
    const all = await getAllRecords();
    expect(all.map(r => r.id)).toContain("undo-1");
  });
});

// A sodium row can carry what the user typed (2 g of salt) beside its sodium
// mg. Editing the mg elsewhere (Records tab) must not leave that stale.
describe("updateIntakeRecord and a sodium row's entered source", () => {
  it("drops the entered source when the sodium mg changes", async () => {
    const rec = makeIntakeRecord({
      type: "salt",
      amount: 786,
      sodiumSource: "salt",
      sourceAmount: 2,
      sourceUnit: "g",
    });
    await db.intakeRecords.add(rec);
    await updateIntakeRecord(rec.id, { amount: 900 });
    const row = await db.intakeRecords.get(rec.id);
    expect(row?.amount).toBe(900);
    expect(row?.sodiumSource).toBeUndefined();
    expect(row?.sourceAmount).toBeUndefined();
    expect(row?.sourceUnit).toBeUndefined();
  });

  it("keeps the entered source when only the time or note changes", async () => {
    const rec = makeIntakeRecord({
      type: "salt",
      amount: 786,
      sodiumSource: "salt",
      sourceAmount: 2,
      sourceUnit: "g",
    });
    await db.intakeRecords.add(rec);
    await updateIntakeRecord(rec.id, { amount: 786, note: "soup" });
    const row = await db.intakeRecords.get(rec.id);
    expect(row).toMatchObject({ sodiumSource: "salt", sourceAmount: 2, sourceUnit: "g" });
  });
});
