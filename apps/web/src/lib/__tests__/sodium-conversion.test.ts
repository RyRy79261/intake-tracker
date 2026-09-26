/**
 * One salt → sodium factor everywhere.
 *
 * Manual entry converted table salt with 0.39 while the AI parse prompt said
 * "÷ 2.5" (0.40) — and its tool description left out the g → mg step
 * entirely, so a label's "salt 1.2 g" could come back as sodium_mg 0.48.
 * Both now read SODIUM_FRACTION from @intake/core.
 */
import { describe, it, expect } from "vitest";
import {
  SODIUM_FRACTION,
  SODIUM_FRACTIONS,
  MSG_SODIUM_FRACTION,
  saltGramsToSodiumMg,
  toSodiumMg,
  describeSodiumEntry,
} from "@intake/core/sodium";
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

/**
 * Salt is not sodium (owner clarification, 2026-09 follow-up). The tracked
 * quantity is sodium mg; the user may enter it as salt, MSG or sodium, and
 * the record keeps what they entered so it can be shown and edited as typed.
 */
describe("sodium sources", () => {
  it("tells the parse and voice prompts MSG's own factor too", () => {
    expect(SYSTEM_PROMPT).toContain("sodium_mg = msg_g × 123");
    expect(VOICE_SYSTEM_PROMPT).toContain("sodium_mg = msg_g × 123");
    expect(PARSE_RESULT_TOOL.input_schema.properties.sodium_mg.description).toContain(
      "MSG g × 123 = sodium mg",
    );
  });

  it("keeps one fraction per source substance", () => {
    // MSG monohydrate: 22.99 / 187.13 ≈ 12.3% sodium
    expect(MSG_SODIUM_FRACTION).toBe(0.123);
    expect(SODIUM_FRACTIONS).toEqual({ sodium: 1, salt: 0.393, msg: 0.123 });
  });

  it("converts an entered amount of salt, MSG or sodium in mg or g to sodium mg", () => {
    expect(toSodiumMg(2, "g", "salt")).toBeCloseTo(786, 5);
    expect(toSodiumMg(2000, "mg", "salt")).toBeCloseTo(786, 5);
    expect(toSodiumMg(1, "g", "msg")).toBeCloseTo(123, 5);
    expect(toSodiumMg(500, "mg", "sodium")).toBe(500);
    expect(toSodiumMg(0.5, "g", "sodium")).toBe(500);
  });

  it("describes what was entered, and nothing for a record without a source", () => {
    expect(describeSodiumEntry({ sodiumSource: "salt", sourceAmount: 2, sourceUnit: "g" })).toBe("from 2 g salt");
    expect(describeSodiumEntry({ sodiumSource: "msg", sourceAmount: 500, sourceUnit: "mg" })).toBe("from 500 mg MSG");
    // Sodium entered directly: the stored amount already says it all.
    expect(describeSodiumEntry({ sodiumSource: "sodium", sourceAmount: 500, sourceUnit: "mg" })).toBeNull();
    // Legacy rows: sodium mg with an unknown source.
    expect(describeSodiumEntry({})).toBeNull();
  });
});
