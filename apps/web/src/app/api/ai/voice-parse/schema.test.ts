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

  // core-duplication#7: the parse accepts exactly the ranges the add forms do
  // (@intake/core/record-schemas), not its own looser or tighter copy.
  it("uses the shared blood-pressure and weight ranges", () => {
    const result = extractVoiceItems({
      items: [
        { kind: "blood_pressure", systolic: 45, diastolic: 30 }, // below 50
        { kind: "blood_pressure", systolic: 280, diastolic: 90 }, // add form allows up to 300
        { kind: "weight", weightKg: 600 }, // above 500
        { kind: "weight", weightKg: 500 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toBe(2);
    expect(result.items).toEqual([
      expect.objectContaining({ kind: "blood_pressure", systolic: 280 }),
      expect.objectContaining({ kind: "weight", weightKg: 500 }),
    ]);
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
    // The cut is reported so the review panel can say items were left out.
    expect(result.overCap).toBe(5);
  });

  it("reports no over-cap items when the list fits", () => {
    const result = extractVoiceItems({ items: [water] });
    expect(result.ok && result.overCap).toBe(0);
  });

  it("keeps a spoken clock time and a relative offset on an item", () => {
    const result = extractVoiceItems({
      items: [
        { ...food, time: "13:00" },
        { ...water, minutesAgo: 30 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]).toMatchObject({ time: "13:00" });
    expect(result.items[1]).toMatchObject({ minutesAgo: 30 });
  });

  it("strips a malformed time instead of dropping the whole item", () => {
    // A bad time must not cost the user the reading itself.
    const result = extractVoiceItems({
      items: [
        { ...bp, time: "1pm" },
        { ...water, minutesAgo: -5 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(2);
    expect(result.dropped).toBe(0);
    expect(result.items[0]).not.toHaveProperty("time");
    expect(result.items[1]).not.toHaveProperty("minutesAgo");
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

  it("offers the per-item time fields to the model", () => {
    const props = PARSE_TOOL.input_schema.properties.items.items.properties;
    expect(props).toHaveProperty("time");
    expect(props).toHaveProperty("minutesAgo");
  });
});
