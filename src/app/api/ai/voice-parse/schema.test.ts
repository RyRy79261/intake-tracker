import { describe, it, expect } from "vitest";
import { extractVoiceItems, PARSE_TOOL, MAX_ITEMS } from "@/app/api/ai/voice-parse/schema";

const bp = { kind: "blood_pressure", systolic: 120, diastolic: 80, heartRate: 72 };
const water = { kind: "water", ml: 250 };
const food = { kind: "food", description: "toasted cheese sandwich", grams: 180, sodiumMg: 600 };

describe("extractVoiceItems", () => {
  it("accepts a well-formed multi-item payload", () => {
    const result = extractVoiceItems({ items: [bp, water, food], reasoning: "ok" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(3);
    expect(result.dropped).toBe(0);
    expect(result.reasoning).toBe("ok");
  });

  it("keeps valid items and drops a single malformed one instead of failing all", () => {
    // blood_pressure item missing required systolic/diastolic.
    const badBp = { kind: "blood_pressure", heartRate: 72 };
    const result = extractVoiceItems({ items: [badBp, water, food] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(2);
    expect(result.dropped).toBe(1);
    expect(result.items.map((i) => i.kind)).toEqual(["water", "food"]);
  });

  it("truncates an over-long reasoning string rather than rejecting the payload", () => {
    const longReasoning = "x".repeat(5000);
    const result = extractVoiceItems({ items: [water], reasoning: longReasoning });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.reasoning).toHaveLength(1000);
  });

  it("returns an empty list (not a failure) when the model parses nothing", () => {
    const result = extractVoiceItems({ items: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(0);
    expect(result.dropped).toBe(0);
  });

  it("fails when items were present but none survived validation", () => {
    const result = extractVoiceItems({ items: [{ kind: "blood_pressure" }, { kind: "weight" }] });
    expect(result.ok).toBe(false);
  });

  it("fails when the tool output has no items array", () => {
    expect(extractVoiceItems({ reasoning: "no items key" }).ok).toBe(false);
    expect(extractVoiceItems({ items: "not-an-array" }).ok).toBe(false);
    expect(extractVoiceItems(null).ok).toBe(false);
    expect(extractVoiceItems("string").ok).toBe(false);
  });

  it("caps the returned list at MAX_ITEMS", () => {
    const many = Array.from({ length: MAX_ITEMS + 5 }, () => water);
    const result = extractVoiceItems({ items: many });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(MAX_ITEMS);
  });

  it("omits reasoning when it is absent or blank", () => {
    const noReasoning = extractVoiceItems({ items: [water] });
    expect(noReasoning.ok && noReasoning.reasoning).toBeUndefined();
    const blank = extractVoiceItems({ items: [water], reasoning: "   " });
    expect(blank.ok && blank.reasoning).toBeUndefined();
  });
});

describe("PARSE_TOOL", () => {
  it("declares the parse_voice_log tool with an items array", () => {
    expect(PARSE_TOOL.name).toBe("parse_voice_log");
    expect(PARSE_TOOL.input_schema.required).toContain("items");
  });
});
