import { describe, it, expect } from "vitest";
import { validateVoiceItem } from "@/lib/voice-validation";

describe("validateVoiceItem", () => {
  it("accepts well-formed items of every kind", () => {
    expect(validateVoiceItem({ kind: "blood_pressure", systolic: 120, diastolic: 80, heartRate: 70 })).toBeNull();
    expect(validateVoiceItem({ kind: "weight", weightKg: 80.4 })).toBeNull();
    expect(validateVoiceItem({ kind: "water", ml: 250 })).toBeNull();
    expect(validateVoiceItem({ kind: "salt", sodiumMg: 400 })).toBeNull();
    expect(validateVoiceItem({ kind: "food", description: "toast", grams: 40 })).toBeNull();
    expect(validateVoiceItem({ kind: "caffeine", description: "decaf", caffeineMg: 0 })).toBeNull();
    expect(
      validateVoiceItem({ kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 500 }),
    ).toBeNull();
    expect(validateVoiceItem({ kind: "urination", amountEstimate: "small" })).toBeNull();
    expect(validateVoiceItem({ kind: "defecation" })).toBeNull();
  });

  it("rejects a required value cleared to 0", () => {
    expect(validateVoiceItem({ kind: "water", ml: 0 })).toMatch(/water/i);
    expect(validateVoiceItem({ kind: "salt", sodiumMg: 0 })).not.toBeNull();
    expect(validateVoiceItem({ kind: "weight", weightKg: 0 })).not.toBeNull();
    expect(validateVoiceItem({ kind: "blood_pressure", systolic: 0, diastolic: 80 })).not.toBeNull();
  });

  it("rejects negative values, required or optional", () => {
    expect(validateVoiceItem({ kind: "water", ml: -250 })).not.toBeNull();
    expect(validateVoiceItem({ kind: "caffeine", description: "coffee", caffeineMg: -5 })).not.toBeNull();
    expect(
      validateVoiceItem({ kind: "food", description: "soup", waterMl: -100 }),
    ).not.toBeNull();
    expect(
      validateVoiceItem({ kind: "caffeine", description: "latte", caffeineMg: 80, sugarG: -1 }),
    ).not.toBeNull();
  });

  it("rejects values outside the manual form's range", () => {
    expect(validateVoiceItem({ kind: "blood_pressure", systolic: 400, diastolic: 80 })).not.toBeNull();
    expect(validateVoiceItem({ kind: "weight", weightKg: 1500 })).not.toBeNull();
    expect(
      validateVoiceItem({ kind: "alcohol", description: "beer", abvPercent: 120, volumeMl: 500 }),
    ).not.toBeNull();
  });

  it("rejects an empty description", () => {
    expect(validateVoiceItem({ kind: "food", description: "  " })).not.toBeNull();
  });

  it("requires an amount on a urination row, like the manual card", () => {
    expect(validateVoiceItem({ kind: "urination" })).toMatch(/amount/i);
  });

  it("rejects a malformed time", () => {
    expect(validateVoiceItem({ kind: "water", ml: 250, time: "25:00" })).not.toBeNull();
    expect(validateVoiceItem({ kind: "water", ml: 250, time: "08:30" })).toBeNull();
  });
});
