import { describe, it, expect } from "vitest";
import {
  compoundSum,
  isCombo,
  splitDose,
  scaleCompounds,
  formatCompoundShort,
  formatCompoundFull,
  formatCompoundNames,
  formatComboDose,
  isValidPillStrength,
  compoundsMismatch,
} from "@intake/core/compound";
import type { CompoundStrength } from "@/lib/db";

const entresto: CompoundStrength[] = [
  { name: "Sacubitril", strength: 49 },
  { name: "Valsartan", strength: 51 },
];

describe("compoundSum", () => {
  it("returns 0 for undefined", () => {
    expect(compoundSum(undefined)).toBe(0);
  });

  it("returns 0 for an empty array", () => {
    expect(compoundSum([])).toBe(0);
  });

  it("sums the compound strengths", () => {
    expect(compoundSum(entresto)).toBe(100);
  });
});

describe("isCombo", () => {
  it("returns false for null/undefined records", () => {
    expect(isCombo(null)).toBe(false);
    expect(isCombo(undefined)).toBe(false);
  });

  it("returns false for a single-compound record", () => {
    expect(isCombo({ compounds: [{ name: "X", strength: 10 }] })).toBe(false);
  });

  it("returns true for two or more compounds", () => {
    expect(isCombo({ compounds: entresto })).toBe(true);
  });
});

describe("splitDose", () => {
  it("returns empty array for missing reference", () => {
    expect(splitDose(100, undefined)).toEqual([]);
  });

  it("returns empty array when reference total is zero", () => {
    expect(splitDose(100, [{ name: "X", strength: 0 }])).toEqual([]);
  });

  it("splits a dose preserving the reference ratio", () => {
    expect(splitDose(200, entresto)).toEqual([
      { name: "Sacubitril", strength: 98 },
      { name: "Valsartan", strength: 102 },
    ]);
  });

  it("rounds per-compound strengths to 2 decimals", () => {
    const result = splitDose(150, entresto);
    expect(result).toEqual([
      { name: "Sacubitril", strength: 73.5 },
      { name: "Valsartan", strength: 76.5 },
    ]);
  });
});

describe("scaleCompounds", () => {
  it("returns empty array for undefined", () => {
    expect(scaleCompounds(undefined, 2)).toEqual([]);
  });

  it("scales each compound by the pill count", () => {
    expect(scaleCompounds(entresto, 2)).toEqual([
      { name: "Sacubitril", strength: 98 },
      { name: "Valsartan", strength: 102 },
    ]);
  });

  it("supports fractional pill counts", () => {
    expect(scaleCompounds(entresto, 0.5)).toEqual([
      { name: "Sacubitril", strength: 24.5 },
      { name: "Valsartan", strength: 25.5 },
    ]);
  });
});

describe("formatCompoundShort", () => {
  it("returns empty string for empty input", () => {
    expect(formatCompoundShort([])).toBe("");
    expect(formatCompoundShort(undefined)).toBe("");
  });

  it("joins strengths with a slash and default unit", () => {
    expect(formatCompoundShort(entresto)).toBe("49/51mg");
  });

  it("respects a custom unit", () => {
    expect(formatCompoundShort(entresto, "mcg")).toBe("49/51mcg");
  });
});

describe("formatCompoundFull", () => {
  it("returns empty string for empty input", () => {
    expect(formatCompoundFull(undefined)).toBe("");
  });

  it("formats named breakdown joined with plus", () => {
    expect(formatCompoundFull(entresto)).toBe(
      "Sacubitril 49mg + Valsartan 51mg",
    );
  });

  it("falls back to Compound for unnamed entries", () => {
    expect(formatCompoundFull([{ name: "", strength: 5 }])).toBe("Compound 5mg");
  });
});

describe("formatCompoundNames", () => {
  it("returns empty string for empty input", () => {
    expect(formatCompoundNames([])).toBe("");
  });

  it("joins ingredient names with slashes", () => {
    expect(formatCompoundNames(entresto)).toBe("Sacubitril / Valsartan");
  });

  it("falls back to Compound for unnamed entries", () => {
    expect(formatCompoundNames([{ name: "", strength: 1 }])).toBe("Compound");
  });
});

describe("isValidPillStrength", () => {
  it("accepts a positive finite number", () => {
    expect(isValidPillStrength(50)).toBe(true);
  });

  it("rejects zero, negative, non-finite and missing strengths", () => {
    for (const v of [0, -5, NaN, Infinity, null, undefined, "50"]) {
      expect(isValidPillStrength(v)).toBe(false);
    }
  });
});

describe("formatComboDose", () => {
  it("scales the stocked brand's per-pill compounds by the pill count", () => {
    const entresto97 = {
      strength: 200,
      compounds: [
        { name: "Sacubitril", strength: 97 },
        { name: "Valsartan", strength: 103 },
      ],
    };
    expect(formatComboDose(200, "mg", entresto97)).toBe("97/103mg");
  });

  it("uses the brand ratio, not a reference ratio", () => {
    const entresto24 = {
      strength: 50,
      compounds: [
        { name: "Sacubitril", strength: 24 },
        { name: "Valsartan", strength: 26 },
      ],
    };
    expect(formatComboDose(100, "mg", entresto24)).toBe("48/52mg");
  });

  it("shows the summed dose when no combo brand is stocked", () => {
    expect(formatComboDose(200, "mg")).toBe("200mg");
    expect(formatComboDose(200, "mg", { strength: 100 })).toBe("200mg");
  });
});

// gap-combo-drugs-pill-math#3: warn when a stocked brand isn't the same
// combination as the prescription it is filed under.
describe("compoundsMismatch", () => {
  const rx: CompoundStrength[] = [
    { name: "Sacubitril", strength: 24 },
    { name: "Valsartan", strength: 26 },
  ];

  it("accepts every marketed strength of the same combination", () => {
    // 24/26, 49/51 and 97/103 don't share one exact ratio.
    expect(compoundsMismatch(rx, entresto)).toBe(false);
    expect(compoundsMismatch(rx, [
      { name: "valsartan", strength: 103 },
      { name: "SACUBITRIL", strength: 97 },
    ])).toBe(false);
  });

  it("flags different ingredients", () => {
    expect(compoundsMismatch(rx, [
      { name: "Amlodipine", strength: 5 },
      { name: "Valsartan", strength: 80 },
    ])).toBe(true);
  });

  it("flags a different ratio of the same ingredients", () => {
    expect(compoundsMismatch(rx, [
      { name: "Sacubitril", strength: 25 },
      { name: "Valsartan", strength: 75 },
    ])).toBe(true);
  });

  it("has nothing to compare when either side is not a combination", () => {
    expect(compoundsMismatch(undefined, entresto)).toBe(false);
    expect(compoundsMismatch(rx, undefined)).toBe(false);
  });
});
