import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  deleteIntakeRecord,
  getRecordsInLast24Hours,
  getTotalInLast24Hours,
  getDailyTotal,
  getRecentRecords,
  getAllRecords,
  getRecordsPaginated,
  getRecordsByCursor,
  getRecordsByDateRange,
  undoDeleteIntakeRecord,
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

  it("getDailyTotal excludes soft-deleted records", async () => {
    const recent = now - 1000;
    await db.intakeRecords.add(makeIntakeRecord({ type: "water", amount: 100, timestamp: recent }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "del-daily", type: "water", amount: 200, timestamp: recent }));

    await deleteIntakeRecord("del-daily");

    // getDailyTotal uses dayStartHour; use 0 so "today" starts at midnight
    const total = await getDailyTotal("water", 0);
    expect(total).toBe(100);
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

  it("getRecordsInLast24Hours excludes soft-deleted records", async () => {
    const recent = now - 1000;
    await db.intakeRecords.add(makeIntakeRecord({ id: "24h-1", timestamp: recent }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "24h-del", timestamp: recent }));

    await deleteIntakeRecord("24h-del");

    const records = await getRecordsInLast24Hours();
    const ids = records.map(r => r.id);
    expect(ids).not.toContain("24h-del");
    expect(ids).toContain("24h-1");
  });

  it("getTotalInLast24Hours excludes soft-deleted records", async () => {
    const recent = now - 1000;
    await db.intakeRecords.add(makeIntakeRecord({ type: "water", amount: 100, timestamp: recent }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "del-total", type: "water", amount: 300, timestamp: recent }));

    await deleteIntakeRecord("del-total");

    const total = await getTotalInLast24Hours("water");
    expect(total).toBe(100);
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

  it("getRecordsByCursor excludes soft-deleted records", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "cursor-1", timestamp: now }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "cursor-2", timestamp: now - 1000 }));
    await db.intakeRecords.add(makeIntakeRecord({ id: "cursor-del", timestamp: now - 500 }));

    await deleteIntakeRecord("cursor-del");

    const result = await getRecordsByCursor(undefined, 20);
    const ids = result.records.map(r => r.id);
    expect(ids).not.toContain("cursor-del");
    expect(ids).toContain("cursor-1");
    expect(ids).toContain("cursor-2");
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
