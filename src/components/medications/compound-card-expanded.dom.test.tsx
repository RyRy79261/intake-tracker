// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CompoundCardExpanded } from "@/components/medications/compound-card-expanded";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * CompoundCardExpanded reads inventory, phases, schedules and today's dose
 * slots straight from the seeded IndexedDB. Tests verify each rendered
 * section reflects the seeded data, including the per-compound dose breakdown
 * for a combination tablet.
 */
describe("CompoundCardExpanded", () => {
  it("lists the seeded medicine with its stock and Active badge", async () => {
    const prescription = makePrescription({ genericName: "Amlodipine" });
    const phase = makeMedicationPhase(prescription.id);
    const schedule = makePhaseSchedule(phase.id, { dosage: 5 });
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      brandName: "Norvasc",
      strength: 5,
      currentStock: 27,
    });

    await renderWithFixtures(
      <CompoundCardExpanded prescription={prescription} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [inventory],
        },
      },
    );

    expect(await screen.findByText("Norvasc")).toBeInTheDocument();
    expect(screen.getByText("27 pills")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders a schedule summary from the seeded phase schedule", async () => {
    const prescription = makePrescription({ genericName: "Bisoprolol" });
    const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
    const schedule = makePhaseSchedule(phase.id, {
      dosage: 2.5,
      time: "07:30",
    });
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      currentStock: 30,
    });

    await renderWithFixtures(
      <CompoundCardExpanded prescription={prescription} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [inventory],
        },
      },
    );

    // "2.5mg daily" — a single schedule renders as "daily".
    expect(await screen.findByText("2.5mg daily")).toBeInTheDocument();
    expect(screen.getByText("at 07:30")).toBeInTheDocument();
  });

  it("splits a combination tablet's dose per compound in the schedule", async () => {
    const compounds = [
      { name: "Sacubitril", strength: 49 },
      { name: "Valsartan", strength: 51 },
    ];
    const prescription = makePrescription({
      genericName: "Sacubitril/Valsartan",
      compounds,
    });
    const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
    const schedule = makePhaseSchedule(phase.id, { dosage: 100, time: "08:00" });
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      brandName: "Entresto",
      strength: 100,
      compounds,
      currentStock: 20,
    });

    await renderWithFixtures(
      <CompoundCardExpanded prescription={prescription} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [inventory],
        },
      },
    );

    // splitDose(100, 49/51) -> 49/51mg, rendered "<compound> daily".
    expect(await screen.findByText("49/51mg daily")).toBeInTheDocument();
  });

  it("opens the inventory detail drawer when a medicine row is tapped", async () => {
    const user = userEvent.setup();
    const prescription = makePrescription({ genericName: "Atorvastatin" });
    const phase = makeMedicationPhase(prescription.id);
    const schedule = makePhaseSchedule(phase.id);
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      brandName: "Lipitor",
      currentStock: 12,
    });

    await renderWithFixtures(
      <CompoundCardExpanded prescription={prescription} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [inventory],
        },
      },
    );

    const row = await screen.findByRole("button", { name: /Lipitor/ });
    await user.click(row);

    // The drawer surfaces the brand name in its own heading region.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
