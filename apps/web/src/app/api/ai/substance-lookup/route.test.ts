import { describe, it, expect } from "vitest";
import { SubstanceLookupResponseSchema, SUBSTANCE_LOOKUP_TOOL } from "@/app/api/ai/substance-lookup/schema";
import { buildSystemPrompt } from "@intake/ai-prompts/substance-lookup";

const validResponse = {
  substancePer100ml: 38,
  defaultVolumeMl: 250,
  beverageName: "Coffee",
  reasoning: "Standard drip coffee caffeine estimate",
};

describe("SubstanceLookupResponseSchema", () => {
  it("accepts a valid response with the required fields", () => {
    const result = SubstanceLookupResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  // Drinks are booked at full volume, so the lookup no longer carries a
  // water-content share; a model that still sends one is ignored.
  it("drops a stray waterContentPercent from the parsed output", () => {
    const result = SubstanceLookupResponseSchema.safeParse({
      ...validResponse,
      waterContentPercent: 93,
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("waterContentPercent");
  });
});

// The Coffee/Alcohol lookup used to return only caffeine or ABV, so a cola or
// a cider looked up there was logged with no sugar at all while the same drink
// via voice or the Food card recorded it.
describe("SubstanceLookupResponseSchema solutes", () => {
  it("keeps sugar and sodium per 100 ml in the parsed output", () => {
    const result = SubstanceLookupResponseSchema.safeParse({
      ...validResponse,
      sugarPer100ml: 10.6,
      sodiumPer100ml: 4,
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ sugarPer100ml: 10.6, sodiumPer100ml: 4 });
  });

  it("rejects a negative sugar value", () => {
    const result = SubstanceLookupResponseSchema.safeParse({
      ...validResponse,
      sugarPer100ml: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 100 g of sugar per 100 ml", () => {
    const result = SubstanceLookupResponseSchema.safeParse({
      ...validResponse,
      sugarPer100ml: 101,
    });
    expect(result.success).toBe(false);
  });
});

describe("SUBSTANCE_LOOKUP_TOOL", () => {
  it("asks for sugar and sodium per 100 ml", () => {
    const { properties, required } = SUBSTANCE_LOOKUP_TOOL.input_schema;
    expect(properties).toHaveProperty("sugarPer100ml");
    expect(properties).toHaveProperty("sodiumPer100ml");
    expect(required).toContain("sugarPer100ml");
    expect(required).toContain("sodiumPer100ml");
  });

  it("tells both prompts to report sugar and sodium", () => {
    for (const type of ["caffeine", "alcohol"] as const) {
      const flat = buildSystemPrompt(type).replace(/\s+/g, " ");
      expect(flat).toMatch(/sugarPer100ml = grams of total sugars per 100 ml/);
      expect(flat).toMatch(/sodiumPer100ml = milligrams of sodium per 100 ml/);
    }
  });


  it("does not ask for a water-content share", () => {
    const { properties, required } = SUBSTANCE_LOOKUP_TOOL.input_schema;
    expect(properties).not.toHaveProperty("waterContentPercent");
    expect(required).not.toContain("waterContentPercent");
    for (const type of ["caffeine", "alcohol"] as const) {
      expect(buildSystemPrompt(type)).not.toMatch(/water ?content/i);
    }
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
    // Matches equivalent wordings too - "38 mg per 100 ml" is just as much an
    // anchor as "38 mg / 100 ml".
    const anchored = lines.filter((line) =>
      /\b\d+(?:\s*-\s*\d+)?\s*(?:mg|milligrams?)\s*(?:\/|per)\s*100\s*ml\b/i.test(line),
    );
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
