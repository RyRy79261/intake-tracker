import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";

// schedulePush() registers timers against the real sync engine, which keeps
// pending work alive past the test boundary and prevents fake-indexeddb's
// db.delete() in the setup hook from completing in time. Mock it to a noop
// — sync-side behavior is covered by sync-service-tier1.test.ts; this file
// is for the health-service-side concerns (note trimming, optional fields,
// pagination math, default timestamp, latest/range filtering edge cases).
vi.mock("@/lib/sync-engine", () => ({
  schedulePush: vi.fn(),
}));

import {
  addWeightRecord,
  getWeightRecords,
  getWeightRecordsByDateRange,
  getLatestWeightRecord,
  deleteWeightRecord,
  undoDeleteWeightRecord,
  updateWeightRecord,
  getWeightRecordsPaginated,
  addBloodPressureRecord,
  getBloodPressureRecords,
  getBloodPressureRecordsByDateRange,
  getLatestBloodPressureRecord,
  deleteBloodPressureRecord,
  undoDeleteBloodPressureRecord,
  updateBloodPressureRecord,
  getBloodPressureRecordsPaginated,
} from "@/lib/health-service";
import {
  makeWeightRecord,
  makeBloodPressureRecord,
} from "@/__tests__/fixtures/db-fixtures";

// Setup is handled by src/__tests__/setup.ts (fake-indexeddb, db.delete/open per test).

describe("health-service: weight record CRUD", () => {
  it("addWeightRecord persists the weight, generates an id, and returns ok", async () => {
    const result = await addWeightRecord(82.5);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.weight).toBe(82.5);
    expect(result.data.id).toBeTypeOf("string");
    expect(result.data.id.length).toBeGreaterThan(0);

    const stored = await db.weightRecords.get(result.data.id);
    expect(stored?.weight).toBe(82.5);
  });

  it("addWeightRecord defaults timestamp to Date.now() when omitted", async () => {
    // Use vi.spyOn instead of vi.useFakeTimers — fake timers break the
    // fake-indexeddb internals (Dexie schedules real setTimeout for tx
    // commit), causing every subsequent test's db.delete() in setup.ts
    // to hang. We only need a controllable Date.now(), not full timer fake.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    try {
      const result = await addWeightRecord(80);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.timestamp).toBe(1700000000000);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("addWeightRecord honours an explicit timestamp", async () => {
    const result = await addWeightRecord(80, 1234567890);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.timestamp).toBe(1234567890);
  });

  it("addWeightRecord trims a note with surrounding whitespace", async () => {
    const result = await addWeightRecord(80, undefined, "  morning weigh-in  ");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.note).toBe("morning weigh-in");
  });

  it("addWeightRecord omits the note field when the note is empty or whitespace-only", async () => {
    const empty = await addWeightRecord(80, undefined, "");
    const whitespace = await addWeightRecord(80, undefined, "   ");
    expect(empty.success).toBe(true);
    expect(whitespace.success).toBe(true);
    if (!empty.success || !whitespace.success) return;
    // Empty/whitespace notes must not become a stored empty string —
    // the conditional spread in health-service skips the field entirely.
    expect("note" in empty.data).toBe(false);
    expect("note" in whitespace.data).toBe(false);
  });

  it("addWeightRecord sets sync metadata (createdAt, updatedAt, deletedAt: null)", async () => {
    const result = await addWeightRecord(80);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.createdAt).toBeTypeOf("number");
    expect(result.data.updatedAt).toBeTypeOf("number");
    expect(result.data.deletedAt).toBeNull();
  });

  it("getWeightRecords returns active records ordered by timestamp descending", async () => {
    await db.weightRecords.bulkAdd([
      makeWeightRecord({ id: "w-1", weight: 80, timestamp: 1000 }),
      makeWeightRecord({ id: "w-2", weight: 81, timestamp: 3000 }),
      makeWeightRecord({ id: "w-3", weight: 82, timestamp: 2000 }),
    ]);

    const records = await getWeightRecords();
    expect(records.map((r) => r.id)).toEqual(["w-2", "w-3", "w-1"]);
  });

  it("getWeightRecords filters out soft-deleted records", async () => {
    await db.weightRecords.bulkAdd([
      makeWeightRecord({ id: "alive", timestamp: 2000 }),
      makeWeightRecord({ id: "dead", timestamp: 1000, deletedAt: 5000 }),
    ]);

    const records = await getWeightRecords();
    expect(records.map((r) => r.id)).toEqual(["alive"]);
  });

  it("getWeightRecords applies the optional limit after filtering deleted records", async () => {
    await db.weightRecords.bulkAdd([
      makeWeightRecord({ id: "a", timestamp: 1000 }),
      makeWeightRecord({ id: "b", timestamp: 2000 }),
      makeWeightRecord({ id: "c", timestamp: 3000 }),
      makeWeightRecord({ id: "d", timestamp: 4000, deletedAt: 9999 }),
    ]);

    const records = await getWeightRecords(2);
    expect(records.map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("getLatestWeightRecord skips soft-deleted records", async () => {
    await db.weightRecords.bulkAdd([
      makeWeightRecord({ id: "old", timestamp: 1000 }),
      makeWeightRecord({ id: "newer-but-deleted", timestamp: 2000, deletedAt: 5000 }),
    ]);

    const latest = await getLatestWeightRecord();
    expect(latest?.id).toBe("old");
  });

  it("getLatestWeightRecord returns undefined when there are no records", async () => {
    expect(await getLatestWeightRecord()).toBeUndefined();
  });

  it("getLatestWeightRecord returns undefined when every record is soft-deleted", async () => {
    await db.weightRecords.add(
      makeWeightRecord({ id: "tombstoned", deletedAt: 1234 })
    );
    expect(await getLatestWeightRecord()).toBeUndefined();
  });

  it("getWeightRecordsByDateRange returns active records within the half-open [start, end) timestamp window", async () => {
    // Dexie's .between(lower, upper) defaults to includeLower=true,
    // includeUpper=false — record at timestamp === end is NOT included.
    await db.weightRecords.bulkAdd([
      makeWeightRecord({ id: "before", timestamp: 500 }),
      makeWeightRecord({ id: "start", timestamp: 1000 }),
      makeWeightRecord({ id: "middle", timestamp: 1500 }),
      makeWeightRecord({ id: "end", timestamp: 2000 }),
      makeWeightRecord({ id: "after", timestamp: 2500 }),
    ]);

    const records = await getWeightRecordsByDateRange(1000, 2000);
    expect(records.map((r) => r.id).sort()).toEqual(["middle", "start"]);
  });

  it("getWeightRecordsByDateRange excludes soft-deleted records inside the window", async () => {
    await db.weightRecords.bulkAdd([
      makeWeightRecord({ id: "live", timestamp: 1500 }),
      makeWeightRecord({ id: "tombstone", timestamp: 1600, deletedAt: 9999 }),
    ]);

    const records = await getWeightRecordsByDateRange(1000, 2000);
    expect(records.map((r) => r.id)).toEqual(["live"]);
  });

  it("deleteWeightRecord soft-deletes by setting deletedAt and updatedAt", async () => {
    const created = await addWeightRecord(80);
    expect(created.success).toBe(true);
    if (!created.success) return;

    const result = await deleteWeightRecord(created.data.id);
    expect(result.success).toBe(true);

    const stored = await db.weightRecords.get(created.data.id);
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).toBeTypeOf("number");
    expect(stored?.updatedAt).toBeGreaterThan(0);
  });

  it("undoDeleteWeightRecord clears deletedAt and bumps updatedAt", async () => {
    await db.weightRecords.add(
      makeWeightRecord({ id: "undo", deletedAt: 1234, updatedAt: 1234 })
    );

    const result = await undoDeleteWeightRecord("undo");
    expect(result.success).toBe(true);

    const stored = await db.weightRecords.get("undo");
    expect(stored?.deletedAt).toBeNull();
    expect(stored?.updatedAt).toBeGreaterThan(1234);
  });

  it("updateWeightRecord applies a partial update without touching other fields", async () => {
    await db.weightRecords.add(
      makeWeightRecord({ id: "u", weight: 80, timestamp: 5000, note: "old" })
    );

    const result = await updateWeightRecord("u", { weight: 81 });
    expect(result.success).toBe(true);

    const stored = await db.weightRecords.get("u");
    expect(stored?.weight).toBe(81);
    expect(stored?.timestamp).toBe(5000);
    expect(stored?.note).toBe("old");
  });

  it("updateWeightRecord bumps updatedAt", async () => {
    await db.weightRecords.add(
      makeWeightRecord({ id: "u2", updatedAt: 1000 })
    );

    const result = await updateWeightRecord("u2", { weight: 100 });
    expect(result.success).toBe(true);

    const stored = await db.weightRecords.get("u2");
    expect(stored?.updatedAt).toBeGreaterThan(1000);
  });
});

describe("health-service: weight pagination", () => {
  it("returns a page-sized slice and reports hasMore correctly when more pages remain", async () => {
    await db.weightRecords.bulkAdd(
      Array.from({ length: 7 }, (_, i) =>
        makeWeightRecord({ id: `p-${i}`, timestamp: i * 1000 })
      )
    );

    const page1 = await getWeightRecordsPaginated(1, 3);
    expect(page1.records).toHaveLength(3);
    expect(page1.total).toBe(7);
    expect(page1.hasMore).toBe(true);
    // Most recent first
    expect(page1.records.map((r) => r.id)).toEqual(["p-6", "p-5", "p-4"]);
  });

  it("reports hasMore: false on the final page", async () => {
    await db.weightRecords.bulkAdd(
      Array.from({ length: 5 }, (_, i) =>
        makeWeightRecord({ id: `p-${i}`, timestamp: i * 1000 })
      )
    );

    const page2 = await getWeightRecordsPaginated(2, 3);
    expect(page2.records).toHaveLength(2);
    expect(page2.hasMore).toBe(false);
    expect(page2.total).toBe(5);
  });

  it("returns an empty page beyond the last page", async () => {
    await db.weightRecords.bulkAdd(
      Array.from({ length: 3 }, (_, i) =>
        makeWeightRecord({ id: `p-${i}`, timestamp: i * 1000 })
      )
    );

    const page = await getWeightRecordsPaginated(99, 10);
    expect(page.records).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.total).toBe(3);
  });

  it("excludes soft-deleted records from the total and the page", async () => {
    await db.weightRecords.bulkAdd([
      makeWeightRecord({ id: "alive-1", timestamp: 1000 }),
      makeWeightRecord({ id: "alive-2", timestamp: 2000 }),
      makeWeightRecord({ id: "dead", timestamp: 3000, deletedAt: 9999 }),
    ]);

    const page = await getWeightRecordsPaginated(1, 10);
    expect(page.total).toBe(2);
    expect(page.records.map((r) => r.id)).toEqual(["alive-2", "alive-1"]);
  });
});

describe("health-service: blood pressure record CRUD", () => {
  it("addBloodPressureRecord persists all required fields and returns ok", async () => {
    const result = await addBloodPressureRecord(130, 85, "sitting", "left");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.systolic).toBe(130);
    expect(result.data.diastolic).toBe(85);
    expect(result.data.position).toBe("sitting");
    expect(result.data.arm).toBe("left");
  });

  it("addBloodPressureRecord persists optional heartRate and irregularHeartbeat when provided", async () => {
    const result = await addBloodPressureRecord(
      130,
      85,
      "sitting",
      "right",
      72,
      undefined,
      undefined,
      true
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.heartRate).toBe(72);
    expect(result.data.irregularHeartbeat).toBe(true);
  });

  it("addBloodPressureRecord omits heartRate and irregularHeartbeat when undefined", async () => {
    const result = await addBloodPressureRecord(120, 80, "sitting", "left");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect("heartRate" in result.data).toBe(false);
    expect("irregularHeartbeat" in result.data).toBe(false);
  });

  it("addBloodPressureRecord trims a note and omits it when blank", async () => {
    const trimmed = await addBloodPressureRecord(
      130,
      85,
      "sitting",
      "left",
      undefined,
      undefined,
      "  before coffee  "
    );
    const blank = await addBloodPressureRecord(
      130,
      85,
      "sitting",
      "left",
      undefined,
      undefined,
      "   "
    );
    expect(trimmed.success).toBe(true);
    expect(blank.success).toBe(true);
    if (!trimmed.success || !blank.success) return;
    expect(trimmed.data.note).toBe("before coffee");
    expect("note" in blank.data).toBe(false);
  });

  it("getBloodPressureRecords returns active records ordered by timestamp descending", async () => {
    await db.bloodPressureRecords.bulkAdd([
      makeBloodPressureRecord({ id: "bp-1", timestamp: 1000 }),
      makeBloodPressureRecord({ id: "bp-2", timestamp: 3000 }),
      makeBloodPressureRecord({ id: "bp-3", timestamp: 2000 }),
    ]);

    const records = await getBloodPressureRecords();
    expect(records.map((r) => r.id)).toEqual(["bp-2", "bp-3", "bp-1"]);
  });

  it("getBloodPressureRecords filters out soft-deleted records", async () => {
    await db.bloodPressureRecords.bulkAdd([
      makeBloodPressureRecord({ id: "alive", timestamp: 2000 }),
      makeBloodPressureRecord({ id: "dead", timestamp: 1000, deletedAt: 5000 }),
    ]);

    const records = await getBloodPressureRecords();
    expect(records.map((r) => r.id)).toEqual(["alive"]);
  });

  it("getLatestBloodPressureRecord skips soft-deleted records", async () => {
    await db.bloodPressureRecords.bulkAdd([
      makeBloodPressureRecord({ id: "old", timestamp: 1000 }),
      makeBloodPressureRecord({
        id: "newer-but-deleted",
        timestamp: 2000,
        deletedAt: 5000,
      }),
    ]);

    expect((await getLatestBloodPressureRecord())?.id).toBe("old");
  });

  it("getBloodPressureRecordsByDateRange returns active records within the window", async () => {
    await db.bloodPressureRecords.bulkAdd([
      makeBloodPressureRecord({ id: "before", timestamp: 500 }),
      makeBloodPressureRecord({ id: "in", timestamp: 1500 }),
      makeBloodPressureRecord({ id: "tombstone-in", timestamp: 1700, deletedAt: 9999 }),
      makeBloodPressureRecord({ id: "after", timestamp: 2500 }),
    ]);

    const records = await getBloodPressureRecordsByDateRange(1000, 2000);
    expect(records.map((r) => r.id)).toEqual(["in"]);
  });

  it("deleteBloodPressureRecord soft-deletes by setting deletedAt", async () => {
    const created = await addBloodPressureRecord(130, 85, "sitting", "left");
    expect(created.success).toBe(true);
    if (!created.success) return;

    const result = await deleteBloodPressureRecord(created.data.id);
    expect(result.success).toBe(true);

    const stored = await db.bloodPressureRecords.get(created.data.id);
    expect(stored?.deletedAt).toBeTypeOf("number");
  });

  it("undoDeleteBloodPressureRecord clears deletedAt and bumps updatedAt", async () => {
    await db.bloodPressureRecords.add(
      makeBloodPressureRecord({
        id: "undo",
        deletedAt: 1234,
        updatedAt: 1234,
      })
    );

    const result = await undoDeleteBloodPressureRecord("undo");
    expect(result.success).toBe(true);

    const stored = await db.bloodPressureRecords.get("undo");
    expect(stored?.deletedAt).toBeNull();
    expect(stored?.updatedAt).toBeGreaterThan(1234);
  });

  it("updateBloodPressureRecord applies a partial update", async () => {
    await db.bloodPressureRecords.add(
      makeBloodPressureRecord({
        id: "u",
        systolic: 130,
        diastolic: 85,
        position: "sitting",
        arm: "left",
      })
    );

    const result = await updateBloodPressureRecord("u", { systolic: 125, arm: "right" });
    expect(result.success).toBe(true);

    const stored = await db.bloodPressureRecords.get("u");
    expect(stored?.systolic).toBe(125);
    expect(stored?.diastolic).toBe(85);
    expect(stored?.position).toBe("sitting");
    expect(stored?.arm).toBe("right");
  });
});

describe("health-service: blood pressure pagination", () => {
  it("returns a page-sized slice and reports hasMore correctly", async () => {
    await db.bloodPressureRecords.bulkAdd(
      Array.from({ length: 7 }, (_, i) =>
        makeBloodPressureRecord({ id: `p-${i}`, timestamp: i * 1000 })
      )
    );

    const page1 = await getBloodPressureRecordsPaginated(1, 3);
    expect(page1.records.map((r) => r.id)).toEqual(["p-6", "p-5", "p-4"]);
    expect(page1.total).toBe(7);
    expect(page1.hasMore).toBe(true);
  });

  it("excludes soft-deleted records from total and page", async () => {
    await db.bloodPressureRecords.bulkAdd([
      makeBloodPressureRecord({ id: "alive-1", timestamp: 1000 }),
      makeBloodPressureRecord({ id: "alive-2", timestamp: 2000 }),
      makeBloodPressureRecord({ id: "dead", timestamp: 3000, deletedAt: 9999 }),
    ]);

    const page = await getBloodPressureRecordsPaginated(1, 10);
    expect(page.total).toBe(2);
    expect(page.records.map((r) => r.id)).toEqual(["alive-2", "alive-1"]);
  });

  it("reports hasMore: false on the final page", async () => {
    await db.bloodPressureRecords.bulkAdd(
      Array.from({ length: 4 }, (_, i) =>
        makeBloodPressureRecord({ id: `p-${i}`, timestamp: i * 1000 })
      )
    );

    const page2 = await getBloodPressureRecordsPaginated(2, 3);
    expect(page2.records).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });
});
