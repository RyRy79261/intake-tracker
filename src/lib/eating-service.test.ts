import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { makeEatingRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  deleteEatingRecord,
  getEatingRecords,
  getEatingRecordsByDateRange,
  undoDeleteEatingRecord,
} from "@/lib/eating-service";

// Setup is handled by src/__tests__/setup.ts (fake-indexeddb, db.delete/open per test)

describe("eating-service soft-delete", () => {
  const now = Date.now();

  it("deleteEatingRecord sets deletedAt to a number instead of removing the record", async () => {
    const record = makeEatingRecord({ id: "del-1", timestamp: now });
    await db.eatingRecords.add(record);

    await deleteEatingRecord("del-1");

    const stored = await db.eatingRecords.get("del-1");
    expect(stored).toBeDefined();
    expect(stored!.deletedAt).toBeTypeOf("number");
    expect(stored!.deletedAt).not.toBeNull();
  });

  it("deleteEatingRecord also sets updatedAt", async () => {
    const record = makeEatingRecord({ id: "del-2", timestamp: now, updatedAt: 1000 });
    await db.eatingRecords.add(record);

    await deleteEatingRecord("del-2");

    const stored = await db.eatingRecords.get("del-2");
    expect(stored!.updatedAt).toBeGreaterThan(1000);
  });

  it("getEatingRecords excludes soft-deleted records", async () => {
    await db.eatingRecords.add(makeEatingRecord({ id: "eat-1", timestamp: now }));
    await db.eatingRecords.add(makeEatingRecord({ id: "eat-2", timestamp: now - 1000 }));
    await db.eatingRecords.add(makeEatingRecord({ id: "eat-del", timestamp: now - 500 }));

    await deleteEatingRecord("eat-del");

    const records = await getEatingRecords();
    const ids = records.map(r => r.id);
    expect(ids).not.toContain("eat-del");
    expect(ids).toContain("eat-1");
    expect(ids).toContain("eat-2");
  });

  it("getEatingRecordsByDateRange excludes soft-deleted records", async () => {
    const start = now - 10000;
    const end = now + 10000;
    await db.eatingRecords.add(makeEatingRecord({ id: "range-1", timestamp: now }));
    await db.eatingRecords.add(makeEatingRecord({ id: "range-del", timestamp: now }));

    await deleteEatingRecord("range-del");

    const records = await getEatingRecordsByDateRange(start, end);
    const ids = records.map(r => r.id);
    expect(ids).not.toContain("range-del");
    expect(ids).toContain("range-1");
  });

  it("undoDeleteEatingRecord restores a soft-deleted record", async () => {
    await db.eatingRecords.add(makeEatingRecord({ id: "undo-1", timestamp: now }));
    await deleteEatingRecord("undo-1");

    // Verify it's deleted
    let stored = await db.eatingRecords.get("undo-1");
    expect(stored!.deletedAt).not.toBeNull();

    // Undo
    await undoDeleteEatingRecord("undo-1");

    stored = await db.eatingRecords.get("undo-1");
    expect(stored!.deletedAt).toBeNull();

    // Verify it appears in read queries again
    const records = await getEatingRecords();
    expect(records.map(r => r.id)).toContain("undo-1");
  });
});
