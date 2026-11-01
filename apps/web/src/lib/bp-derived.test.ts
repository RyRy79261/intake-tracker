import { describe, it, expect } from "vitest";
import {
  dailyDerivedBloodPressure,
  deriveBloodPressure,
  meanArterialPressure,
  proportionalPulsePressure,
  pulsePressure,
} from "@intake/core/bp-derived";

describe("derived blood pressure", () => {
  it("computes pulse pressure, PPP and calculated MAP", () => {
    expect(pulsePressure(120, 80)).toBe(40);
    expect(proportionalPulsePressure(120, 80)).toBeCloseTo(1 / 3);
    expect(meanArterialPressure(120, 80)).toBeCloseTo(93.333, 2);
    expect(deriveBloodPressure(110, 75)).toEqual({
      pulsePressure: 35,
      proportionalPulsePressure: 35 / 110,
      meanArterialPressure: 75 + 35 / 3,
    });
  });

  it("does not divide by a zero systolic", () => {
    expect(proportionalPulsePressure(0, 0)).toBe(0);
  });

  it("averages per logical day, oldest first, honouring the day start hour", () => {
    const tz = "Europe/Berlin";
    // 2026-10-30 08:00 and 20:00 Berlin (CET, UTC+1), then 2026-10-31 03:00,
    // which is before a 04:00 day start and so still belongs to the 30th.
    const at = (iso: string) => Date.parse(iso);
    const rows = dailyDerivedBloodPressure(
      [
        { systolic: 120, diastolic: 80, timestamp: at("2026-10-31T09:00:00+01:00") },
        { systolic: 110, diastolic: 70, timestamp: at("2026-10-30T08:00:00+01:00") },
        { systolic: 100, diastolic: 70, timestamp: at("2026-10-30T20:00:00+01:00") },
        { systolic: 130, diastolic: 90, timestamp: at("2026-10-31T03:00:00+01:00") },
      ],
      { dayStartHour: 4, tz },
    );
    expect(rows.map((r) => [r.day, r.count])).toEqual([
      ["2026-10-30", 3],
      ["2026-10-31", 1],
    ]);
    expect(rows[0]!.pulsePressure).toBeCloseTo((40 + 30 + 40) / 3);
    expect(rows[1]!.meanArterialPressure).toBeCloseTo(80 + 40 / 3);
  });

  it("returns no rows for no readings", () => {
    expect(dailyDerivedBloodPressure([], { dayStartHour: 2, tz: "UTC" })).toEqual([]);
  });
});
