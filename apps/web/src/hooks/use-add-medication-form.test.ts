import { describe, it, expect } from "vitest";
import {
  findDuplicatePrescription,
  normalizeGenericName,
  parseStockInput,
  resolveWizardDose,
  type AddMedicationFormState,
} from "@/hooks/use-add-medication-form";
import { makePrescription } from "@/__tests__/fixtures/db-fixtures";

function form(overrides: Partial<AddMedicationFormState>): AddMedicationFormState {
  return {
    dosageStrength: "",
    dosageAmount: 1,
    customDosage: "",
    isCombination: false,
    compounds: [],
    ...overrides,
  } as AddMedicationFormState;
}

describe("resolveWizardDose", () => {
  it("reads the strength through the shared parser", () => {
    expect(resolveWizardDose(form({ dosageStrength: "1,000 mg" }))).toEqual({
      strength: 1000, unit: "mg", pills: 1, total: 1000,
    });
    expect(resolveWizardDose(form({ dosageStrength: ".5mg", dosageAmount: 2 }))!.total).toBe(1);
  });

  it("returns null for an unreadable strength instead of defaulting to 1mg", () => {
    expect(resolveWizardDose(form({ dosageStrength: "" }))).toBeNull();
    expect(resolveWizardDose(form({ dosageStrength: "half" }))).toBeNull();
  });

  it("passes a negative custom dose through for validation to reject", () => {
    const dose = resolveWizardDose(form({ dosageStrength: "5mg", customDosage: "-2" }));
    expect(dose!.pills).toBe(-2);
  });

  it("uses the compound sum for a combination tablet", () => {
    const dose = resolveWizardDose(form({
      isCombination: true,
      compounds: [{ name: "Sacubitril", strength: 49 }, { name: "Valsartan", strength: 51 }],
      dosageAmount: 2,
    }));
    expect(dose).toEqual({ strength: 100, unit: "mg", pills: 2, total: 200 });
  });
});

describe("parseStockInput", () => {
  it("keeps fractions and tells blank apart from 0", () => {
    expect(parseStockInput("27.5")).toBe(27.5);
    expect(parseStockInput("0")).toBe(0);
    expect(parseStockInput("  ")).toBeNull();
  });
});

describe("duplicate guard", () => {
  it("normalises case, spacing and ingredient order", () => {
    expect(normalizeGenericName("Sacubitril/valsartan")).toBe(
      normalizeGenericName("Valsartan + Sacubitril"),
    );
    expect(normalizeGenericName("  Bisoprolol ")).toBe("bisoprolol");
  });

  it("matches only live, active prescriptions", () => {
    const live = makePrescription({ genericName: "Sacubitril/valsartan" });
    const inactive = makePrescription({ genericName: "Bisoprolol", isActive: false });
    const deleted = makePrescription({ genericName: "Apixaban", deletedAt: 1 });
    const all = [live, inactive, deleted];
    expect(findDuplicatePrescription("Sacubitril/Valsartan", all)).toBe(live);
    expect(findDuplicatePrescription("bisoprolol", all)).toBeUndefined();
    expect(findDuplicatePrescription("Apixaban", all)).toBeUndefined();
    expect(findDuplicatePrescription("", all)).toBeUndefined();
  });
});
