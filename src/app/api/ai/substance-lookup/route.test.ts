import { describe, it, expect } from "vitest";
import { SubstanceLookupResponseSchema, SUBSTANCE_LOOKUP_TOOL } from "./schema";

const validResponse = {
  substancePer100ml: 38,
  defaultVolumeMl: 250,
  beverageName: "Coffee",
  reasoning: "Standard drip coffee caffeine estimate",
  waterContentPercent: 99,
};

describe("SubstanceLookupResponseSchema", () => {
  it("accepts a valid response with all 5 fields", () => {
    const result = SubstanceLookupResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it("accepts waterContentPercent at 0 (min boundary)", () => {
    const result = SubstanceLookupResponseSchema.safeParse({
      ...validResponse,
      waterContentPercent: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts waterContentPercent at 100 (max boundary)", () => {
    const result = SubstanceLookupResponseSchema.safeParse({
      ...validResponse,
      waterContentPercent: 100,
    });
    expect(result.success).toBe(true);
  });

  it("accepts waterContentPercent at 93 (typical beer)", () => {
    const result = SubstanceLookupResponseSchema.safeParse({
      ...validResponse,
      waterContentPercent: 93,
    });
    expect(result.success).toBe(true);
  });

  it("rejects waterContentPercent at -1 (below min)", () => {
    const result = SubstanceLookupResponseSchema.safeParse({
      ...validResponse,
      waterContentPercent: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects waterContentPercent at 101 (above max)", () => {
    const result = SubstanceLookupResponseSchema.safeParse({
      ...validResponse,
      waterContentPercent: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects response when waterContentPercent is missing", () => {
    const { waterContentPercent: _, ...withoutWater } = validResponse;
    const result = SubstanceLookupResponseSchema.safeParse(withoutWater);
    expect(result.success).toBe(false);
  });
});

describe("SUBSTANCE_LOOKUP_TOOL", () => {
  it("includes waterContentPercent in required array", () => {
    expect(SUBSTANCE_LOOKUP_TOOL.input_schema.required).toContain("waterContentPercent");
  });

  it("includes waterContentPercent in properties", () => {
    expect(SUBSTANCE_LOOKUP_TOOL.input_schema.properties).toHaveProperty("waterContentPercent");
  });
});
