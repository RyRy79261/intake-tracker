import { describe, it, expect } from "vitest";
import {
  parseStrength,
  convertStrength,
  normalizeStrengthUnit,
} from "@intake/core/strength";

describe("parseStrength", () => {
  it("reads a plain strength with and without a space", () => {
    expect(parseStrength("5mg")).toEqual({ value: 5, unit: "mg" });
    expect(parseStrength("Eliquis 5 mg")).toEqual({ value: 5, unit: "mg" });
  });

  it("strips thousands separators instead of reading 1,000 as 0 or 1", () => {
    expect(parseStrength("Metformin 1,000 mg")).toEqual({ value: 1000, unit: "mg" });
    expect(parseStrength("1 000 mg")).toEqual({ value: 1000, unit: "mg" });
    expect(parseStrength("12,500mg")).toEqual({ value: 12500, unit: "mg" });
  });

  it("reads a leading-dot decimal as 0.5, not 5", () => {
    expect(parseStrength(".5 mg")).toEqual({ value: 0.5, unit: "mg" });
    expect(parseStrength("0.5mg")).toEqual({ value: 0.5, unit: "mg" });
  });

  it("keeps a decimal comma", () => {
    expect(parseStrength("2,5 mg")).toEqual({ value: 2.5, unit: "mg" });
  });

  it("knows mcg, g and ml and their spellings", () => {
    expect(parseStrength("100mcg")).toEqual({ value: 100, unit: "mcg" });
    expect(parseStrength("100 µg")).toEqual({ value: 100, unit: "mcg" });
    expect(parseStrength("1 g")).toEqual({ value: 1, unit: "g" });
    expect(parseStrength("5 mL")).toEqual({ value: 5, unit: "ml" });
  });

  it("defaults a bare number to mg", () => {
    expect(parseStrength("75")).toEqual({ value: 75, unit: "mg" });
  });

  it("sums a slash-separated combination strength", () => {
    expect(parseStrength("49/51 mg")).toEqual({ value: 100, unit: "mg" });
  });

  it("ignores digits glued to a name", () => {
    expect(parseStrength("Vitamin B12 1000mcg")).toEqual({ value: 1000, unit: "mcg" });
  });

  it("returns null for blank, number-free, zero or unknown-unit text", () => {
    expect(parseStrength("")).toBeNull();
    expect(parseStrength(undefined)).toBeNull();
    expect(parseStrength("half a tablet")).toBeNull();
    expect(parseStrength("0 mg")).toBeNull();
    expect(parseStrength("5 tablets")).toBeNull();
  });
});

describe("convertStrength", () => {
  it("converts between mass units", () => {
    expect(convertStrength(0.1, "mg", "mcg")).toBe(100);
    expect(convertStrength(500, "mg", "g")).toBe(0.5);
    expect(convertStrength(5, "mg", "mg")).toBe(5);
  });

  it("refuses mass ↔ volume and unknown units", () => {
    expect(convertStrength(5, "mg", "ml")).toBeNull();
    expect(convertStrength(5, "iu", "mg")).toBeNull();
  });
});

describe("normalizeStrengthUnit", () => {
  it("maps aliases onto the controlled list", () => {
    expect(normalizeStrengthUnit("MG")).toBe("mg");
    expect(normalizeStrengthUnit("ug")).toBe("mcg");
    expect(normalizeStrengthUnit("tablet")).toBeNull();
  });
});
