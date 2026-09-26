// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { PrescriptionCard } from "@/components/medications/prescription-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * The card's stock badges come from the shared computeRefillStatus, so a
 * days-based threshold shows as Low just like a pill threshold, and a
 * scheduled prescription with no active brand is flagged.
 */
describe("PrescriptionCard refill badges", () => {
  function regimen(inventoryOverrides = {}) {
    const prescription = makePrescription({ genericName: "Lisinopril" });
    const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
    // 10mg/day of 10mg pills → 1 pill/day.
    const schedule = makePhaseSchedule(phase.id, { dosage: 10, time: "09:00" });
    const inventory = makeInventoryItem(prescription.id, {
      brandName: "Zestril",
      strength: 10,
      unit: "mg",
      currentStock: 5,
      // Well under the stock, so only a days threshold can make it Low.
      refillAlertPills: 1,
      refillAlertDays: 0,
      ...inventoryOverrides,
    });
    return { prescription, phase, schedule, inventory };
  }

  it("shows Low when the days-of-supply threshold is crossed", async () => {
    const { prescription, phase, schedule, inventory } = regimen({ refillAlertDays: 7 });
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("Low")).toBeInTheDocument();
  });

  it("flags a scheduled prescription whose brands are all inactive", async () => {
    const { prescription, phase, schedule, inventory } = regimen({ isActive: false });
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("No active brand")).toBeInTheDocument();
  });
});
