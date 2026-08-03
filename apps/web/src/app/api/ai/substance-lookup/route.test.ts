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

// Issue #262: pour-over came back at drip coffee's value. The cause is not a
// missing reference point -- it is that the model was allowed to answer
// caffeine queries from recall at all. Recalled figures collapse onto one
// remembered number per category, so brewing method stops moving the answer.
//
// Supplying a per-method table does not fix that: the table is the same
// recalled numbers, written down and unsourced. So these tests assert the
// opposite of a table -- that the caffeine prompt carries NO hardcoded
// mg / 100 ml values to anchor on, and mandates a search every time.
describe("buildSystemPrompt('caffeine') sources every value", () => {
  const prompt = buildSystemPrompt("caffeine");
  const lines = prompt.split("\n");
  // The prompt is hard-wrapped, so phrase assertions run against a
  // whitespace-collapsed copy rather than breaking on a line boundary.
  const flat = prompt.replace(/\s+/g, " ");

  it("mandates web_search on every query, not only branded products", () => {
    expect(flat).toMatch(/ALWAYS use the web_search tool/i);
    expect(flat).toMatch(/every query without exception/i);
  });

  it("never licenses answering caffeine content from recall", () => {
    expect(flat).toMatch(/[Nn]ever answer caffeine content from your own knowledge/);
    // The alcohol prompt keeps its own-knowledge licence (ABV is a label
    // value, not a searched measurement). The caffeine one must not.
    expect(flat).not.toMatch(/you may answer from your own knowledge/);
  });

  it("carries no hardcoded mg / 100 ml figure to anchor on", () => {
    const anchored = lines.filter((l) => /\d+\s*(?:-\s*\d+\s*)?mg \/ 100 ml/.test(l));
    expect(
      anchored,
      `caffeine prompt must not hardcode values; found: ${anchored.join(" | ")}`,
    ).toHaveLength(0);
  });

  it("still tells the model brewing method changes the answer", () => {
    expect(flat).toMatch(/pour-over/i);
    expect(flat).toMatch(/brewed coffee varies several-fold by method/i);
  });

  it("requires the source to be cited and unverified figures to be marked", () => {
    expect(flat).toMatch(/Cite what you actually used/i);
    expect(flat).toMatch(/clearly marked as unverified/i);
  });

  it("mentions its own knowledge only to forbid relying on it", () => {
    const mentions = flat.match(/.{0,45}your own knowledge/g) ?? [];
    expect(mentions.length).toBeGreaterThan(0);
    for (const mention of mentions) {
      expect(mention.toLowerCase(), `unguarded mention: "${mention}"`).toContain("never");
    }
  });
});
