import { describe, it, expect } from "vitest";
import {
  baseSyncFields,
  cn,
  formatAmount,
  generateId,
  getLiquidTypeLabel,
  syncFields,
} from "@/lib/utils";
import type { LiquidPreset } from "@/lib/constants";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("formatAmount", () => {
  it("appends unit for small values", () => {
    expect(formatAmount(250, "ml")).toBe("250ml");
  });

  it("converts ml to liters at the 1000 boundary", () => {
    expect(formatAmount(1000, "ml")).toBe("1.0L");
  });

  it("does not convert just below the 1000 boundary", () => {
    expect(formatAmount(999, "ml")).toBe("999ml");
  });

  it("converts large ml values with one decimal", () => {
    expect(formatAmount(1500, "ml")).toBe("1.5L");
  });

  it("never converts non-ml units even when large", () => {
    expect(formatAmount(2000, "mg")).toBe("2000mg");
  });

  it("never renders a total just over a whole-litre limit as equal to it", () => {
    expect(formatAmount(1040, "ml")).toBe("1.04L");
    expect(formatAmount(1004, "ml")).toBe("1.004L");
    expect(formatAmount(1040, "ml")).not.toBe(formatAmount(1000, "ml"));
  });

  it("rounds away floating-point noise in summed amounts", () => {
    expect(formatAmount(0.1 + 0.2, "g")).toBe("0.3g");
    expect(formatAmount(12.3 + 5.1 + 2.2, "g")).toBe("19.6g");
    expect(formatAmount(1499.6, "mg")).toBe("1499.6mg");
  });
});

describe("generateId", () => {
  it("returns an RFC 4122 v4 UUID", () => {
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("produces unique values across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("syncFields / baseSyncFields", () => {
  it("syncFields stamps timezone for tables that declare it", () => {
    const f = syncFields();
    expect(typeof f.timezone).toBe("string");
    expect(f.deletedAt).toBeNull();
    expect(f.createdAt).toBe(f.updatedAt);
  });

  // Prescription / MedicationPhase / PhaseSchedule / TitrationPlan /
  // UserProfile / InsightReport have no `timezone` field, locally or on the
  // server — spreading one in wrote an untyped, local-only value that was
  // dropped on the first sync round-trip (dexie-schema#15).
  it("baseSyncFields omits timezone", () => {
    const f = baseSyncFields();
    expect(f).not.toHaveProperty("timezone");
    expect(Object.keys(f).sort()).toEqual(
      ["createdAt", "deletedAt", "deviceId", "updatedAt"],
    );
  });
});

describe("getLiquidTypeLabel", () => {
  it("returns null for undefined or manual source", () => {
    expect(getLiquidTypeLabel(undefined)).toBeNull();
    expect(getLiquidTypeLabel("manual")).toBeNull();
  });

  it("capitalizes legacy coffee sub-source", () => {
    expect(getLiquidTypeLabel("coffee:latte")).toBe("Latte");
  });

  it("falls back to Coffee for bare coffee prefix", () => {
    expect(getLiquidTypeLabel("coffee:")).toBe("Coffee");
  });

  it("handles beverage prefixes", () => {
    expect(getLiquidTypeLabel("beverage")).toBe("Beverage");
    expect(getLiquidTypeLabel("beverage:Juice")).toBe("Juice");
    expect(getLiquidTypeLabel("beverage:")).toBe("Beverage");
  });

  it("handles juice prefixes with capitalization", () => {
    expect(getLiquidTypeLabel("juice")).toBe("Juice");
    expect(getLiquidTypeLabel("juice:orange")).toBe("Orange");
  });

  it("uses note for food sources, defaults to Food", () => {
    expect(getLiquidTypeLabel("food")).toBe("Food");
    expect(getLiquidTypeLabel("food", { note: "Soup" })).toBe("Soup");
    expect(getLiquidTypeLabel("food:ai_parse", { note: "Stew" })).toBe("Stew");
  });

  it("uses the note for logDrink sources, defaults to Drink", () => {
    // `logDrink` puts the drink name on the water row's note; without a case
    // here a dictated latte rendered as a bare amount with no label.
    expect(getLiquidTypeLabel("drink")).toBe("Drink");
    expect(getLiquidTypeLabel("drink", { note: "Latte" })).toBe("Latte");
    expect(getLiquidTypeLabel("voice", { note: "Pint of lager" })).toBe(
      "Pint of lager",
    );
    expect(getLiquidTypeLabel("voice")).toBe("Drink");
  });

  it("returns null for preset:manual", () => {
    expect(getLiquidTypeLabel("preset:manual")).toBeNull();
  });

  it("resolves preset id to its name", () => {
    const presets: LiquidPreset[] = [
      { id: "abc", name: "Green Tea" } as LiquidPreset,
    ];
    expect(getLiquidTypeLabel("preset:abc", { presets })).toBe("Green Tea");
  });

  it("falls back to Beverage for unknown preset id", () => {
    expect(getLiquidTypeLabel("preset:missing", { presets: [] })).toBe(
      "Beverage",
    );
  });

  // The note is the drink's name as it was when logged. Presets live only in
  // this device's localStorage, so the preset lookup is a fallback: it went
  // missing on another device and renamed every past row with the preset.
  it("labels a preset:manual row from its note", () => {
    expect(getLiquidTypeLabel("preset:manual", { note: "Flat white" })).toBe(
      "Flat white",
    );
  });

  it("prefers the stored note over the current preset name", () => {
    const presets: LiquidPreset[] = [
      { id: "abc", name: "Renamed Mate" } as LiquidPreset,
    ];
    expect(
      getLiquidTypeLabel("preset:abc", { presets, note: "Club-Mate" }),
    ).toBe("Club-Mate");
    expect(
      getLiquidTypeLabel("preset:gone", { presets: [], note: "Club-Mate" }),
    ).toBe("Club-Mate");
  });

  it("uses note for substance sources, defaults to Drink", () => {
    expect(getLiquidTypeLabel("substance:xyz")).toBe("Drink");
    expect(getLiquidTypeLabel("substance:xyz", { note: "Cola" })).toBe("Cola");
  });

  it("uses note for manual sub-sources, defaults to Food", () => {
    expect(getLiquidTypeLabel("manual:food_water_content")).toBe("Food");
  });

  it("returns null for unknown source formats", () => {
    expect(getLiquidTypeLabel("totally-unknown")).toBeNull();
  });
});
