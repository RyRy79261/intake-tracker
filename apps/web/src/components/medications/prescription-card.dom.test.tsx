// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PrescriptionCard } from "@/components/medications/prescription-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * Exercises the real PrescriptionCard against a seeded IndexedDB. The card runs
 * its own data hooks (`usePhasesForPrescription`, `useInventoryForPrescription`,
 * `useDailyDoseSchedule`), so a coherent prescription -> phase -> schedule chain
 * is seeded for "today" (the schedule builder covers every day-of-week).
 */
describe("PrescriptionCard", () => {
  function buildRegimen() {
    const prescription = makePrescription({
      genericName: "Lisinopril",
      indication: "Blood pressure",
    });
    const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
    const schedule = makePhaseSchedule(phase.id, { dosage: 10, time: "09:00" });
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      brandName: "Zestril",
      strength: 10,
      currentStock: 40,
    });
    return { prescription, phase, schedule, inventory };
  }

  it("renders the prescription name and indication", async () => {
    const { prescription, phase, schedule, inventory } = buildRegimen();
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("Lisinopril")).toBeInTheDocument();
    expect(screen.getByText("Blood pressure")).toBeInTheDocument();
  });

  it("shows the active medicine brand mini-card", async () => {
    const { prescription, phase, schedule, inventory } = buildRegimen();
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("Zestril")).toBeInTheDocument();
  });

  it("flags a negative-stock prescription with a Negative badge", async () => {
    const prescription = makePrescription({ genericName: "Furosemide" });
    const phase = makeMedicationPhase(prescription.id);
    const schedule = makePhaseSchedule(phase.id);
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      currentStock: -3,
      refillAlertPills: 14,
    });

    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("Negative")).toBeInTheDocument();
  });

  it("expands to reveal the CompoundCardExpanded detail when clicked", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, inventory } = buildRegimen();
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    await screen.findByText("Lisinopril");
    // Collapsed: the expanded "Medicines" section header is not present.
    expect(screen.queryByText("Medicines")).not.toBeInTheDocument();

    await user.click(screen.getByText("Lisinopril"));

    expect(await screen.findByText("Medicines")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /prescription details/i }),
    ).toBeInTheDocument();
  });
});
