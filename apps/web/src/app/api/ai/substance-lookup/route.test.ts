import { describe, it, expect } from "vitest";
import { SubstanceLookupResponseSchema, SUBSTANCE_LOOKUP_TOOL } from "@/app/api/ai/substance-lookup/schema";
import { buildSystemPrompt } from "@intake/ai-prompts/substance-lookup";

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

// Issue #262: every brewed coffee collapsed onto the single
// "Filter / drip coffee: ~40 mg / 100 ml" reference point, and the prompt
// licensed answering coffee queries from generic knowledge, so brew method
// never moved the answer.
describe("buildSystemPrompt('caffeine') brew methods", () => {
  const prompt = buildSystemPrompt("caffeine");
  const lines = prompt.split("\n");
  const BREW_METHODS = ["pour-over", "french press", "aeropress", "moka pot", "cold brew"];

  const referenceLine = (method: string) =>
    lines.find((l) => l.startsWith("- ") && l.toLowerCase().includes(method));

  it.each(BREW_METHODS)("gives %s its own mg / 100 ml reference point", (method) => {
    const line = referenceLine(method);
    expect(line, `no reference point for ${method}`).toBeDefined();
    expect(line).toMatch(/mg \/ 100 ml/);
  });

  it("does not give every brew method the same drip-coffee value", () => {
    const values = BREW_METHODS.map((m) => referenceLine(m)?.match(/(\d+)\s*(?:-\s*\d+\s*)?mg/)?.[1]);
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it("does not license answering brewed-coffee queries from generic knowledge", () => {
    const ownKnowledge = lines.filter((l) => l.includes("your own knowledge"));
    expect(ownKnowledge.length).toBeGreaterThan(0);
    for (const line of ownKnowledge) {
      expect(line.toLowerCase()).not.toContain("coffee");
    }
  });

  it("tells the model to search when a brewing method is not covered by a reference point", () => {
    const brewRule = lines.find(
      (l) => /brew(ing)? method/i.test(l) && l.includes("web_search")
    );
    expect(brewRule, "no brewing-method rule pointing at web_search").toBeDefined();
  });
});
