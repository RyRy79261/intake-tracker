import { describe, it, expect } from "vitest";
import { cn, formatAmount, generateId, getLiquidTypeLabel } from "@/lib/utils";
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
});

describe("generateId", () => {
  it("returns a timestamp-suffix shaped string", () => {
    expect(generateId()).toMatch(/^\d+-[a-z0-9]+$/);
  });

  it("produces unique values across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
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
