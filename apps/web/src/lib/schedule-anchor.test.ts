/**
 * New and edited dose schedules anchor to the synced home timezone when it is
 * set, and to the device zone otherwise (audit gap-timezone-travel-recalc#1,
 * new-schedule half). The test device zone is UTC; home is Tokyo (UTC+9, no
 * DST), so the two encodings of a wall-clock time always differ.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  makeMedicationPhase,
  makePhaseSchedule,
  makePrescription,
} from "@/__tests__/fixtures/db-fixtures";
import { useSettingsStore } from "@/stores/settings-store";
import { getDeviceTimezone, localHHMMStringToUTCMinutes } from "@/lib/timezone";
import { getScheduleAnchorTimezone } from "@/lib/schedule-anchor";
import { addSchedule, updateSchedule } from "@/lib/medication-schedule-service";
import { startNewPhase, updatePhase } from "@/lib/phase-service";
import { addPrescription } from "@/lib/prescription-service";
import { createTitrationPlan, updateTitrationPlan } from "@/lib/titration-service";

const HOME = "Asia/Tokyo";

function setHome(zone: string | null) {
  useSettingsStore.setState({ homeTimezone: zone });
}

async function seedPhase() {
  const rx = makePrescription();
  const phase = makeMedicationPhase(rx.id, { status: "active" });
  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  return { rx, phase };
}

function expectAnchoredTo(
  schedule: { time: string; anchorTimezone: string; scheduleTimeUTC: number } | undefined,
  zone: string,
) {
  expect(schedule).toBeDefined();
  expect(schedule!.anchorTimezone).toBe(zone);
  expect(schedule!.scheduleTimeUTC).toBe(localHHMMStringToUTCMinutes(schedule!.time, zone));
}

beforeEach(() => setHome(null));
afterEach(() => setHome(null));

describe("getScheduleAnchorTimezone", () => {
  it("is the device zone while no home timezone is set", () => {
    expect(getScheduleAnchorTimezone()).toBe(getDeviceTimezone());
  });

  it("is the home timezone once one is set", () => {
    setHome(HOME);
    expect(getScheduleAnchorTimezone()).toBe(HOME);
  });

  it("ignores a home value that is not a real IANA zone", () => {
    setHome("Not/AZone");
    expect(getScheduleAnchorTimezone()).toBe(getDeviceTimezone());
  });
});

describe("new schedules anchor to the home timezone", () => {
  it("addSchedule", async () => {
    setHome(HOME);
    const { phase } = await seedPhase();
    const result = await addSchedule({
      phaseId: phase.id,
      time: "09:00",
      dosage: 25,
      daysOfWeek: [1],
      scheduleTimeUTC: 0,
      anchorTimezone: "UTC",
    });
    if (!result.success) throw new Error("addSchedule failed");
    expectAnchoredTo(await db.phaseSchedules.get(result.data.id), HOME);
  });

  it("addSchedule falls back to the device zone without a home", async () => {
    const { phase } = await seedPhase();
    const result = await addSchedule({
      phaseId: phase.id,
      time: "09:00",
      dosage: 25,
      daysOfWeek: [1],
      scheduleTimeUTC: 0,
      anchorTimezone: "UTC",
    });
    if (!result.success) throw new Error("addSchedule failed");
    expectAnchoredTo(await db.phaseSchedules.get(result.data.id), getDeviceTimezone());
  });

  it("addPrescription", async () => {
    setHome(HOME);
    const result = await addPrescription({
      genericName: "Anchorol",
      indication: "test",
      unit: "mg",
      foodInstruction: "none",
      brandName: "Anchorol",
      currentStock: 30,
      strength: 10,
      pillShape: "round",
      pillColor: "#ffffff",
      schedules: [{ time: "08:00", daysOfWeek: [1], dosage: 10 }],
    });
    if (!result.success) throw new Error("addPrescription failed");
    const schedules = await db.phaseSchedules.toArray();
    expect(schedules.length).toBeGreaterThan(0);
    for (const s of schedules) expectAnchoredTo(s, HOME);
  });

  it("startNewPhase", async () => {
    setHome(HOME);
    const { rx } = await seedPhase();
    const result = await startNewPhase({
      prescriptionId: rx.id,
      type: "maintenance",
      unit: "mg",
      startDate: Date.now() - 1000,
      foodInstruction: "none",
      schedules: [{ time: "08:00", daysOfWeek: [1], dosage: 50 }],
    });
    if (!result.success) throw new Error("startNewPhase failed");
    const schedules = await db.phaseSchedules.where("phaseId").equals(result.data.id).toArray();
    expect(schedules).toHaveLength(1);
    expectAnchoredTo(schedules[0], HOME);
  });

  it("updatePhase adding a schedule", async () => {
    setHome(HOME);
    const { phase } = await seedPhase();
    await updatePhase({
      id: phase.id,
      schedules: [{ time: "21:00", daysOfWeek: [1], dosage: 5 }],
    });
    const schedules = (await db.phaseSchedules.where("phaseId").equals(phase.id).toArray())
      .filter((s) => s.deletedAt === null);
    expect(schedules).toHaveLength(1);
    expectAnchoredTo(schedules[0], HOME);
  });

  it("createTitrationPlan", async () => {
    setHome(HOME);
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const result = await createTitrationPlan({
      title: "Plan",
      conditionLabel: "Test",
      entries: [
        {
          prescriptionId: rx.id,
          unit: "mg",
          schedules: [{ time: "08:00", daysOfWeek: [1], dosage: 25 }],
        },
      ],
    });
    if (!result.success) throw new Error("createTitrationPlan failed");
    const schedules = await db.phaseSchedules.toArray();
    expect(schedules).toHaveLength(1);
    expectAnchoredTo(schedules[0], HOME);
  });
});

describe("edited schedule times anchor to the home timezone", () => {
  async function seedBerlin() {
    const { phase } = await seedPhase();
    const schedule = makePhaseSchedule(phase.id, {
      time: "08:00",
      anchorTimezone: "Europe/Berlin",
      scheduleTimeUTC: localHHMMStringToUTCMinutes("08:00", "Europe/Berlin"),
    });
    await db.phaseSchedules.add(schedule);
    return { phase, schedule };
  }

  it("updateSchedule re-encodes a changed time in the home zone", async () => {
    setHome(HOME);
    const { schedule } = await seedBerlin();
    await updateSchedule(schedule.id, { time: "09:00" });
    expectAnchoredTo(await db.phaseSchedules.get(schedule.id), HOME);
  });

  it("updateSchedule keeps the schedule's own anchor without a home", async () => {
    const { schedule } = await seedBerlin();
    await updateSchedule(schedule.id, { time: "09:00" });
    expectAnchoredTo(await db.phaseSchedules.get(schedule.id), "Europe/Berlin");
  });

  it("updateSchedule leaves the anchor alone when only the dosage changes", async () => {
    setHome(HOME);
    const { schedule } = await seedBerlin();
    await updateSchedule(schedule.id, { dosage: 75 });
    expectAnchoredTo(await db.phaseSchedules.get(schedule.id), "Europe/Berlin");
  });

  it("updatePhase re-encodes a changed time in the home zone", async () => {
    setHome(HOME);
    const { phase, schedule } = await seedBerlin();
    await updatePhase({
      id: phase.id,
      schedules: [{ id: schedule.id, time: "10:00", daysOfWeek: [1], dosage: 50 }],
    });
    expectAnchoredTo(await db.phaseSchedules.get(schedule.id), HOME);
  });

  it("updateTitrationPlan re-encodes a changed time in the home zone", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const created = await createTitrationPlan({
      title: "Plan",
      conditionLabel: "Test",
      entries: [
        {
          prescriptionId: rx.id,
          unit: "mg",
          schedules: [{ time: "08:00", daysOfWeek: [1], dosage: 25 }],
        },
      ],
    });
    if (!created.success) throw new Error("createTitrationPlan failed");
    const [before] = await db.phaseSchedules.toArray();
    expectAnchoredTo(before, getDeviceTimezone());

    setHome(HOME);
    const result = await updateTitrationPlan({
      planId: created.data.id,
      entries: [
        {
          prescriptionId: rx.id,
          unit: "mg",
          schedules: [{ time: "09:30", daysOfWeek: [1], dosage: 25 }],
        },
      ],
    });
    if (!result.success) throw new Error("updateTitrationPlan failed");
    const live = (await db.phaseSchedules.toArray()).filter((s) => s.deletedAt === null);
    expect(live).toHaveLength(1);
    expect(live[0]!.time).toBe("09:30");
    expectAnchoredTo(live[0], HOME);
  });
});
