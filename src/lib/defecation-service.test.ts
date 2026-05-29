import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { makeDefecationRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  addDefecationRecord,
  getDefecationRecords,
  getDefecationRecordsByDateRange,
  updateDefecationRecord,
  deleteDefecationRecord,
  undoDeleteDefecationRecord,
} from "@/lib/defecation-service";

// Setup (fake-indexeddb, db reset per test) is handled by src/__tests__/setup.ts.

describe("defecation-service", () => {
  describe("addDefecationRecord", () => {
    it("creates a record with a generated id and supplied fields", async () => {
      const result = await addDefecationRecord(1000, "large", "after coffee");
      expect(result.success).toBe(true);
      if (!result.success) return;

      const stored = await db.defecationRecords.get(result.data.id);
      expect(stored).toBeDefined();
      expect(stored!.timestamp).toBe(1000);
      expect(stored!.amountEstimate).toBe("large");
      expect(stored!.note).toBe("after coffee");
      expect(stored!.deletedAt).toBeNull();
    });

    it("trims and omits blank amount/note", async () => {
      const result = await addDefecationRecord(2000, "   ", "  ");
      expect(result.success).toBe(true);
      if (!result.success) return;

      const stored = await db.defecationRecords.get(result.data.id);
      expect(stored!.amountEstimate).toBeUndefined();
      expect(stored!.note).toBeUndefined();
    });
  });

  describe("getDefecationRecords", () => {
    it("returns active records newest-first and filters soft-deleted ones", async () => {
      await db.defecationRecords.add(makeDefecationRecord({ id: "a", timestamp: 100 }));
      await db.defecationRecords.add(makeDefecationRecord({ id: "b", timestamp: 300 }));
      await db.defecationRecords.add(
        makeDefecationRecord({ id: "gone", timestamp: 200, deletedAt: 999 }),
      );

      const records = await getDefecationRecords();
      expect(records.map((r) => r.id)).toEqual(["b", "a"]);
    });

    it("respects the limit argument", async () => {
      await db.defecationRecords.add(makeDefecationRecord({ id: "a", timestamp: 100 }));
      await db.defecationRecords.add(makeDefecationRecord({ id: "b", timestamp: 200 }));
      await db.defecationRecords.add(makeDefecationRecord({ id: "c", timestamp: 300 }));

      const records = await getDefecationRecords(2);
      expect(records.map((r) => r.id)).toEqual(["c", "b"]);
    });
  });

  describe("getDefecationRecordsByDateRange", () => {
    it("returns records within the range and excludes soft-deleted", async () => {
      await db.defecationRecords.add(makeDefecationRecord({ id: "in", timestamp: 150 }));
      await db.defecationRecords.add(makeDefecationRecord({ id: "out", timestamp: 5000 }));
      await db.defecationRecords.add(
        makeDefecationRecord({ id: "in-del", timestamp: 160, deletedAt: 1 }),
      );

      const records = await getDefecationRecordsByDateRange(100, 1000);
      const ids = records.map((r) => r.id);
      expect(ids).toContain("in");
      expect(ids).not.toContain("out");
      expect(ids).not.toContain("in-del");
    });
  });

  describe("updateDefecationRecord", () => {
    it("updates fields and bumps updatedAt", async () => {
      await db.defecationRecords.add(
        makeDefecationRecord({ id: "u1", amountEstimate: "small", updatedAt: 1000 }),
      );

      const result = await updateDefecationRecord("u1", { amountEstimate: "large" });
      expect(result.success).toBe(true);

      const stored = await db.defecationRecords.get("u1");
      expect(stored!.amountEstimate).toBe("large");
      expect(stored!.updatedAt).toBeGreaterThan(1000);
    });

    it("returns an error when the record does not exist", async () => {
      const result = await updateDefecationRecord("missing", { note: "x" });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toBe("Record not found");
    });
  });

  describe("soft-delete and undo", () => {
    it("deleteDefecationRecord sets deletedAt and hides the record from reads", async () => {
      await db.defecationRecords.add(makeDefecationRecord({ id: "d1" }));

      await deleteDefecationRecord("d1");

      const stored = await db.defecationRecords.get("d1");
      expect(stored!.deletedAt).toBeTypeOf("number");
      const visible = await getDefecationRecords();
      expect(visible.map((r) => r.id)).not.toContain("d1");
    });

    it("undoDeleteDefecationRecord restores the record", async () => {
      await db.defecationRecords.add(makeDefecationRecord({ id: "d2" }));
      await deleteDefecationRecord("d2");

      await undoDeleteDefecationRecord("d2");

      const stored = await db.defecationRecords.get("d2");
      expect(stored!.deletedAt).toBeNull();
      const visible = await getDefecationRecords();
      expect(visible.map((r) => r.id)).toContain("d2");
    });
  });
});
