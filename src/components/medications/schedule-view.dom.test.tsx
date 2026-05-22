// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

import { ScheduleView } from "@/components/medications/schedule-view";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";
import { formatLocalTime, getDeviceTimezone } from "@/lib/timezone";

/**
 * ScheduleView builds today's dose schedule from the seeded IndexedDB via
 * `useDailyDoseSchedule`. The fixture schedule covers every day-of-week, so a
 * slot is produced for whatever "today" is when the test runs.
 *
 * A slot's display time (and the `time-slot-<time>` anchor id) is derived from
 * `scheduleTimeUTC` converted into the device timezone — not from the schedule
 * `time` field — so tests resolve the expected id via `formatLocalTime`.
 */
describe("ScheduleView", () => {
  it("renders the empty-schedule state when no medications are seeded", async () => {
    const onAddMed = vi.fn();
    await renderWithFixtures(
      <ScheduleView
        selectedDate={new Date()}
        onDoseClick={() => {}}
        onAddMed={onAddMed}
      />,
    );

    // EmptySchedule exposes an add-medication affordance.
    expect(
      await screen.findByRole("button", { name: /add/i }),
    ).toBeInTheDocument();
  });

  it("renders a time-slot group for a seeded dose at its scheduled time", async () => {
    const tz = getDeviceTimezone();
    const utcMinutes = 855; // 14:15 UTC
    const localTime = formatLocalTime(utcMinutes, tz);

    const prescription = makePrescription({ genericName: "Spironolactone" });
    const phase = makeMedicationPhase(prescription.id);
    const schedule = makePhaseSchedule(phase.id, {
      dosage: 25,
      scheduleTimeUTC: utcMinutes,
    });
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      currentStock: 30,
    });

    await renderWithFixtures(
      <ScheduleView
        selectedDate={new Date()}
        onDoseClick={() => {}}
        onAddMed={() => {}}
      />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [inventory],
        },
      },
    );

    // The seeded prescription's dose surfaces in its time-slot group.
    expect(
      await screen.findByText("Spironolactone"),
    ).toBeInTheDocument();
    // The slot renders an anchor element keyed by its derived local time.
    expect(document.getElementById(`time-slot-${localTime}`)).not.toBeNull();
  });

  it("groups two same-time doses into a single time slot", async () => {
    const tz = getDeviceTimezone();
    const utcMinutes = 1200; // 20:00 UTC
    const localTime = formatLocalTime(utcMinutes, tz);

    const rxA = makePrescription({ genericName: "DrugAlpha" });
    const rxB = makePrescription({ genericName: "DrugBeta" });
    const phaseA = makeMedicationPhase(rxA.id);
    const phaseB = makeMedicationPhase(rxB.id);
    const schedA = makePhaseSchedule(phaseA.id, {
      dosage: 10,
      scheduleTimeUTC: utcMinutes,
    });
    const schedB = makePhaseSchedule(phaseB.id, {
      dosage: 20,
      scheduleTimeUTC: utcMinutes,
    });

    await renderWithFixtures(
      <ScheduleView
        selectedDate={new Date()}
        onDoseClick={() => {}}
        onAddMed={() => {}}
      />,
      {
        seed: {
          prescriptions: [rxA, rxB],
          medicationPhases: [phaseA, phaseB],
          phaseSchedules: [schedA, schedB],
        },
      },
    );

    expect(await screen.findByText("DrugAlpha")).toBeInTheDocument();
    expect(screen.getByText("DrugBeta")).toBeInTheDocument();
    // Both doses share a single time-slot group keyed by their local time.
    const groups = document.querySelectorAll(
      `[id="time-slot-${localTime}"]`,
    );
    expect(groups).toHaveLength(1);
  });
});
