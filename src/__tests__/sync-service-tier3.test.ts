import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";

vi.mock("@/lib/sync-engine", () => ({
  schedulePush: vi.fn(),
}));

vi.mock("@/lib/timezone", () => ({
  getDeviceTimezone: () => "America/New_York",
  localHHMMStringToUTCMinutes: (_time: string, _tz: string) => 480,
  utcMinutesToLocalTime: (utcMinutes: number, _tz: string) => ({
    hours: Math.floor(utcMinutes / 60),
    minutes: utcMinutes % 60,
  }),
  localTimeToUTCMinutes: (h: number, m: number, _tz: string) => h * 60 + m,
}));

import {
  addPrescription,
  deletePrescription,
  updatePrescription,
  getPrescriptions,
  deleteInventoryItem,
  deletePhase,
} from "@/lib/medication-service";
import {
  takeDose,
  getDoseLogsForDate,
} from "@/lib/dose-log-service";
import {
  createTitrationPlan,
  deleteTitrationPlan,
  getTitrationPlans,
} from "@/lib/titration-service";
import { schedulePush } from "@/lib/sync-engine";

const makePrescriptionInput = () => ({
  genericName: "TestDrug",
  indication: "Testing",
  unit: "mg",
  foodInstruction: "none" as const,
  brandName: "TestBrand",
  currentStock: 30,
  strength: 10,
  pillShape: "round" as const,
  pillColor: "white",
  schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 10 }],
});

describe("Tier 3 sync-wired services", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db._syncQueue.clear();
  });

  // ── Medication Service ──

  describe("medication-service", () => {
    it("addPrescription enqueues for all created records", async () => {
      const result = await addPrescription(makePrescriptionInput());
      expect(result.success).toBe(true);

      const queueRows = await db._syncQueue.toArray();
      // prescription + phase + schedule + inventory + transaction (initial stock) + audit = 6
      expect(queueRows).toHaveLength(6);
      const tableNames = queueRows.map((r) => r.tableName).sort();
      expect(tableNames).toContain("prescriptions");
      expect(tableNames).toContain("medicationPhases");
      expect(tableNames).toContain("phaseSchedules");
      expect(tableNames).toContain("inventoryItems");
      expect(tableNames).toContain("inventoryTransactions");
      expect(tableNames).toContain("auditLogs");
      expect(schedulePush).toHaveBeenCalled();
    });

    it("updatePrescription enqueues upsert for prescriptions and auditLogs", async () => {
      const addResult = await addPrescription(makePrescriptionInput());
      if (!addResult.success) return;
      await db._syncQueue.clear();

      await updatePrescription(addResult.data.prescription.id, { notes: "updated" });

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows).toHaveLength(2);
      const tableNames = queueRows.map((r) => r.tableName).sort();
      expect(tableNames).toEqual(["auditLogs", "prescriptions"]);
    });

    it("deletePrescription soft-deletes cascade and enqueues", async () => {
      const addResult = await addPrescription(makePrescriptionInput());
      if (!addResult.success) return;
      const rxId = addResult.data.prescription.id;
      await db._syncQueue.clear();

      await deletePrescription(rxId);

      const rawRx = await db.prescriptions.get(rxId);
      expect(rawRx!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      // prescription + phase + schedule + inventory + audit >= 5
      expect(queueRows.length).toBeGreaterThanOrEqual(5);
      expect(queueRows.some((r) => r.tableName === "prescriptions")).toBe(true);
      expect(queueRows.some((r) => r.tableName === "medicationPhases")).toBe(true);
      expect(queueRows.some((r) => r.tableName === "phaseSchedules")).toBe(true);
      expect(queueRows.some((r) => r.tableName === "inventoryItems")).toBe(true);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("getPrescriptions filters soft-deleted", async () => {
      const r1 = await addPrescription(makePrescriptionInput());
      const r2 = await addPrescription({ ...makePrescriptionInput(), genericName: "Drug2" });
      if (!r1.success || !r2.success) return;

      await deletePrescription(r1.data.prescription.id);

      const prescriptions = await getPrescriptions();
      expect(prescriptions).toHaveLength(1);
      expect(prescriptions[0]!.id).toBe(r2.data.prescription.id);
    });

    it("deleteInventoryItem soft-deletes", async () => {
      const addResult = await addPrescription(makePrescriptionInput());
      if (!addResult.success) return;
      const invId = addResult.data.inventory.id;
      await db._syncQueue.clear();

      await deleteInventoryItem(invId);

      const raw = await db.inventoryItems.get(invId);
      expect(raw!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows.some((r) => r.tableName === "inventoryItems")).toBe(true);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("deletePhase soft-deletes schedules and phase", async () => {
      const addResult = await addPrescription(makePrescriptionInput());
      if (!addResult.success) return;
      const phase = addResult.data.phase!;
      await db._syncQueue.clear();

      await deletePhase(phase.id);

      const rawPhase = await db.medicationPhases.get(phase.id);
      expect(rawPhase!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows.some((r) => r.tableName === "medicationPhases")).toBe(true);
      expect(queueRows.some((r) => r.tableName === "phaseSchedules")).toBe(true);
      expect(schedulePush).toHaveBeenCalled();
    });
  });

  // ── Dose Log Service ──

  describe("dose-log-service", () => {
    it("takeDose enqueues for doseLogs and auditLogs", async () => {
      const rxId = crypto.randomUUID();
      const phaseId = crypto.randomUUID();
      const scheduleId = crypto.randomUUID();
      const now = Date.now();

      await db.prescriptions.add({
        id: rxId,
        genericName: "Test",
        indication: "Test",
        isActive: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: "test",
      });
      await db.medicationPhases.add({
        id: phaseId,
        prescriptionId: rxId,
        type: "maintenance",
        unit: "mg",
        startDate: now,
        foodInstruction: "none",
        status: "active",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: "test",
      });
      await db.phaseSchedules.add({
        id: scheduleId,
        phaseId,
        time: "08:00",
        scheduleTimeUTC: 480,
        anchorTimezone: "America/New_York",
        dosage: 10,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: "test",
      });
      await db._syncQueue.clear();

      const result = await takeDose({
        prescriptionId: rxId,
        phaseId,
        scheduleId,
        date: "2024-01-15",
        time: "08:00",
        dosageMg: 10,
      });
      expect(result.success).toBe(true);

      const queueRows = await db._syncQueue.toArray();
      // At minimum: doseLogs + auditLogs = 2
      expect(queueRows.length).toBeGreaterThanOrEqual(2);
      expect(queueRows.some((r) => r.tableName === "doseLogs")).toBe(true);
      expect(queueRows.some((r) => r.tableName === "auditLogs")).toBe(true);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("getDoseLogsForDate filters soft-deleted", async () => {
      const now = Date.now();
      const date = "2024-01-15";

      await db.doseLogs.bulkAdd([
        {
          id: crypto.randomUUID(),
          prescriptionId: "rx1",
          phaseId: "ph1",
          scheduleId: "sc1",
          scheduledDate: date,
          scheduledTime: "08:00",
          status: "taken" as const,
          actionTimestamp: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          deviceId: "test",
          timezone: "America/New_York",
        },
        {
          id: crypto.randomUUID(),
          prescriptionId: "rx2",
          phaseId: "ph2",
          scheduleId: "sc2",
          scheduledDate: date,
          scheduledTime: "12:00",
          status: "taken" as const,
          actionTimestamp: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
          deviceId: "test",
          timezone: "America/New_York",
        },
      ]);

      const logs = await getDoseLogsForDate(date);
      expect(logs).toHaveLength(1);
    });
  });

  // ── Titration Service ──

  describe("titration-service", () => {
    it("createTitrationPlan enqueues for all created records", async () => {
      const rxId = crypto.randomUUID();
      await db.prescriptions.add({
        id: rxId,
        genericName: "Test",
        indication: "Test",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        deviceId: "test",
      });
      await db._syncQueue.clear();

      const result = await createTitrationPlan({
        title: "Test Plan",
        conditionLabel: "Test",
        entries: [{
          prescriptionId: rxId,
          unit: "mg",
          schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 5 }],
        }],
      });
      expect(result.success).toBe(true);

      const queueRows = await db._syncQueue.toArray();
      // plan + phase + schedule + audit = 4
      expect(queueRows).toHaveLength(4);
      const tableNames = queueRows.map((r) => r.tableName).sort();
      expect(tableNames).toContain("titrationPlans");
      expect(tableNames).toContain("medicationPhases");
      expect(tableNames).toContain("phaseSchedules");
      expect(tableNames).toContain("auditLogs");
      expect(schedulePush).toHaveBeenCalled();
    });

    it("deleteTitrationPlan soft-deletes cascade", async () => {
      const rxId = crypto.randomUUID();
      await db.prescriptions.add({
        id: rxId,
        genericName: "Test",
        indication: "Test",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        deviceId: "test",
      });

      const createResult = await createTitrationPlan({
        title: "Test Plan",
        conditionLabel: "Test",
        entries: [{
          prescriptionId: rxId,
          unit: "mg",
          schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: 5 }],
        }],
      });
      if (!createResult.success) return;
      const planId = createResult.data.id;
      await db._syncQueue.clear();

      await deleteTitrationPlan(planId);

      const rawPlan = await db.titrationPlans.get(planId);
      expect(rawPlan!.deletedAt).not.toBeNull();

      const queueRows = await db._syncQueue.toArray();
      expect(queueRows.some((r) => r.tableName === "titrationPlans")).toBe(true);
      expect(queueRows.some((r) => r.tableName === "medicationPhases")).toBe(true);
      expect(queueRows.some((r) => r.tableName === "phaseSchedules")).toBe(true);
      expect(schedulePush).toHaveBeenCalled();
    });

    it("getTitrationPlans filters soft-deleted", async () => {
      const now = Date.now();
      await db.titrationPlans.bulkAdd([
        {
          id: crypto.randomUUID(),
          title: "Plan 1",
          conditionLabel: "Test",
          status: "draft" as const,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          deviceId: "test",
        },
        {
          id: crypto.randomUUID(),
          title: "Plan 2",
          conditionLabel: "Test",
          status: "draft" as const,
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
          deviceId: "test",
        },
      ]);

      const plans = await getTitrationPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0]!.title).toBe("Plan 1");
    });
  });
});
