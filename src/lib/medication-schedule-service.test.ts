import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";
import {
  getDailySchedule,
  getSchedulesForPhase,
  addSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/lib/medication-schedule-service";

describe("getDailySchedule", () => {
  it("returns Map with prescriptionId-keyed entries for matching dayOfWeek", async () => {
    const rx = makePrescription({ id: "rx-daily-1", isActive: true });
    const phase = makeMedicationPhase(rx.id, { id: "phase-daily-1", status: "active" });
    const schedule = makePhaseSchedule(phase.id, {
      id: "sched-daily-1",
      time: "08:00",
      dosage: 50,
      daysOfWeek: [1, 2, 3, 4, 5],
      enabled: true,
    });
    const item = makeInventoryItem(rx.id, { id: "inv-daily-1", isActive: true, isArchived: false });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    await db.inventoryItems.add(item);

    // dayOfWeek=2 (Tuesday) is in [1,2,3,4,5]
    const result = await getDailySchedule(2);
    expect(result.size).toBeGreaterThan(0);

    // Verify structure: grouped by time
    const entries = result.get("08:00");
    expect(entries).toBeDefined();
    expect(entries!.length).toBe(1);
    expect(entries![0].prescription.id).toBe("rx-daily-1");
    expect(entries![0].phase.id).toBe("phase-daily-1");
    expect(entries![0].schedule.id).toBe("sched-daily-1");
    expect(entries![0].inventory).toBeDefined();
    expect(entries![0].inventory!.id).toBe("inv-daily-1");
  });

  it("returns empty Map for dayOfWeek with no matching schedules", async () => {
    const rx = makePrescription({ id: "rx-empty-sched", isActive: true });
    const phase = makeMedicationPhase(rx.id, { id: "phase-empty-sched", status: "active" });
    const schedule = makePhaseSchedule(phase.id, {
      id: "sched-weekday",
      time: "09:00",
      daysOfWeek: [1, 2, 3, 4, 5], // weekdays only
      enabled: true,
    });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);

    // dayOfWeek=0 (Sunday) not in [1,2,3,4,5]
    const result = await getDailySchedule(0);
    expect(result.size).toBe(0);
  });

  it("excludes schedules for inactive prescriptions", async () => {
    const rx = makePrescription({ id: "rx-inactive", isActive: false });
    const phase = makeMedicationPhase(rx.id, { id: "phase-inactive", status: "active" });
    const schedule = makePhaseSchedule(phase.id, {
      id: "sched-inactive",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      enabled: true,
    });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);

    const result = await getDailySchedule(2);
    expect(result.size).toBe(0);
  });

  it("excludes disabled schedules", async () => {
    const rx = makePrescription({ id: "rx-disabled", isActive: true });
    const phase = makeMedicationPhase(rx.id, { id: "phase-disabled", status: "active" });
    const schedule = makePhaseSchedule(phase.id, {
      id: "sched-disabled",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      enabled: false,
    });

    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);

    const result = await getDailySchedule(2);
    expect(result.size).toBe(0);
  });
});

describe("getSchedulesForPhase", () => {
  it("returns all schedules for a given phase", async () => {
    const rx = makePrescription({ id: "rx-phase-q" });
    const phase = makeMedicationPhase(rx.id, { id: "phase-q" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);

    await db.phaseSchedules.bulkAdd([
      makePhaseSchedule(phase.id, { id: "sched-q1", time: "08:00" }),
      makePhaseSchedule(phase.id, { id: "sched-q2", time: "20:00" }),
      makePhaseSchedule("other-phase", { id: "sched-other" }),
    ]);

    const schedules = await getSchedulesForPhase(phase.id);
    expect(schedules).toHaveLength(2);
    expect(schedules.map(s => s.id).sort()).toEqual(["sched-q1", "sched-q2"]);
  });
});

describe("addSchedule", () => {
  it("creates a PhaseSchedule with correct fields", async () => {
    const rx = makePrescription({ id: "rx-add-1" });
    const phase = makeMedicationPhase(rx.id, { id: "phase-add-1" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);

    const result = await addSchedule({
      phaseId: phase.id,
      time: "09:00",
      dosage: 25,
      daysOfWeek: [1, 3, 5],
      unit: "mg",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phaseId).toBe(phase.id);
      expect(result.data.time).toBe("09:00");
      expect(result.data.dosage).toBe(25);
      expect(result.data.daysOfWeek).toEqual([1, 3, 5]);
      expect(result.data.unit).toBe("mg");
      expect(result.data.enabled).toBe(true);
      expect(result.data.id).toBeDefined();
    }

    // Verify persisted
    const schedules = await getSchedulesForPhase(phase.id);
    expect(schedules).toHaveLength(1);
  });
});

describe("updateSchedule", () => {
  it("updates specified fields only", async () => {
    const rx = makePrescription({ id: "rx-upd-1" });
    const phase = makeMedicationPhase(rx.id, { id: "phase-upd-1" });
    const schedule = makePhaseSchedule(phase.id, {
      id: "sched-upd-1",
      time: "08:00",
      dosage: 50,
      enabled: true,
    });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);

    const result = await updateSchedule("sched-upd-1", { dosage: 100 });
    expect(result.success).toBe(true);

    const updated = await db.phaseSchedules.get("sched-upd-1");
    expect(updated!.dosage).toBe(100);
    expect(updated!.time).toBe("08:00"); // unchanged
    expect(updated!.enabled).toBe(true); // unchanged
  });
});

describe("deleteSchedule", () => {
  it("hard-deletes the schedule record", async () => {
    const rx = makePrescription({ id: "rx-del-sched" });
    const phase = makeMedicationPhase(rx.id, { id: "phase-del-sched" });
    const schedule = makePhaseSchedule(phase.id, { id: "sched-del-1" });
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);

    const result = await deleteSchedule("sched-del-1");
    expect(result.success).toBe(true);

    const deleted = await db.phaseSchedules.get("sched-del-1");
    expect(deleted).toBeUndefined();
  });
});
