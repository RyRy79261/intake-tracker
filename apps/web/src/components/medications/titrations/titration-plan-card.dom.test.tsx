// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";

import { TitrationPlanCard } from "@/components/medications/titrations/titration-plan-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeTitrationPlan,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * A titration entry labels a combination dose from the active brand's tablets,
 * like every other dose label (gap-combo-drugs-pill-math#3), not by splitting
 * the summed dose by the prescription's reference ratio.
 */
describe("TitrationPlanCard combination dose label", () => {
  it("shows the active brand's per-compound amounts", async () => {
    const plan = makeTitrationPlan({ title: "Entresto up-titration", status: "active" });
    const rx = makePrescription({
      genericName: "Sacubitril/Valsartan",
      compounds: [{ name: "Sacubitril", strength: 24 }, { name: "Valsartan", strength: 26 }],
    });
    const phase = makeMedicationPhase(rx.id, {
      type: "titration", titrationPlanId: plan.id, unit: "mg", status: "active",
    });
    const schedule = makePhaseSchedule(phase.id, { dosage: 200, time: "08:00" });
    const brand = makeInventoryItem(rx.id, {
      brandName: "Entresto",
      strength: 200,
      compounds: [{ name: "Sacubitril", strength: 97 }, { name: "Valsartan", strength: 103 }],
    });

    await renderWithFixtures(<TitrationPlanCard plan={plan} onEdit={() => {}} />, {
      seed: {
        titrationPlans: [plan],
        prescriptions: [rx],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [brand],
      },
    });

    fireEvent.click(await screen.findByText("Entresto up-titration"));

    expect(await screen.findByText("97/103mg")).toBeInTheDocument();
    expect(screen.queryByText("96/104mg")).not.toBeInTheDocument();
  });
});
