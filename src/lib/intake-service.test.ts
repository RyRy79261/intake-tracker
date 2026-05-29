import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("getDailyTotal day-start-hour rollover", () => {
  // getDayStartTimestamp uses LOCAL setHours(dayStartHour). We build all
  // timestamps from local Date components so the test is timezone-agnostic.
  // "Today" is pinned to a moment well after the 04:00 day-start so the
  // day-start anchor lands on the current calendar date.
  const DAY_START_HOUR = 4;
  // Pinned "now": 2024-03-10 10:00 local. Day-start anchor => 2024-03-10 04:00.
  const Y = 2024, M = 2, D = 10; // March (0-indexed)

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Y, M, D, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts a record AFTER the day-start hour toward the current day", async () => {
    // 05:00 local today — after the 04:00 day start.
    const afterStart = new Date(Y, M, D, 5, 0, 0).getTime();
    await db.intakeRecords.add(
      makeIntakeRecord({ id: "after", type: "water", amount: 300, timestamp: afterStart }),
    );

    const total = await getDailyTotal("water", DAY_START_HOUR);
    expect(total).toBe(300);
  });

  it("excludes a record BEFORE the day-start hour (belongs to the previous day)", async () => {
    // 02:00 local today — before the 04:00 day start, so it belongs to the
    // previous "day" and must not count toward the current day total.
    const beforeStart = new Date(Y, M, D, 2, 0, 0).getTime();
    await db.intakeRecords.add(
      makeIntakeRecord({ id: "before", type: "water", amount: 999, timestamp: beforeStart }),
    );

    const total = await getDailyTotal("water", DAY_START_HOUR);
    expect(total).toBe(0);
  });

  it("partitions before/after the day-start hour into separate days", async () => {
    const beforeStart = new Date(Y, M, D, 2, 0, 0).getTime(); // prev day
    const afterStart = new Date(Y, M, D, 5, 0, 0).getTime(); // current day
    await db.intakeRecords.add(
      makeIntakeRecord({ id: "p-before", type: "water", amount: 100, timestamp: beforeStart }),
    );
    await db.intakeRecords.add(
      makeIntakeRecord({ id: "p-after", type: "water", amount: 250, timestamp: afterStart }),
    );

    const total = await getDailyTotal("water", DAY_START_HOUR);
    // Only the 05:00 record counts toward the current day.
    expect(total).toBe(250);
  });

  it("with dayStartHour 0, a 02:00 record DOES count toward the current day", async () => {
    const earlyMorning = new Date(Y, M, D, 2, 0, 0).getTime();
    await db.intakeRecords.add(
      makeIntakeRecord({ id: "midnight-start", type: "water", amount: 175, timestamp: earlyMorning }),
    );

    const total = await getDailyTotal("water", 0);
    expect(total).toBe(175);
  });
});
