import { describe, it, expect } from "vitest";
import { waterContentPercentFromAbv } from "@intake/core/alcohol";

describe("waterContentPercentFromAbv", () => {
  it("is the non-alcohol share of the drink", () => {
    expect(waterContentPercentFromAbv(40)).toBe(60);
    expect(waterContentPercentFromAbv(5)).toBe(95);
  });

  it("treats a missing or nonsensical ABV as all water", () => {
    for (const abv of [undefined, null, 0, -3, 100, 140, Number.NaN]) {
      expect(waterContentPercentFromAbv(abv)).toBe(100);
    }
  });
});
