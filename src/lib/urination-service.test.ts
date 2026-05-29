import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { makeUrinationRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  addUrinationRecord,
  getUrinationRecords,
  getUrinationRecordsByDateRange,
  updateUrinationRecord,
  deleteUrinationRecord,
  undoDeleteUrinationRecord,
} from "@/lib/urination-service";

// Setup (fake-indexeddb, db reset per test) is handled by src/__tests__/setup.ts.

describe("urination-service", () => {
  describe("addUrinationRecord", () => {
    it("creates a record with a generated id and supplied fields", async () => {
      const result = await addUrinationRecord(1000, "small", "morning");
      expect(result.success).toBe(true);
      if (!result.success) return;

      const stored = await db.urinationRecords.get(result.data.id);
      expect(stored).toBeDefined();
      expect(stored!.timestamp).toBe(1000);
      expect(stored!.amountEstimate).toBe("small");
      expect(stored!.note).toBe("morning");
      expect(stored!.deletedAt).toBeNull();
    });

    it("trims and omits blank amount/note", async () => {
      const result = await addUrinationRecord(2000, "  ", "   ");
      expect(result.success).toBe(true);
      if (!result.success) return;

      const stored = await db.urinationRecords.get(result.data.id);
      expect(stored!.amountEstimate).toBeUndefined();
      expect(stored!.note).toBeUndefined();
    });
  });

  describe("getUrinationRecords", () => {
    it("returns active records newest-first and filters soft-deleted ones", async () => {
      await db.urinationRecords.add(makeUrinationRecord({ id: "a", timestamp: 100 }));
      await db.urinationRecords.add(makeUrinationRecord({ id: "b", timestamp: 300 }));
      await db.urinationRecords.add(
        makeUrinationRecord({ id: "gone", timestamp: 200, deletedAt: 999 }),
      );

      const records = await getUrinationRecords();
      expect(records.map((r) => r.id)).toEqual(["b", "a"]);
    });

    it("respects the limit argument", async () => {
      await db.urinationRecords.add(makeUrinationRecord({ id: "a", timestamp: 100 }));
      await db.urinationRecords.add(makeUrinationRecord({ id: "b", timestamp: 200 }));
      await db.urinationRecords.add(makeUrinationRecord({ id: "c", timestamp: 300 }));

      const records = await getUrinationRecords(2);
      expect(records.map((r) => r.id)).toEqual(["c", "b"]);
    });
  });

  describe("getUrinationRecordsByDateRange", () => {
    it("returns records within the range and excludes soft-deleted", async () => {
      await db.urinationRecords.add(makeUrinationRecord({ id: "in", timestamp: 150 }));
      await db.urinationRecords.add(makeUrinationRecord({ id: "out", timestamp: 5000 }));
      await db.urinationRecords.add(
        makeUrinationRecord({ id: "in-del", timestamp: 160, deletedAt: 1 }),
      );

      const records = await getUrinationRecordsByDateRange(100, 1000);
      const ids = records.map((r) => r.id);
      expect(ids).toContain("in");
      expect(ids).not.toContain("out");
      expect(ids).not.toContain("in-del");
    });
  });

  describe("updateUrinationRecord", () => {
    it("updates fields and bumps updatedAt", async () => {
      await db.urinationRecords.add(
        makeUrinationRecord({ id: "u1", amountEstimate: "small", updatedAt: 1000 }),
      );

      const result = await updateUrinationRecord("u1", { amountEstimate: "large" });
      expect(result.success).toBe(true);

      const stored = await db.urinationRecords.get("u1");
      expect(stored!.amountEstimate).toBe("large");
      expect(stored!.updatedAt).toBeGreaterThan(1000);
    });

    // Consolidated onto the shared updateRecord helper, urination now matches
    // intake/defecation: updating a missing id returns a "Record not found"
    // error rather than silently succeeding as a Dexie no-op.
    it("returns an error when the record does not exist", async () => {
      const result = await updateUrinationRecord("missing", { note: "x" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe("Record not found");
      const stored = await db.urinationRecords.get("missing");
      expect(stored).toBeUndefined();
    });
  });

  describe("soft-delete and undo", () => {
    it("deleteUrinationRecord sets deletedAt and hides the record from reads", async () => {
      await db.urinationRecords.add(makeUrinationRecord({ id: "d1" }));

      await deleteUrinationRecord("d1");

      const stored = await db.urinationRecords.get("d1");
      expect(stored!.deletedAt).toBeTypeOf("number");
      const visible = await getUrinationRecords();
      expect(visible.map((r) => r.id)).not.toContain("d1");
    });

    it("undoDeleteUrinationRecord restores the record", async () => {
      await db.urinationRecords.add(makeUrinationRecord({ id: "d2" }));
      await deleteUrinationRecord("d2");

      await undoDeleteUrinationRecord("d2");

      const stored = await db.urinationRecords.get("d2");
      expect(stored!.deletedAt).toBeNull();
      const visible = await getUrinationRecords();
      expect(visible.map((r) => r.id)).toContain("d2");
    });
  });
});
