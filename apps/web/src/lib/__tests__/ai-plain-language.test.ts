/**
 * Every AI answer the user reads as prose is written in ASD-STE100
 * Simplified Technical English (PR #365 did this for the medicine lookup).
 *
 * Each prompt carries a PLAIN LANGUAGE section, and each free-text tool
 * field repeats the rule in its description, because the model reads field
 * descriptions when it fills the tool input. Names, doses and units stay
 * exact: the rule must say so.
 */
import { describe, it, expect } from "vitest";
import { STE_FIELD_SUFFIX } from "@intake/ai-prompts/plain-language";
import * as medicineSearch from "@intake/ai-prompts/medicine-search";
import * as interactionCheck from "@intake/ai-prompts/interaction-check";
import * as titrationWarnings from "@intake/ai-prompts/titration-warnings";
import * as nutrientAnalysis from "@intake/ai-prompts/nutrient-analysis";
import {
  INSIGHT_TOOL,
  INSIGHTS_SYSTEM_PROMPT,
  DEEP_SYSTEM_PROMPT,
} from "@intake/ai-prompts/analytics-insights";

function expectPlainLanguageSection(prompt: string) {
  expect(prompt).toContain("PLAIN LANGUAGE (ASD-STE100 Simplified Technical English)");
  expect(prompt).toMatch(/at most 20 words/);
  expect(prompt).toMatch(/active voice/);
  // Names, doses and units must never be "simplified".
  expect(prompt).toMatch(/Do NOT simplify names or numbers/);
}

function expectSte(description: string | undefined) {
  expect(description).toBeDefined();
  expect(description).toContain(STE_FIELD_SUFFIX.trim());
}

describe("ASD-STE100 plain-language output", () => {
  it("medicine search keeps its rule (regression for #365)", () => {
    expectPlainLanguageSection(medicineSearch.SYSTEM_PROMPT);
    const p = medicineSearch.MEDICINE_SEARCH_TOOL.input_schema.properties;
    for (const field of [
      p.commonIndications,
      p.foodNote,
      p.pillDescription,
      p.drugClass,
      p.visualIdentification,
      p.contraindications,
      p.warnings,
    ]) {
      expectSte(field.description);
    }
  });

  it("interaction check asks for plain English in its prompt and prose fields", () => {
    expectPlainLanguageSection(interactionCheck.SYSTEM_PROMPT);
    const p = interactionCheck.INTERACTION_CHECK_TOOL.input_schema.properties;
    expectSte(p.interactions.items.properties.description.description);
    expectSte(p.drugClass.description);
    expectSte(p.summary.description);
  });

  it("interaction check keeps substance and medication names exact", () => {
    const row = interactionCheck.INTERACTION_CHECK_TOOL.input_schema.properties.interactions.items.properties;
    expect(JSON.stringify(row.substance)).not.toContain("ASD-STE100");
    expect(row.medication.description).not.toContain("ASD-STE100");
    expect(row.medication.description).toMatch(/exactly/);
    // The user prompt lists "- bisoprolol (Beta blocker)". A live call with
    // "exactly as the user wrote it" copied the bracketed class into the
    // name, so the UI showed "ibuprofen vs bisoprolol (Beta blocker)".
    expect(row.medication.description).toMatch(/without the drug class/);
  });

  it("titration warnings ask for plain English in the prompt and each warning", () => {
    expectPlainLanguageSection(titrationWarnings.SYSTEM_PROMPT);
    expectSte(titrationWarnings.TITRATION_WARNINGS_TOOL.input_schema.properties.warnings.description);
  });

  it("titration warning example matches the one-sentence-per-warning rule", () => {
    // The prompt caps each warning at one short sentence, so the example the
    // model copies must be one sentence too (a two-sentence example
    // contradicts the rule and the model follows the example).
    expect(titrationWarnings.SYSTEM_PROMPT).toContain("Keep each warning to one short sentence");
    const example = titrationWarnings.SYSTEM_PROMPT.match(/Each warning says[^\n]*Example: "([^"]+)"/)?.[1];
    expect(example).toBeDefined();
    expect(example!.match(/[.!?](\s|$)/g)).toHaveLength(1);
    expect(example).toMatch(/50 beats per minute/);
  });

  it("analytics insights (fast and deep) ask for plain English", () => {
    expectPlainLanguageSection(INSIGHTS_SYSTEM_PROMPT);
    expectPlainLanguageSection(DEEP_SYSTEM_PROMPT);
    const p = INSIGHT_TOOL.input_schema.properties;
    expectSte(p.summary.description);
    expectSte(p.observations.description);
    // Deep-mode examples model the style, so they must not use raw jargon.
    expect(DEEP_SYSTEM_PROMPT).not.toMatch(/in HFrEF/);
  });

  it("nutrient analysis asks for plain English in its prose fields", () => {
    expectPlainLanguageSection(nutrientAnalysis.SYSTEM_PROMPT);
    const p = nutrientAnalysis.NUTRIENT_ANALYSIS_TOOL.input_schema.properties;
    expectSte(p.summary.description);
    expectSte(p.findings.items.properties.detail.description);
    expectSte(p.caveats.description);
  });
});
