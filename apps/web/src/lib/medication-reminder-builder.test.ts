import { describe, it, expect } from "vitest";
import { createPreviewDatabase, db, resetActiveDatabase, setActiveDatabase } from "@/lib/db";
import {
  makeDoseLog,
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeTitrationPlan,
} from "@/__tests__/fixtures/db-fixtures";
import {
  loadReminderDoses,
  loadHandledSlots,
  buildReminderOccurrences,
  buildWeeklyPushEntries,
  zonedTimeToEpoch,
  type ReminderDose,
} from "@/lib/medication-reminder-builder";

function dose(overrides: Partial<ReminderDose> = {}): ReminderDose {
  return {
    prescriptionId: "rx",
    phaseId: "ph",
    scheduleId: "s",
    genericName: "Metoprolol",
    displayName: "Metoprolol",
    dosageText: "50mg",
    time: "08:00",
    anchorTimezone: "Europe/Berlin",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    ...overrides,
  };
}

// Tuesday 2026-09-29 10:00 Berlin.
const TUESDAY = Date.UTC(2026, 8, 29, 8, 0);

describe("zonedTimeToEpoch", () => {
  it("resolves wall-clock time per date across DST", () => {
    expect(new Date(zonedTimeToEpoch("2026-10-24", "08:00", "Europe/Berlin")).toISOString()).toBe(
      "2026-10-24T06:00:00.000Z",
    );
    expect(new Date(zonedTimeToEpoch("2026-10-26", "08:00", "Europe/Berlin")).toISOString()).toBe(
      "2026-10-26T07:00:00.000Z",
    );
  });

  it("shifts a time skipped by spring-forward and picks the first of a repeated one", () => {
    expect(new Date(zonedTimeToEpoch("2026-03-29", "02:30", "Europe/Berlin")).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(new Date(zonedTimeToEpoch("2026-10-25", "02:30", "Europe/Berlin")).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });
});

describe("buildReminderOccurrences", () => {
  it("reports the device-local time and weekday of each occurrence", () => {
    const [first] = buildReminderOccurrences([dose({ daysOfWeek: [3] })], {
      from: TUESDAY,
      days: 7,
      deviceTz: "America/New_York",
    });
    expect(first!.dateKey).toBe("2026-09-30");
    expect(first!.localTime).toBe("02:00");
    expect(first!.localWeekday).toBe(3);
  });
});

describe("buildWeeklyPushEntries", () => {
  it("puts each medication only on its own weekdays, whatever day the sync runs", () => {
    const entries = buildWeeklyPushEntries(
      [
        dose({ scheduleId: "a", displayName: "A", dosageText: "10mg" }),
        dose({ scheduleId: "c", displayName: "C", dosageText: "5mg", daysOfWeek: [1] }),
        dose({ scheduleId: "b", displayName: "B", dosageText: "1mg", time: "20:00", daysOfWeek: [1, 3, 5] }),
      ],
      "Europe/Berlin",
      TUESDAY,
    );

    const at = (day: number, slot: string) =>
      entries.find((e) => e.dayOfWeek === day && e.timeSlot === slot);
    expect(JSON.parse(at(1, "08:00")!.medicationsJson)).toEqual({
      body: "A 10mg, C 5mg",
      scheduleIds: ["a", "c"],
    });
    expect(JSON.parse(at(2, "08:00")!.medicationsJson).body).toBe("A 10mg");
    expect(at(3, "20:00")).toBeDefined();
    expect(at(2, "20:00")).toBeUndefined();
    expect(entries.filter((e) => e.timeSlot === "08:00")).toHaveLength(7);
    expect(entries.filter((e) => e.timeSlot === "20:00").map((e) => e.dayOfWeek)).toEqual([1, 3, 5]);
  });

  it("returns an empty schedule when nothing is due", () => {
    expect(buildWeeklyPushEntries([], "Europe/Berlin", TUESDAY)).toEqual([]);
  });

  it("converts slots into the device's zone", () => {
    const entries = buildWeeklyPushEntries([dose({ daysOfWeek: [1] })], "Africa/Johannesburg", TUESDAY);
    expect(entries).toEqual([expect.objectContaining({ dayOfWeek: 1, timeSlot: "08:00" })]);
    const ny = buildWeeklyPushEntries([dose({ daysOfWeek: [1] })], "America/New_York", TUESDAY);
    expect(ny).toEqual([expect.objectContaining({ dayOfWeek: 1, timeSlot: "02:00" })]);
  });
});

describe("loadReminderDoses", () => {
  it("uses the effective phase and ignores tombstoned or inactive rows", async () => {
    const rx = makePrescription({ genericName: "Metoprolol" });
    const plan = makeTitrationPlan({ status: "active" });
    const maintenance = makeMedicationPhase(rx.id, { type: "maintenance" });
    const titration = makeMedicationPhase(rx.id, { type: "titration", titrationPlanId: plan.id });
    const titrationSchedule = makePhaseSchedule(titration.id, { dosage: 25 });
    const deletedSchedule = makePhaseSchedule(titration.id, { time: "20:00", deletedAt: 1 });

    const deletedRx = makePrescription({ genericName: "Furosemide", deletedAt: 1 });
    const deletedRxPhase = makeMedicationPhase(deletedRx.id);

    await db.prescriptions.bulkAdd([rx, deletedRx]);
    await db.titrationPlans.add(plan);
    await db.medicationPhases.bulkAdd([maintenance, titration, deletedRxPhase]);
    await db.phaseSchedules.bulkAdd([
      makePhaseSchedule(maintenance.id, { dosage: 50 }),
      titrationSchedule,
      deletedSchedule,
      makePhaseSchedule(deletedRxPhase.id),
    ]);
    await db.inventoryItems.bulkAdd([
      makeInventoryItem(rx.id, { brandName: "Old", deletedAt: 1 }),
      makeInventoryItem(rx.id, { brandName: "Lopressor" }),
    ]);

    const doses = await loadReminderDoses();

    expect(doses).toEqual([
      expect.objectContaining({
        scheduleId: titrationSchedule.id,
        displayName: "Lopressor",
        dosageText: "25mg",
        time: "08:00",
      }),
    ]);
  });
});

describe("loadReminderDoses combination labels (gap-combo-drugs-pill-math#3)", () => {
  it("labels a combo dose from the active brand's per-pill compounds", async () => {
    // The Rx ratio (24/26) differs from the stocked brand (97/103): the label
    // must show what the tablets contain, not a split of the Rx reference.
    const rx = makePrescription({
      genericName: "Sacubitril/Valsartan",
      compounds: [{ name: "Sacubitril", strength: 24 }, { name: "Valsartan", strength: 26 }],
    });
    const phase = makeMedicationPhase(rx.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(makePhaseSchedule(phase.id, { dosage: 200 }));
    await db.inventoryItems.add(makeInventoryItem(rx.id, {
      brandName: "Entresto",
      strength: 200,
      compounds: [{ name: "Sacubitril", strength: 97 }, { name: "Valsartan", strength: 103 }],
    }));

    const [reminder] = await loadReminderDoses();

    expect(reminder?.dosageText).toBe("97/103mg");
  });

  it("shows the summed dose for a combo with no stocked brand", async () => {
    const rx = makePrescription({
      genericName: "Sacubitril/Valsartan",
      compounds: [{ name: "Sacubitril", strength: 24 }, { name: "Valsartan", strength: 26 }],
    });
    const phase = makeMedicationPhase(rx.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(makePhaseSchedule(phase.id, { dosage: 100 }));

    const [reminder] = await loadReminderDoses();

    expect(reminder?.dosageText).toBe("100mg");
  });
});

describe("reminder reads while a manual preview's sample database is swapped in", () => {
  it("wait for the real database and never return the sample regimen", async () => {
    const rx = makePrescription({ genericName: "Metoprolol" });
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(schedule);
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, { scheduledDate: "2026-09-29", status: "taken" }),
    );

    const preview = createPreviewDatabase();
    await preview.open();
    const sampleRx = makePrescription({ genericName: "Furosemide" });
    const samplePhase = makeMedicationPhase(sampleRx.id);
    await preview.prescriptions.add(sampleRx);
    await preview.medicationPhases.add(samplePhase);
    await preview.phaseSchedules.add(makePhaseSchedule(samplePhase.id));

    setActiveDatabase(preview);
    try {
      let doses: ReminderDose[] | undefined;
      const pendingDoses = loadReminderDoses().then((d) => (doses = d));
      let handled: Set<string> | undefined;
      const pendingHandled = loadHandledSlots([
        {
          dose: dose({ scheduleId: schedule.id }),
          dateKey: "2026-09-29",
          at: TUESDAY,
          localTime: "08:00",
          localWeekday: 2,
        },
      ]).then((h) => (handled = h));

      // Held back for as long as the preview is on screen.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(doses).toBeUndefined();
      expect(handled).toBeUndefined();

      resetActiveDatabase();
      await pendingDoses;
      await pendingHandled;
      expect(doses!.map((d) => d.genericName)).toEqual(["Metoprolol"]);
      expect([...handled!]).toEqual([`${schedule.id}|2026-09-29`]);
    } finally {
      resetActiveDatabase();
      await preview.delete();
    }
  });
});
