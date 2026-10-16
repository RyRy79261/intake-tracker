import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";

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
} from "@/lib/health-service";
import {
  addBloodPressureRecord,
  getBloodPressureRecords,
  deleteBloodPressureRecord,
  undoDeleteBloodPressureRecord,
} from "@/lib/health-service";
import {
  addEatingRecord,
  getEatingRecords,
  getEatingRecordsByDateRange,
  deleteEatingRecord,
  undoDeleteEatingRecord,
  updateEatingRecord,
} from "@/lib/eating-service";
import {
  addEstimateRecord,
  getEstimateRecords,
  getEstimateRecordsBetween,
  deleteEstimateRecord,
  undoDeleteEstimateRecord,
  updateEstimateRecord,
} from "@/lib/estimate-tracker-service";
import { ESTIMATE_TRACKERS, ESTIMATE_TRACKER_IDS } from "@/lib/estimate-trackers";
import { writeAuditLog, buildAuditEntry } from "@/lib/audit-service";
import { schedulePush } from "@/lib/sync-engine";

describe("Tier 1 sync-wired services", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db._syncQueue.clear();
  });

  // ── Weight ──

  describe("weight-service", () => {
    it("addWeightRecord enqueues upsert and calls schedulePush", async () => {
      const result = await addWeightRecord(75);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe("weightRecords");
      expect(queueRows[0]!.op).toBe("upsert");
      expect(queueRows[0]!.recordId).toBe(result.data.id);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("deleteWeightRecord soft-deletes and enqueues delete op", async () => {
      const addResult = await addWeightRecord(80);
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;
      await db._syncQueue.clear();

      const delResult = await deleteWeightRecord(addResult.data.id);
      expect(delResult.success).toBe(true);

      const raw = await db.weightRecords.get(addResult.data.id);
      expect(raw).toBeDefined();
      expect(raw!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.op).toBe("delete");
    });

    it("undoDeleteWeightRecord restores record and enqueues upsert", async () => {
      const addResult = await addWeightRecord(80);
      if (!addResult.success) return;
      await deleteWeightRecord(addResult.data.id);
      await db._syncQueue.clear();

      const undoResult = await undoDeleteWeightRecord(addResult.data.id);
      expect(undoResult.success).toBe(true);

      const raw = await db.weightRecords.get(addResult.data.id);
      expect(raw!.deletedAt).toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows[0]!.op).toBe("upsert");
    });

    it("getWeightRecords filters out soft-deleted records", async () => {
      const r1 = await addWeightRecord(70);
      const r2 = await addWeightRecord(75);
      if (!r1.success || !r2.success) return;
      await deleteWeightRecord(r1.data.id);

      const records = await getWeightRecords();
      expect(records).toHaveLength(1);
      expect(records[0]!.id).toBe(r2.data.id);
    });

    it("getWeightRecordsByDateRange filters out soft-deleted records", async () => {
      const now = Date.now();
      const r1 = await addWeightRecord(70, now - 1000);
      const r2 = await addWeightRecord(75, now);
      if (!r1.success || !r2.success) return;
      await deleteWeightRecord(r1.data.id);

      const records = await getWeightRecordsByDateRange(now - 2000, now + 1000);
      expect(records).toHaveLength(1);
      expect(records[0]!.id).toBe(r2.data.id);
    });

    it("getLatestWeightRecord skips soft-deleted records", async () => {
      const r1 = await addWeightRecord(70, Date.now() - 1000);
      const r2 = await addWeightRecord(75, Date.now());
      if (!r1.success || !r2.success) return;
      await deleteWeightRecord(r2.data.id);

      const latest = await getLatestWeightRecord();
      expect(latest?.id).toBe(r1.data.id);
    });

    it("updateWeightRecord enqueues upsert", async () => {
      const addResult = await addWeightRecord(70);
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await updateWeightRecord(addResult.data.id, { weight: 72 });

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.op).toBe("upsert");
    });
  });

  // ── Blood Pressure ──

  describe("blood-pressure-service", () => {
    it("addBloodPressureRecord enqueues upsert", async () => {
      const result = await addBloodPressureRecord(120, 80, "sitting", "left");
      expect(result.success).toBe(true);
      if (!result.success) return;

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe("bloodPressureRecords");
      expect(queueRows[0]!.op).toBe("upsert");
    });

    it("deleteBloodPressureRecord soft-deletes and enqueues delete", async () => {
      const addResult = await addBloodPressureRecord(130, 85, "standing", "right");
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await deleteBloodPressureRecord(addResult.data.id);

      const raw = await db.bloodPressureRecords.get(addResult.data.id);
      expect(raw!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows[0]!.op).toBe("delete");
    });

    it("getBloodPressureRecords filters soft-deleted", async () => {
      const r1 = await addBloodPressureRecord(120, 80, "sitting", "left");
      const r2 = await addBloodPressureRecord(130, 85, "standing", "right");
      if (!r1.success || !r2.success) return;
      await deleteBloodPressureRecord(r1.data.id);

      const records = await getBloodPressureRecords();
      expect(records).toHaveLength(1);
      expect(records[0]!.id).toBe(r2.data.id);
    });

    it("undoDeleteBloodPressureRecord restores record", async () => {
      const addResult = await addBloodPressureRecord(120, 80, "sitting", "left");
      if (!addResult.success) return;
      await deleteBloodPressureRecord(addResult.data.id);

      await undoDeleteBloodPressureRecord(addResult.data.id);
      const records = await getBloodPressureRecords();
      expect(records).toHaveLength(1);
    });
  });

  // ── Eating ──

  describe("eating-service", () => {
    it("addEatingRecord enqueues upsert", async () => {
      const result = await addEatingRecord(undefined, "lunch", 300);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe("eatingRecords");
      expect(queueRows[0]!.op).toBe("upsert");
    });

    it("deleteEatingRecord soft-deletes via writeWithSync", async () => {
      const addResult = await addEatingRecord(undefined, "snack");
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await deleteEatingRecord(addResult.data.id);

      const raw = await db.eatingRecords.get(addResult.data.id);
      expect(raw!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows[0]!.op).toBe("delete");
    });

    it("getEatingRecords filters soft-deleted", async () => {
      const r1 = await addEatingRecord(undefined, "breakfast");
      const r2 = await addEatingRecord(undefined, "dinner");
      if (!r1.success || !r2.success) return;
      await deleteEatingRecord(r1.data.id);

      const records = await getEatingRecords();
      expect(records).toHaveLength(1);
    });

    it("getEatingRecordsByDateRange filters soft-deleted", async () => {
      const now = Date.now();
      const r1 = await addEatingRecord(now - 500, "a");
      const r2 = await addEatingRecord(now, "b");
      if (!r1.success || !r2.success) return;
      await deleteEatingRecord(r1.data.id);

      const records = await getEatingRecordsByDateRange(now - 1000, now + 1000);
      expect(records).toHaveLength(1);
    });

    it("undoDeleteEatingRecord restores and enqueues upsert", async () => {
      const addResult = await addEatingRecord(undefined, "food");
      if (!addResult.success) return;
      await deleteEatingRecord(addResult.data.id);
      await db._syncQueue.clear();

      await undoDeleteEatingRecord(addResult.data.id);

      const raw = await db.eatingRecords.get(addResult.data.id);
      expect(raw!.deletedAt).toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows[0]!.op).toBe("upsert");
    });

    it("updateEatingRecord enqueues upsert", async () => {
      const addResult = await addEatingRecord(undefined, "meal", 200);
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await updateEatingRecord(addResult.data.id, { grams: 350 });

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.op).toBe("upsert");
    });
  });

  // ── Urination, defecation ──

  describe.each(ESTIMATE_TRACKER_IDS)("estimate-tracker-service (%s)", (tracker) => {
    const { table } = ESTIMATE_TRACKERS[tracker];

    it("addEstimateRecord enqueues upsert", async () => {
      const result = await addEstimateRecord(tracker, { amountEstimate: "medium" });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe(table);
      expect(queueRows[0]!.op).toBe("upsert");
    });

    it("deleteEstimateRecord soft-deletes instead of hard-delete", async () => {
      const addResult = await addEstimateRecord(tracker, { amountEstimate: "small" });
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await deleteEstimateRecord(tracker, addResult.data.id);

      const raw = await db[table].get(addResult.data.id);
      expect(raw).toBeDefined();
      expect(raw!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows[0]!.tableName).toBe(table);
      expect(queueRows[0]!.op).toBe("delete");
    });

    it("getEstimateRecords filters soft-deleted", async () => {
      const r1 = await addEstimateRecord(tracker);
      const r2 = await addEstimateRecord(tracker);
      if (!r1.success || !r2.success) return;
      await deleteEstimateRecord(tracker, r1.data.id);

      const records = await getEstimateRecords(tracker);
      expect(records).toHaveLength(1);
    });

    it("getEstimateRecordsBetween filters soft-deleted", async () => {
      const now = Date.now();
      const r1 = await addEstimateRecord(tracker, { timestamp: now - 500 });
      const r2 = await addEstimateRecord(tracker, { timestamp: now });
      if (!r1.success || !r2.success) return;
      await deleteEstimateRecord(tracker, r1.data.id);

      const records = await getEstimateRecordsBetween(tracker, now - 1000, now + 1000);
      expect(records).toHaveLength(1);
    });

    it("undoDeleteEstimateRecord restores record", async () => {
      const addResult = await addEstimateRecord(tracker);
      if (!addResult.success) return;
      await deleteEstimateRecord(tracker, addResult.data.id);

      await undoDeleteEstimateRecord(tracker, addResult.data.id);
      const records = await getEstimateRecords(tracker);
      expect(records).toHaveLength(1);
    });

    it("updateEstimateRecord enqueues upsert", async () => {
      const addResult = await addEstimateRecord(tracker, { amountEstimate: "small" });
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await updateEstimateRecord(tracker, addResult.data.id, { amountEstimate: "large" });

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows[0]!.tableName).toBe(table);
      expect(queueRows[0]!.op).toBe("upsert");
    });
  });

  // ── Audit ──

  describe("audit-service", () => {
    it("writeAuditLog enqueues upsert for auditLogs table", async () => {
      await writeAuditLog("data_export", { format: "json" });

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe("auditLogs");
      expect(queueRows[0]!.op).toBe("upsert");
      expect(schedulePush).toHaveBeenCalled();
    });

    it("buildAuditEntry does not touch the sync queue", async () => {
      buildAuditEntry("settings_change", { key: "theme" });

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(0);
    });
  });
});
