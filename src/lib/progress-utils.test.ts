import { describe, it, expect } from "vitest";
import { computeTwoStageProgress } from "@/lib/progress-utils";

describe("computeTwoStageProgress", () => {
  it("returns zeros when target is 0", () => {
    expect(computeTwoStageProgress(500, 0, 500)).toEqual({
      primaryPct: 0,
      extendedPct: 0,
      isOverTarget: false,
      isOverExtended: false,
      maxAmount: 0,
    });
  });

  it("computes a partial primary fill below target", () => {
    const r = computeTwoStageProgress(750, 1500, 500);
    expect(r.primaryPct).toBeCloseTo((750 / 2000) * 100);
    expect(r.extendedPct).toBe(0);
    expect(r.isOverTarget).toBe(false);
    expect(r.isOverExtended).toBe(false);
    expect(r.maxAmount).toBe(2000);
  });

  it("fills the primary segment fully when current equals target", () => {
    const r = computeTwoStageProgress(1500, 1500, 500);
    expect(r.primaryPct).toBeCloseTo((1500 / 2000) * 100);
    expect(r.extendedPct).toBe(0);
    expect(r.isOverTarget).toBe(false);
  });

  it("fills into the extended zone above target but below max", () => {
    const r = computeTwoStageProgress(1800, 1500, 500);
    expect(r.primaryPct).toBeCloseTo((1500 / 2000) * 100);
    expect(r.extendedPct).toBeCloseTo((300 / 2000) * 100);
    expect(r.isOverTarget).toBe(true);
    expect(r.isOverExtended).toBe(false);
  });

  it("flags over-extended when current exceeds target + buffer", () => {
    const r = computeTwoStageProgress(2200, 1500, 500);
    expect(r.isOverTarget).toBe(true);
    expect(r.isOverExtended).toBe(true);
    // Segments still report the capped fill; callers decide how to render.
    expect(r.primaryPct).toBeCloseTo((1500 / 2000) * 100);
    expect(r.extendedPct).toBeCloseTo((500 / 2000) * 100);
  });

  it("treats 0 buffer like single-stage (no extended segment)", () => {
    const under = computeTwoStageProgress(750, 1500, 0);
    expect(under.primaryPct).toBeCloseTo(50);
    expect(under.extendedPct).toBe(0);
    expect(under.maxAmount).toBe(1500);

    const over = computeTwoStageProgress(1600, 1500, 0);
    expect(over.isOverTarget).toBe(true);
    expect(over.isOverExtended).toBe(true);
  });

  it("clamps negative current to zero fill", () => {
    const r = computeTwoStageProgress(-100, 1500, 500);
    expect(r.primaryPct).toBe(0);
    expect(r.extendedPct).toBe(0);
  });

  it("treats a negative buffer as zero", () => {
    const r = computeTwoStageProgress(750, 1500, -100);
    expect(r.maxAmount).toBe(1500);
    expect(r.extendedPct).toBe(0);
  });
});
