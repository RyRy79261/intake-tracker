import { describe, it, expect } from "vitest";
import {
  compoundSum,
  isCombo,
  splitDose,
  scaleCompounds,
  formatCompoundShort,
  formatCompoundFull,
  formatCompoundNames,
} from "@/lib/compound-utils";
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
