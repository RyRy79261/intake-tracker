/**
 * Salt is not sodium (owner clarification, 2026-09 follow-up). The tracker
 * the codebase keys as "salt" holds sodium mg, so every user- or model-facing
 * label for it must say sodium. Salt/MSG only appear as what a sodium amount
 * was entered as.
 */
import { describe, it, expect } from "vitest";
import { QUICK_NAV_LABEL_OVERRIDES } from "@/lib/quick-nav-defaults";
import { MANUALS } from "@/lib/help/manuals";
import { queryRegistry } from "@/lib/analytics-registry";

describe("sodium labels", () => {
  it("names the Food card's footer entry after sodium", () => {
    expect(QUICK_NAV_LABEL_OVERRIDES.eating).toBe("Food & Sodium");
  });

  it("does not call sodium 'salt' in the help manuals", () => {
    const text = JSON.stringify(MANUALS);
    expect(text).not.toMatch(/sodium \(salt\)/);
    expect(text).not.toMatch(/water and salt limits/);
  });

  it("describes the correlation domain as sodium for the analytics tools", () => {
    const correlate = queryRegistry.find((q) => q.id === "custom_correlation");
    expect(correlate?.description).toMatch(/salt \(sodium mg\)/);
  });
});
