// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AppearanceStep } from "@/components/medications/add-medication-steps/appearance-step";
import { IndicationStep } from "@/components/medications/add-medication-steps/indication-step";
import { SearchStep } from "@/components/medications/add-medication-steps/search-step";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import type { MedicineSearchResult } from "@/hooks/use-medicine-search";

function state(overrides: Partial<AddMedicationFormState> = {}): AddMedicationFormState {
  return {
    selectedPrescriptionId: "new",
    searchQuery: "",
    searchResult: null,
    brandName: "Entresto",
    genericName: "Sacubitril/valsartan",
    dosageStrength: "5 mg",
    isCombination: false,
    compounds: [
      { name: "", strength: 0 },
      { name: "", strength: 0 },
    ],
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

const RESULT: MedicineSearchResult = {
  brandNames: ["Entresto"],
  localAlternatives: [],
  genericName: "Sacubitril/valsartan",
  dosageStrengths: ["50 mg", "100 mg"],
  activeIngredients: ["Sacubitril", "Valsartan"],
  strengthOptions: [
    { label: "50 mg", compounds: [{ name: "Sacubitril", strength: 24 }, { name: "Valsartan", strength: 26 }] },
    { label: "100 mg", compounds: [{ name: "Sacubitril", strength: 49 }, { name: "Valsartan", strength: 51 }] },
  ],
  commonIndications: [],
  foodInstruction: "none",
  pillColor: "",
  pillShape: "",
  pillDescription: "",
  drugClass: "",
  contraindications: [],
  warnings: [],
  isGenericFallback: false,
};

const searchStep = (formState: AddMedicationFormState) => (
  <SearchStep
    formState={formState}
    onFieldChange={() => {}}
    errors={{}}
    existingPrescriptions={[]}
    onSelectPrescription={() => {}}
  />
);

/**
 * Tailwind's `11` is 44px, the smallest target that is safe to tap on a
 * phone: a smaller one next to its neighbours saves the wrong food
 * instruction, strength or colour.
 */
describe("wizard tap targets are at least 44px", () => {
  it("food instruction segments", () => {
    render(<IndicationStep formState={state()} onFieldChange={() => {}} />);
    const radios = within(screen.getByRole("radiogroup", { name: "Food instruction" })).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const r of radios) expect(r).toHaveClass("min-h-11");
  });

  it("strength chips of a single drug", () => {
    render(searchStep(state({ searchResult: RESULT })));
    for (const label of ["50 mg", "100 mg"]) {
      expect(screen.getByRole("button", { name: label })).toHaveClass("min-h-11");
    }
  });

  it("strength chips of a combination", () => {
    render(searchStep(state({ searchResult: RESULT, isCombination: true })));
    for (const label of ["50 mg", "100 mg"]) {
      expect(screen.getByRole("button", { name: label })).toHaveClass("min-h-11");
    }
  });

  it("pill colour swatches", () => {
    render(<AppearanceStep formState={state()} onFieldChange={() => {}} />);
    const swatches = screen.getAllByRole("radio", { name: /^Colour #/ });
    expect(swatches.length).toBeGreaterThan(1);
    for (const s of swatches) expect(s).toHaveClass("h-11", "w-11");
  });
});
