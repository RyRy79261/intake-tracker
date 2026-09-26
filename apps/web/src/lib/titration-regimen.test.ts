import { describe, it, expect } from "vitest";
import { summarizeRegimen } from "@/lib/titration-regimen";

const DAILY = [0, 1, 2, 3, 4, 5, 6];

describe("summarizeRegimen", () => {
  it("averages a non-daily schedule over the week instead of calling it daily", () => {
    expect(summarizeRegimen([{ dosage: 25, daysOfWeek: [1, 3, 5] }], "mcg")).toEqual({
      averageDaily: "10.71mcg/day",
      frequency: "3 doses/week",
    });
  });

  it("sums every-day schedules and reports the per-day count", () => {
    expect(
      summarizeRegimen([{ dosage: 50, daysOfWeek: DAILY }, { dosage: 50, daysOfWeek: DAILY }], "mg"),
    ).toEqual({ averageDaily: "100mg/day", frequency: "2x daily" });
  });

  it("returns undefined when no schedule has a usable dose", () => {
    expect(summarizeRegimen([{ dosage: NaN, daysOfWeek: [1] }], "mg")).toBeUndefined();
    expect(summarizeRegimen([{ dosage: 5, daysOfWeek: [] }], "mg")).toBeUndefined();
  });
});
