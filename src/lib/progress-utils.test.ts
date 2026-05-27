import { describe, it, expect } from "vitest";
import { computeTwoStageProgress } from "@/lib/progress-utils";

describe("computeTwoStageProgress", () => {
  it("returns zeros when target is 0", () => {
    expect(computeTwoStageProgress(500, 0, 500)).toEqual({
      primaryPct: 0,
      extendedPct: 0,
      targetPct: 0,
      isOverTarget: false,
      isOverExtended: false,
      isTwoStage: false,
      extendedCurrent: 0,
      extendedTotal: 500,
      maxAmount: 0,
    });
  });

  it("stays single-stage below target — the bar scales 0..target and the buffer is invisible", () => {
    const r = computeTwoStageProgress(750, 1500, 500);
    expect(r.isTwoStage).toBe(false);
    expect(r.maxAmount).toBe(1500);
    expect(r.primaryPct).toBeCloseTo((750 / 1500) * 100);
    expect(r.extendedPct).toBe(0);
    expect(r.targetPct).toBe(0);
    expect(r.isOverTarget).toBe(false);
    expect(r.isOverExtended).toBe(false);
    expect(r.extendedCurrent).toBe(0);
    expect(r.extendedTotal).toBe(500);
  });

  it("fills the primary segment fully when current equals target (still single-stage)", () => {
    const r = computeTwoStageProgress(1500, 1500, 500);
    expect(r.isTwoStage).toBe(false);
    expect(r.maxAmount).toBe(1500);
    expect(r.primaryPct).toBe(100);
    expect(r.extendedPct).toBe(0);
    expect(r.isOverTarget).toBe(false);
  });

  it("switches to two-stage above target — bar rescales to target+buffer", () => {
    const r = computeTwoStageProgress(1800, 1500, 500);
    expect(r.isTwoStage).toBe(true);
    expect(r.maxAmount).toBe(2000);
    expect(r.primaryPct).toBeCloseTo((1500 / 2000) * 100);
    expect(r.extendedPct).toBeCloseTo((300 / 2000) * 100);
    expect(r.targetPct).toBeCloseTo((1500 / 2000) * 100);
    expect(r.isOverTarget).toBe(true);
    expect(r.isOverExtended).toBe(false);
    expect(r.extendedCurrent).toBe(300);
    expect(r.extendedTotal).toBe(500);
  });

  it("flags over-extended when current exceeds target + buffer and surfaces the overshoot", () => {
    const r = computeTwoStageProgress(2200, 1500, 500);
    expect(r.isTwoStage).toBe(true);
    expect(r.isOverTarget).toBe(true);
    expect(r.isOverExtended).toBe(true);
    // Extended fill is capped at the buffer so the bar never overflows
    // the second segment, but extendedCurrent surfaces the real overshoot
    // (700ml) to the caller for the "extra" text line.
    expect(r.extendedPct).toBeCloseTo((500 / 2000) * 100);
    expect(r.extendedCurrent).toBe(700);
  });

  it("treats 0 buffer like single-stage at all fills (no extended segment, no marker)", () => {
    const under = computeTwoStageProgress(750, 1500, 0);
    expect(under.isTwoStage).toBe(false);
    expect(under.primaryPct).toBeCloseTo(50);
    expect(under.extendedPct).toBe(0);
    expect(under.targetPct).toBe(0);
    expect(under.maxAmount).toBe(1500);

    const over = computeTwoStageProgress(1600, 1500, 0);
    expect(over.isTwoStage).toBe(false);
    expect(over.isOverTarget).toBe(true);
    expect(over.isOverExtended).toBe(true);
  });

  it("clamps negative current to zero fill", () => {
    const r = computeTwoStageProgress(-100, 1500, 500);
    expect(r.primaryPct).toBe(0);
    expect(r.extendedPct).toBe(0);
    expect(r.extendedCurrent).toBe(0);
  });

  it("treats a negative buffer as zero", () => {
    const r = computeTwoStageProgress(750, 1500, -100);
    expect(r.maxAmount).toBe(1500);
    expect(r.extendedPct).toBe(0);
    expect(r.extendedTotal).toBe(0);
  });
});
