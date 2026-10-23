import { describe, expect, it } from "vitest";
import { isInteractionQuestion } from "@/lib/voice-interaction-intent";

describe("isInteractionQuestion", () => {
  it.each([
    "I need you to look up interactions and contraindications of these things: pseudoephedrine, ibuprofen.",
    "Check the contra-indications of sudo fed rin",
    "Does ibuprofen interact with my meds?",
    "Can I take Sudafed?",
    "What can't I take with my meds?",
    "What can’t I take?",
    "Is it safe to take paracetamol?",
    "Can I mix alcohol with bisoprolol?",
    "Does grapefruit mix with my meds?",
    "Does ibuprofen mix well with my meds?",
  ])("asks: %s", (text) => {
    expect(isInteractionQuestion(text)).toBe(true);
  });

  it.each([
    "I had a coffee and two slices of toast",
    "I took my 8:30 meds",
    "Blood pressure 120 over 80, heart rate 64",
    "I'm going to take a walk",
    "I drank 500 ml of water",
    "I had porridge mixed with honey",
    "A protein shake mixing with milk",
  ])("logs: %s", (text) => {
    expect(isInteractionQuestion(text)).toBe(false);
  });
});
