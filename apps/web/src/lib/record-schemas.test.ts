import { describe, it, expect } from "vitest";
import {
  BP_ORDER_MESSAGE,
  FUTURE_TIMESTAMP_MESSAGE,
  FUTURE_TIMESTAMP_SKEW_MS,
  bloodPressureRecordSchema,
  isFutureTimestamp,
  isSwappedBloodPressure,
  normalizeAmountEstimate,
  parseBloodPressureForm,
  parseNumericInput,
  parseWeightForm,
  weightRecordSchema,
  estimateRecordSchema,
} from "@intake/core/record-schemas";

describe("parseNumericInput", () => {
  it("treats blank as not entered and rejects partial numbers", () => {
    expect(parseNumericInput("  ")).toBeUndefined();
    expect(parseNumericInput("72.4")).toBe(72.4);
    expect(parseNumericInput("12abc")).toBeNaN();
  });
});

describe("timestamps", () => {
  it("allows a small clock skew but rejects real future times", () => {
    const now = 1_000_000_000_000;
    expect(isFutureTimestamp(now + FUTURE_TIMESTAMP_SKEW_MS, now)).toBe(false);
    expect(isFutureTimestamp(now + FUTURE_TIMESTAMP_SKEW_MS + 1, now)).toBe(true);
  });

  it("every record schema rejects a timestamp hours ahead", () => {
    const future = Date.now() + 8 * 60 * 60 * 1000;
    for (const result of [
      weightRecordSchema(Date.now()).safeParse({ weight: 70, timestamp: future }),
      bloodPressureRecordSchema(Date.now()).safeParse({ systolic: 120, diastolic: 80, timestamp: future }),
      estimateRecordSchema(Date.now()).safeParse({ timestamp: future }),
    ]) {
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(FUTURE_TIMESTAMP_MESSAGE);
    }
  });
});

describe("parseWeightForm", () => {
  it("keeps a typed reading exactly (2 dp), with no increment snapping", () => {
    expect(parseWeightForm({ weight: "72.4" })).toEqual({ ok: true, data: { weight: 72.4 } });
    expect(parseWeightForm({ weight: "72.333" })).toEqual({ ok: true, data: { weight: 72.33 } });
  });

  it("rejects out-of-range, blank and non-numeric values", () => {
    expect(parseWeightForm({ weight: "724" }).ok).toBe(false);
    expect(parseWeightForm({ weight: "0" }).ok).toBe(false);
    expect(parseWeightForm({ weight: "" })).toMatchObject({ ok: false, message: "Weight is required" });
    expect(parseWeightForm({ weight: "7o" })).toMatchObject({ ok: false, message: "Weight must be a number" });
  });
});

describe("parseBloodPressureForm", () => {
  it("accepts a normal reading and maps a blank heart rate to null", () => {
    expect(parseBloodPressureForm({ systolic: "120", diastolic: "80", heartRate: "" })).toEqual({
      ok: true,
      data: { systolic: 120, diastolic: 80, heartRate: null },
    });
  });

  it("rejects decimals instead of truncating them", () => {
    const result = parseBloodPressureForm({ systolic: "120.9", diastolic: "80", heartRate: "" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { systolic: "Must be a whole number" } });
  });

  it("uses one range set (1200 systolic is rejected)", () => {
    expect(parseBloodPressureForm({ systolic: "1200", diastolic: "80", heartRate: "" }).ok).toBe(false);
    expect(parseBloodPressureForm({ systolic: "120", diastolic: "80", heartRate: "400" }).ok).toBe(false);
  });

  it("rejects systolic <= diastolic and suggests a swap when swapped is valid", () => {
    const result = parseBloodPressureForm({ systolic: "80", diastolic: "120", heartRate: "" });
    expect(result).toMatchObject({ ok: false, message: BP_ORDER_MESSAGE, swapSuggested: true });

    const equal = parseBloodPressureForm({ systolic: "90", diastolic: "90", heartRate: "" });
    expect(equal.ok).toBe(false);
    expect("swapSuggested" in equal).toBe(false);
  });

  it("isSwappedBloodPressure requires the swapped reading to be in range", () => {
    expect(isSwappedBloodPressure(80, 120)).toBe(true);
    expect(isSwappedBloodPressure(120, 80)).toBe(false);
    expect(isSwappedBloodPressure(10, 120)).toBe(false);
  });
});

describe("normalizeAmountEstimate", () => {
  it("maps blank and the No-estimate sentinel to null", () => {
    expect(normalizeAmountEstimate("")).toBeNull();
    expect(normalizeAmountEstimate("__none__")).toBeNull();
    expect(normalizeAmountEstimate("small")).toBe("small");
  });
});
