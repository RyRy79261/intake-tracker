// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { DosageStep } from "@/components/medications/add-medication-steps/dosage-step";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";

function state(overrides: Partial<AddMedicationFormState> = {}): AddMedicationFormState {
  return {
    selectedPrescriptionId: "new",
    searchQuery: "",
    searchResult: null,
    brandName: "Lopressor",
    genericName: "Metoprolol",
    dosageStrength: "50mg",
    isCombination: false,
    compounds: [],
    pillShape: "round",
    pillColor: "#E91E63",
    visualIdentification: "",
    indication: "",
    contraindications: [],
    warnings: [],
    foodInstruction: "none",
    foodNote: "",
    notes: "",
    dosageAmount: 1,
    customDosage: "",
    asNeeded: false,
    schedules: [],
    currentStock: "",
    refillAlertDays: "",
    refillAlertPills: "",
    ...overrides,
  };
}

/**
 * gap-combo-drugs-pill-math#6: the wizard flags a dose that can't be taken
 * with whole, half, third or quarter tablets before it is saved, like the edit
 * and titration dose editors already do.
 */
describe("DosageStep uneven split warning", () => {
  it("warns when the dose is not a whole or half tablet", () => {
    // 15mg from a 50mg tablet is 0.3 of a tablet.
    render(<DosageStep formState={state({ customDosage: "0.3" })} onFieldChange={() => {}} />);
    expect(screen.getByText(/not a whole or half tablet/i)).toBeInTheDocument();
  });

  it("does not warn for a half tablet", () => {
    render(<DosageStep formState={state({ customDosage: "0.5" })} onFieldChange={() => {}} />);
    expect(screen.queryByText(/not a whole or half tablet/i)).not.toBeInTheDocument();
  });

  it("does not warn for the preset whole-tablet doses", () => {
    render(<DosageStep formState={state({ dosageAmount: 2 })} onFieldChange={() => {}} />);
    expect(screen.queryByText(/not a whole or half tablet/i)).not.toBeInTheDocument();
  });
});
