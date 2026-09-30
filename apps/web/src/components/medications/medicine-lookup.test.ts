import { describe, it, expect } from "vitest";
import {
  applyToDetails,
  applyToNewBrand,
  applyToNewPrescription,
  brandLabel,
  defaultOption,
  groupValue,
  groupWhy,
  normalizeLookupResult,
} from "@/components/medications/medicine-lookup";
import type { MedicineSearchResult } from "@/hooks/use-medicine-search";

const ENTRESTO: Partial<MedicineSearchResult> = {
  brandNames: ["Entresto", "Vymada"],
  genericName: "sacubitril/valsartan",
  activeIngredients: ["Sacubitril", "Valsartan"],
  dosageStrengths: ["50 mg", "100 mg", "200 mg"],
  strengthOptions: [
    { label: "50 mg", compounds: [{ name: "Sacubitril", strength: 24 }, { name: "Valsartan", strength: 26 }] },
    { label: "100 mg", compounds: [{ name: "Sacubitril", strength: 49 }, { name: "Valsartan", strength: 51 }] },
  ],
  commonIndications: ["Heart failure (reduced ejection fraction)", "Other"],
  foodInstruction: "none",
  pillColor: "Yellow",
  pillShape: "oval",
  visualIdentification: "NVR / L1",
  contraindications: ["Angioedema"],
  warnings: ["Low blood pressure"],
};

const BISOPROLOL: Partial<MedicineSearchResult> = {
  brandNames: ["Concor"],
  genericName: "Bisoprolol",
  activeIngredients: ["Bisoprolol"],
  dosageStrengths: ["2.5 mg", "5 mg", "10 mg"],
  commonIndications: ["High blood pressure"],
  foodInstruction: "before",
  foodNote: "With water",
  pillColor: "white",
  pillShape: "round",
};

describe("normalizeLookupResult", () => {
  it("defaults every missing list so a partial reply renders", () => {
    const r = normalizeLookupResult({ genericName: "Aviolix" }, "Aviolix");
    expect(r.brandNames).toEqual([]);
    expect(r.strengthOptions).toEqual([]);
    expect(r.options).toEqual([]);
    expect(r.none).toBe(false);
    expect(r.foodInstruction).toBe("none");
  });

  it("flags an empty reply as no match", () => {
    expect(normalizeLookupResult({}, "zzz").none).toBe(true);
  });

  it("builds single-drug options from plain strengths, keeping the unit", () => {
    const r = normalizeLookupResult({ ...BISOPROLOL, dosageStrengths: ["100 mcg"] }, "Bisoprolol");
    expect(r.options).toEqual([
      { label: "100 mcg", compounds: [{ name: "Bisoprolol", strength: 100 }], unit: "mcg" },
    ]);
  });

  it("gives a combination without a breakdown no options", () => {
    const r = normalizeLookupResult({ ...ENTRESTO, strengthOptions: [] }, "Entresto");
    expect(r.options).toEqual([]);
  });

  it("resolves the brand the query names, else keeps the typed brand on a generic fallback", () => {
    expect(normalizeLookupResult(ENTRESTO, "vymada 100").brand).toBe("Vymada");
    expect(normalizeLookupResult(ENTRESTO, "sacubitril").brand).toBe("Entresto");
    expect(
      normalizeLookupResult({ ...ENTRESTO, isGenericFallback: true }, "azura 100 mg").brand,
    ).toBe("Azura");
  });
});

describe("defaultOption and group values", () => {
  it("picks the strength the query names, the only one, or none", () => {
    const e = normalizeLookupResult(ENTRESTO, "Entresto 100");
    expect(defaultOption(e, "Entresto 100")).toBe(1);
    expect(defaultOption(e, "Entresto")).toBeNull();
    const one = normalizeLookupResult({ ...BISOPROLOL, dosageStrengths: ["5 mg"] }, "Concor");
    expect(defaultOption(one, "Concor")).toBe(0);
  });

  it("explains strength groups that wait on a pick", () => {
    const e = normalizeLookupResult(ENTRESTO, "Entresto");
    expect(groupValue("strength", e, null)).toBe("");
    expect(groupWhy("strength", e)).toBe("Pick a strength first");
    const b = normalizeLookupResult(BISOPROLOL, "Concor");
    expect(groupWhy("compounds", b)).toBe("Single drug: no compounds to fill in");
    expect(groupWhy("indication", normalizeLookupResult({ genericName: "X" }, "X"))).toBe("Not in the result");
  });

  it("labels the brand with the picked strength's number", () => {
    const e = normalizeLookupResult(ENTRESTO, "Entresto");
    expect(brandLabel(e, e.options[1]!)).toBe("Entresto 100");
    expect(brandLabel(e, null)).toBe("Entresto");
    expect(groupValue("strength", e, e.options[0]!)).toBe(
      "50 mg = Sacubitril 24 mg + Valsartan 26 mg",
    );
  });
});

describe("apply mapping per host", () => {
  it("new prescription: a combination fills names, compounds, appearance, indication and food", () => {
    const r = normalizeLookupResult(ENTRESTO, "Entresto 100");
    const p = applyToNewPrescription(
      ["names", "strength", "appearance", "indication", "food"],
      r,
      r.options[1]!,
    );
    expect(p).toMatchObject({
      genericName: "Sacubitril/valsartan",
      brandName: "Entresto 100",
      isCombination: true,
      compounds: [
        { name: "Sacubitril", strength: 49 },
        { name: "Valsartan", strength: 51 },
      ],
      dosageAmount: 1,
      customDosage: "",
      pillColor: "#FFC107",
      pillShape: "oval",
      visualIdentification: "NVR / L1",
      indication: "Heart failure",
      contraindications: ["Angioedema"],
      warnings: ["Low blood pressure"],
      foodInstruction: "none",
      foodNote: "",
    });
    // The query has no field in the form: it must not become a hidden brand
    // name that passes validation after the user clears Brand name.
    expect(p).not.toHaveProperty("searchQuery");
    expect(
      applyToNewBrand(["brand"], r, r.options[1]!, { isCombination: false, compounds: [] }),
    ).not.toHaveProperty("searchQuery");
  });

  it("new prescription: safety notes are stored whatever groups are ticked", () => {
    const r = normalizeLookupResult(ENTRESTO, "Entresto 100");
    // "What it is for" unticked: the user types their own indication.
    const p = applyToNewPrescription(["names", "strength"], r, r.options[1]!);
    expect(p).not.toHaveProperty("indication");
    expect(p.contraindications).toEqual(["Angioedema"]);
    expect(p.warnings).toEqual(["Low blood pressure"]);
    // A result with no indication at all still carries its safety notes.
    const bare = normalizeLookupResult({ ...ENTRESTO, commonIndications: [] }, "Entresto");
    expect(applyToNewPrescription(["appearance"], bare, null).contraindications).toEqual(["Angioedema"]);
  });

  it("new prescription: a single drug's names clear combination state left by an earlier lookup", () => {
    // Several strengths and none named in the query: no strength is picked.
    const r = normalizeLookupResult(BISOPROLOL, "Bisoprolol");
    const p = applyToNewPrescription(["names"], r, null);
    expect(p.genericName).toBe("Bisoprolol");
    expect(p.isCombination).toBe(false);
    expect(p.compounds).toEqual([
      { name: "", strength: 0 },
      { name: "", strength: 0 },
    ]);
  });

  it("new prescription: a single drug sets the strength text and clears combo mode", () => {
    const r = normalizeLookupResult(BISOPROLOL, "Concor 5");
    const p = applyToNewPrescription(["strength", "food"], r, r.options[1]!);
    expect(p.isCombination).toBe(false);
    expect(p.dosageStrength).toBe("5 mg");
    expect(p.foodInstruction).toBe("before");
    expect(p.foodNote).toBe("With water");
    // Unticked groups are left alone.
    expect(p).not.toHaveProperty("genericName");
    expect(p).not.toHaveProperty("pillShape");
  });

  it("new prescription: names alone on a combination name its compounds", () => {
    const r = normalizeLookupResult({ ...ENTRESTO, strengthOptions: [] }, "Entresto");
    const p = applyToNewPrescription(["names"], r, null);
    expect(p.isCombination).toBe(true);
    expect(p.compounds).toEqual([
      { name: "Sacubitril", strength: 0 },
      { name: "Valsartan", strength: 0 },
    ]);
  });

  it("new brand: keeps the prescription's compound names and takes the per-pill strengths", () => {
    const r = normalizeLookupResult(ENTRESTO, "Vymada 100");
    const p = applyToNewBrand(["brand", "strength", "appearance"], r, r.options[1]!, {
      isCombination: true,
      compounds: [
        { name: "valsartan", strength: 0 },
        { name: "sacubitril", strength: 0 },
      ],
    });
    expect(p.brandName).toBe("Vymada 100");
    expect(p.compounds).toEqual([
      { name: "valsartan", strength: 51 },
      { name: "sacubitril", strength: 49 },
    ]);
    expect(p.pillShape).toBe("oval");
    expect(p).not.toHaveProperty("genericName");
    expect(p).not.toHaveProperty("indication");
  });

  it("new brand: a single-drug prescription takes the strength text", () => {
    const r = normalizeLookupResult(BISOPROLOL, "Concor 10");
    const p = applyToNewBrand(["strength"], r, r.options[2]!, {
      isCombination: false,
      compounds: [],
    });
    expect(p.dosageStrength).toBe("10 mg");
    expect(p).not.toHaveProperty("brandName");
  });

  it("prescription details: generic name and indication only", () => {
    const r = normalizeLookupResult(ENTRESTO, "Entresto");
    expect(applyToDetails(["generic", "indication"], r)).toEqual({
      name: "Sacubitril/valsartan",
      indication: "Heart failure",
    });
    expect(applyToDetails(["indication"], r)).toEqual({ indication: "Heart failure" });
  });
});
