import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";

vi.mock("@/lib/sync-engine", () => ({
  schedulePush: vi.fn(),
}));

import {
  addSubstanceRecord,
  deleteSubstanceRecord,
  updateSubstanceRecord,
  getSubstanceRecords,
} from "@/lib/substance-service";
import {
  addComposableEntry,
  deleteEntryGroup,
  undoDeleteEntryGroup,
  deleteSingleGroupRecord,
  undoDeleteSingleRecord,
  getEntryGroup,
} from "@/lib/composable-entry-service";
import {
  addSchedule,
  updateSchedule,
  deleteSchedule,
  getSchedulesForPhase,
} from "@/lib/medication-schedule-service";
import { recalculateStockForItem } from "@/lib/inventory-service";
import { recalculateScheduleTimezones } from "@/lib/timezone-recalculation-service";
import { schedulePush } from "@/lib/sync-engine";

vi.mock("@/lib/timezone", () => ({
  getDeviceTimezone: () => "America/New_York",
  localHHMMStringToUTCMinutes: (_time: string, _tz: string) => 480,
  utcMinutesToLocalTime: (utcMinutes: number, _tz: string) => ({
    hours: Math.floor(utcMinutes / 60),
    minutes: utcMinutes % 60,
  }),
  localTimeToUTCMinutes: (h: number, m: number, _tz: string) => h * 60 + m,
}));

describe("Tier 2 sync-wired services", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db._syncQueue.clear();
  });

  // ── Substance ──

  describe("substance-service", () => {
    it("addSubstanceRecord (no volume) enqueues upsert for substanceRecords", async () => {
      const result = await addSubstanceRecord({
        type: "caffeine",
        amountMg: 100,
        description: "espresso",
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe("substanceRecords");
      expect(queueRows[0]!.op).toBe("upsert");
      expect(schedulePush).toHaveBeenCalled();
    });

    it("addSubstanceRecord (with volume) enqueues for both substance and intake", async () => {
      const result = await addSubstanceRecord({
        type: "caffeine",
        amountMg: 100,
        volumeMl: 250,
        description: "coffee",
      });
      expect(result.success).toBe(true);

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(2);
      const tableNames = queueRows.map((r) => r.tableName).sort();
      expect(tableNames).toEqual(["intakeRecords", "substanceRecords"]);
    });

    it("deleteSubstanceRecord enqueues upsert for soft-deleted records", async () => {
      const addResult = await addSubstanceRecord({
        type: "alcohol",
        amountStandardDrinks: 1,
        volumeMl: 330,
        description: "beer",
      });
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await deleteSubstanceRecord(addResult.data.id);

      const raw = await db.substanceRecords.get(addResult.data.id);
      expect(raw!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows.length).toBeGreaterThanOrEqual(1);
      expect(queueRows.some((r) => r.tableName === "substanceRecords")).toBe(true);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("updateSubstanceRecord enqueues upsert", async () => {
      const addResult = await addSubstanceRecord({
        type: "caffeine",
        amountMg: 50,
        description: "tea",
      });
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await updateSubstanceRecord(addResult.data.id, { amountMg: 75 });

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe("substanceRecords");
      expect(queueRows[0]!.op).toBe("upsert");
    });
  });

  // ── Composable Entry ──

  describe("composable-entry-service", () => {
    it("addComposableEntry enqueues for all created records", async () => {
      const result = await addComposableEntry({
        eating: { note: "lunch" },
        intakes: [{ type: "water", amount: 500 }],
        substance: {
          type: "caffeine",
          amountMg: 80,
          description: "green tea",
        },
      });
      expect(result.success).toBe(true);

      const queueRows = await db._syncQueue.toArray();
      // eating + intake + substance = 3
      expect(queueRows).toHaveLength(3);
      const tableNames = queueRows.map((r) => r.tableName).sort();
      expect(tableNames).toEqual(["eatingRecords", "intakeRecords", "substanceRecords"]);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("addComposableEntry with substance.volumeMl creates linked water intake", async () => {
      const result = await addComposableEntry({
        substance: {
          type: "caffeine",
          amountMg: 100,
          volumeMl: 250,
          description: "coffee",
        },
      });
      expect(result.success).toBe(true);

      const queueRows = await db._syncQueue.toArray();
      // substance + linked water intake = 2
      expect(queueRows).toHaveLength(2);
      const intakeRows = queueRows.filter((r) => r.tableName === "intakeRecords");
      expect(intakeRows).toHaveLength(1);
    });

    it("addComposableEntry with plural substances enqueues each", async () => {
      const result = await addComposableEntry({
        substances: [
          { type: "caffeine", amountMg: 80, description: "tea" },
          { type: "caffeine", amountMg: 120, description: "cola" },
        ],
      });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(2);
      expect(queueRows.every((r) => r.tableName === "substanceRecords")).toBe(true);
    });

    it("deleteEntryGroup enqueues upsert for each soft-deleted record", async () => {
      const addResult = await addComposableEntry({
        eating: { note: "snack" },
        intakes: [{ type: "water", amount: 200 }],
      });
      if (!addResult.success) return;
      await db._syncQueue.clear();

      const delResult = await deleteEntryGroup(addResult.data.groupId);
      expect(delResult.success).toBe(true);
      if (!delResult.success) return;
      expect(delResult.data.deletedCount).toBe(2);

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(2);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("undoDeleteEntryGroup enqueues upsert for each restored record", async () => {
      const addResult = await addComposableEntry({
        eating: { note: "meal" },
        intakes: [{ type: "salt", amount: 1 }],
      });
      if (!addResult.success) return;
      await deleteEntryGroup(addResult.data.groupId);
      await db._syncQueue.clear();

      const undoResult = await undoDeleteEntryGroup(addResult.data.groupId);
      expect(undoResult.success).toBe(true);
      if (!undoResult.success) return;
      expect(undoResult.data.restoredCount).toBe(2);

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(2);
    });

    it("deleteSingleGroupRecord enqueues upsert", async () => {
      const addResult = await addComposableEntry({
        intakes: [{ type: "water", amount: 300 }],
      });
      if (!addResult.success) return;
      const intakeId = addResult.data.intakeIds[0]!;
      await db._syncQueue.clear();

      await deleteSingleGroupRecord("intakeRecords", intakeId);

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe("intakeRecords");
      expect(schedulePush).toHaveBeenCalled();
    });

    it("undoDeleteSingleRecord enqueues upsert", async () => {
      const addResult = await addComposableEntry({
        intakes: [{ type: "water", amount: 300 }],
      });
      if (!addResult.success) return;
      const intakeId = addResult.data.intakeIds[0]!;
      await deleteSingleGroupRecord("intakeRecords", intakeId);
      await db._syncQueue.clear();

      await undoDeleteSingleRecord("intakeRecords", intakeId);

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe("intakeRecords");
    });
  });

  // ── Medication Schedule ──

  describe("medication-schedule-service", () => {
    const makeScheduleInput = () => ({
      phaseId: crypto.randomUUID(),
      time: "08:00",
      dosage: 10,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      scheduleTimeUTC: 480,
      anchorTimezone: "America/New_York",
    });

    it("addSchedule enqueues upsert for phaseSchedules and auditLogs", async () => {
      const result = await addSchedule(makeScheduleInput());
      expect(result.success).toBe(true);

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(2);
      const tableNames = queueRows.map((r) => r.tableName).sort();
      expect(tableNames).toEqual(["auditLogs", "phaseSchedules"]);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("updateSchedule enqueues upsert for phaseSchedules and auditLogs", async () => {
      const addResult = await addSchedule(makeScheduleInput());
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await updateSchedule(addResult.data.id, { dosage: 20 });

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(2);
      const tableNames = queueRows.map((r) => r.tableName).sort();
      expect(tableNames).toEqual(["auditLogs", "phaseSchedules"]);
    });

    it("deleteSchedule soft-deletes instead of hard-delete", async () => {
      const addResult = await addSchedule(makeScheduleInput());
      if (!addResult.success) return;
      await db._syncQueue.clear();

      const delResult = await deleteSchedule(addResult.data.id);
      expect(delResult.success).toBe(true);

      const raw = await db.phaseSchedules.get(addResult.data.id);
      expect(raw).toBeDefined();
      expect(raw!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows.some((r) => r.tableName === "phaseSchedules")).toBe(true);
    });

    it("getSchedulesForPhase filters soft-deleted", async () => {
      const phaseId = crypto.randomUUID();
      const r1 = await addSchedule({ ...makeScheduleInput(), phaseId });
      const r2 = await addSchedule({ ...makeScheduleInput(), phaseId, time: "12:00" });
      if (!r1.success || !r2.success) return;
      await deleteSchedule(r1.data.id);

      const schedules = await getSchedulesForPhase(phaseId);
      expect(schedules).toHaveLength(1);
      expect(schedules[0]!.id).toBe(r2.data.id);
    });
  });

  // ── Timezone Recalculation ──

  describe("timezone-recalculation-service", () => {
    it("recalculateScheduleTimezones enqueues upsert for each updated schedule", async () => {
      const phaseId = crypto.randomUUID();
      await db.phaseSchedules.add({
        id: crypto.randomUUID(),
        phaseId,
        time: "08:00",
        dosage: 10,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
        scheduleTimeUTC: 480,
        anchorTimezone: "America/New_York",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        deviceId: "test",
      });
      await db._syncQueue.clear();

      const count = await recalculateScheduleTimezones("Europe/London");
      expect(count).toBe(1);

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows.some((r) => r.tableName === "phaseSchedules")).toBe(true);
      expect(queueRows.some((r) => r.tableName === "auditLogs")).toBe(true);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("does not enqueue when no schedules need updating", async () => {
      const count = await recalculateScheduleTimezones("America/New_York");
      expect(count).toBe(0);

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(0);
      expect(schedulePush).not.toHaveBeenCalled();
    });
  });

  // ── Inventory ──

  describe("inventory-service", () => {
    it("recalculateStockForItem enqueues upsert for inventoryItems", async () => {
      const itemId = crypto.randomUUID();
      await db.inventoryItems.add({
        id: itemId,
        prescriptionId: crypto.randomUUID(),
        brandName: "TestBrand",
        strength: 10,
        unit: "mg",
        pillShape: "round",
        pillColor: "white",
        currentStock: 0,
        isActive: true,
        isArchived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        deviceId: "test",
        timezone: "America/New_York",
      });
      await db._syncQueue.clear();

      const stock = await recalculateStockForItem(itemId);
      expect(stock).toBe(0);

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(1);
      expect(queueRows[0]!.tableName).toBe("inventoryItems");
      expect(queueRows[0]!.op).toBe("upsert");
      expect(schedulePush).toHaveBeenCalled();
    });
  });
});
