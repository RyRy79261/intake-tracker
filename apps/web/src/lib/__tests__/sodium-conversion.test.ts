/**
 * One salt → sodium factor everywhere.
 *
 * Manual entry converted table salt with 0.39 while the AI parse prompt said
 * "÷ 2.5" (0.40) — and its tool description left out the g → mg step
 * entirely, so a label's "salt 1.2 g" could come back as sodium_mg 0.48.
 * Both now read SODIUM_FRACTION from @intake/core.
 */
import { describe, it, expect } from "vitest";
import { SODIUM_FRACTION, saltGramsToSodiumMg } from "@intake/core/sodium";
import { PARSE_RESULT_TOOL, SYSTEM_PROMPT } from "@intake/ai-prompts/parse";
import { SYSTEM_PROMPT as VOICE_SYSTEM_PROMPT } from "@intake/ai-prompts/voice-parse";

describe("salt → sodium conversion", () => {
  it("uses NaCl's sodium mass fraction (22.99 / 58.44)", () => {
    expect(SODIUM_FRACTION).toBe(0.393);
    expect(saltGramsToSodiumMg(1.2)).toBeCloseTo(471.6, 5);
    expect(saltGramsToSodiumMg(0)).toBe(0);
  });

  it("gives the parse tool's sodium field an explicit g → mg conversion", () => {
    const description = PARSE_RESULT_TOOL.input_schema.properties.sodium_mg.description;
    expect(description).toContain("salt g × 393 = sodium mg");
    expect(description).not.toMatch(/divide by 2\.5/);
  });

  it("states the same factor in the parse and voice-parse system prompts", () => {
    expect(SYSTEM_PROMPT).toContain("sodium_mg = salt_g × 393");
    expect(SYSTEM_PROMPT).not.toMatch(/\/ 2\.5/);
    expect(VOICE_SYSTEM_PROMPT).toContain("sodium_mg = salt_g × 393");
    expect(VOICE_SYSTEM_PROMPT).not.toMatch(/salt_g \* 400/);
  });
});
