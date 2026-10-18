import { describe, it, expect } from "vitest";
import {
  estimateTable,
  makeEstimateRecord,
  otherTracker,
} from "@/__tests__/fixtures/estimate-tracker-fixtures";
import { db } from "@/lib/db";
import { ESTIMATE_TRACKERS, ESTIMATE_TRACKER_IDS } from "@/lib/estimate-trackers";
import {
  addEstimateRecord,
  getEstimateRecords,
  getEstimateRecordsBetween,
  updateEstimateRecord,
  deleteEstimateRecord,
  undoDeleteEstimateRecord,
} from "@/lib/estimate-tracker-service";

// Setup (fake-indexeddb, db reset per test) is handled by src/__tests__/setup.ts.

describe.each(ESTIMATE_TRACKER_IDS)("estimate-tracker-service (%s)", (tracker) => {
  const table = () => estimateTable(tracker);
  const make = (overrides: Parameters<typeof makeEstimateRecord>[1]) => makeEstimateRecord(tracker, overrides);

  describe("addEstimateRecord", () => {
    it("creates a record with a generated id and supplied fields", async () => {
      const result = await addEstimateRecord(tracker, { timestamp: 1000, amountEstimate: "small", note: "morning" });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const stored = await table().get(result.data.id);
      expect(stored).toBeDefined();
      expect(stored!.timestamp).toBe(1000);
      expect(stored!.amountEstimate).toBe("small");
      expect(stored!.note).toBe("morning");
      expect(stored!.deletedAt).toBeNull();
    });

    it("trims and omits blank amount/note", async () => {
      const result = await addEstimateRecord(tracker, { timestamp: 2000, amountEstimate: "  ", note: "   " });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const stored = await table().get(result.data.id);
      expect(stored!.amountEstimate).toBeUndefined();
      expect(stored!.note).toBeUndefined();
    });

    it("defaults the time to now", async () => {
      const before = Date.now();
      const result = await addEstimateRecord(tracker);
      if (!result.success) throw new Error("add failed");
      expect(result.data.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.data.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it("stores the given source and omits it when not given", async () => {
      const voice = await addEstimateRecord(tracker, { timestamp: 1000, amountEstimate: "small", source: "voice" });
      const manual = await addEstimateRecord(tracker, { timestamp: 1500, source: "manual" });
      const unknown = await addEstimateRecord(tracker, { timestamp: 2000 });
      if (!voice.success || !manual.success || !unknown.success) throw new Error("add failed");
      expect((await table().get(voice.data.id))?.source).toBe("voice");
      expect((await table().get(manual.data.id))?.source).toBe("manual");
      expect("source" in ((await table().get(unknown.data.id)) ?? {})).toBe(false);
    });

    it("writes to its own table only", async () => {
      await addEstimateRecord(tracker, { timestamp: 1000 });
      expect(await getEstimateRecords(tracker)).toHaveLength(1);
      expect(await getEstimateRecords(otherTracker(tracker))).toHaveLength(0);
    });

    it("queues the new row for sync as an upsert on its own table", async () => {
      const result = await addEstimateRecord(tracker, { timestamp: 1000 });
      if (!result.success) throw new Error("add failed");
      const queued = await db._syncQueue.toArray();
      expect(queued.map((q) => [q.tableName, q.recordId, q.op])).toEqual([
        [ESTIMATE_TRACKERS[tracker].table, result.data.id, "upsert"],
      ]);
    });
  });

  describe("getEstimateRecords", () => {
    it("returns active records newest-first and filters soft-deleted ones", async () => {
      await table().add(make({ id: "a", timestamp: 100 }));
      await table().add(make({ id: "b", timestamp: 300 }));
      await table().add(make({ id: "gone", timestamp: 200, deletedAt: 999 }));

      const records = await getEstimateRecords(tracker);
      expect(records.map((r) => r.id)).toEqual(["b", "a"]);
    });

    it("respects the limit argument", async () => {
      await table().add(make({ id: "a", timestamp: 100 }));
      await table().add(make({ id: "b", timestamp: 200 }));
      await table().add(make({ id: "c", timestamp: 300 }));

      const records = await getEstimateRecords(tracker, 2);
      expect(records.map((r) => r.id)).toEqual(["c", "b"]);
    });
  });

  describe("getEstimateRecordsBetween", () => {
    it("returns records within the range and excludes soft-deleted", async () => {
      await table().add(make({ id: "in", timestamp: 150 }));
      await table().add(make({ id: "out", timestamp: 5000 }));
      await table().add(make({ id: "in-del", timestamp: 160, deletedAt: 1 }));

      const records = await getEstimateRecordsBetween(tracker, 100, 1000);
      const ids = records.map((r) => r.id);
      expect(ids).toContain("in");
      expect(ids).not.toContain("out");
      expect(ids).not.toContain("in-del");
    });
  });

  describe("updateEstimateRecord", () => {
    it("updates fields and bumps updatedAt", async () => {
      await table().add(make({ id: "u1", amountEstimate: "small", updatedAt: 1000 }));

      const result = await updateEstimateRecord(tracker, "u1", { amountEstimate: "large" });
      expect(result.success).toBe(true);

      const stored = await table().get("u1");
      expect(stored!.amountEstimate).toBe("large");
      expect(stored!.updatedAt).toBeGreaterThan(1000);
    });

    it("clears the estimate and the note with null", async () => {
      await table().add(make({ id: "u2", amountEstimate: "small", note: "x" }));

      await updateEstimateRecord(tracker, "u2", { amountEstimate: null, note: null });

      const stored = await table().get("u2");
      expect(stored!.amountEstimate).toBeNull();
      expect(stored!.note).toBeNull();
    });

    it("returns an error when the record does not exist", async () => {
      const result = await updateEstimateRecord(tracker, "missing", { note: "x" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("Record not found");
      expect(await table().get("missing")).toBeUndefined();
    });
  });

  describe("soft-delete and undo", () => {
    it("deleteEstimateRecord sets deletedAt and hides the record from reads", async () => {
      await table().add(make({ id: "d1" }));

      await deleteEstimateRecord(tracker, "d1");

      const stored = await table().get("d1");
      expect(stored!.deletedAt).toBeTypeOf("number");
      const visible = await getEstimateRecords(tracker);
      expect(visible.map((r) => r.id)).not.toContain("d1");
    });

    it("undoDeleteEstimateRecord restores the record", async () => {
      await table().add(make({ id: "d2" }));
      await deleteEstimateRecord(tracker, "d2");

      await undoDeleteEstimateRecord(tracker, "d2");

      const stored = await table().get("d2");
      expect(stored!.deletedAt).toBeNull();
      const visible = await getEstimateRecords(tracker);
      expect(visible.map((r) => r.id)).toContain("d2");
    });
  });
});
