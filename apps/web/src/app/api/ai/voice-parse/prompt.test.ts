import { describe, it, expect } from "vitest";
import { buildUserMessage, describeMedications } from "@intake/ai-prompts/voice-parse";

describe("the medication list in the user turn", () => {
  it("names each medicine, its brands and its dose times", () => {
    expect(
      describeMedications([
        { name: "Furosemide", brands: ["Lasix"], doseTimes: ["08:30", "14:00"] },
        { name: "Paracetamol", brands: [], doseTimes: [] },
      ]),
    ).toBe(
      "The user's medications and today's dose times:\n" +
        "- Furosemide (brands: Lasix): dose times 08:30, 14:00\n" +
        "- Paracetamol: no dose times (as needed)",
    );
  });

  it("says when there are none, and sits before the transcript", () => {
    const message = buildUserMessage("I took a paracetamol");
    expect(message).toContain("The user has no medications on their list.");
    expect(message.indexOf("no medications")).toBeLessThan(message.indexOf("Voice transcript"));
  });
});
