import { describe, it, expect } from "vitest";
import {
  logicalDayKey,
  logicalDayStart,
  logicalDayRange,
  logicalDaysRange,
  shiftDayKey,
  averagePerLoggedDay,
} from "@intake/core/logical-day";

const HOUR = 3_600_000;

describe("logicalDayKey", () => {
  it("counts a record before dayStartHour on the previous day", () => {
    // 01:30 in Johannesburg (UTC+2) on 20 Sep = 23:30 UTC on 19 Sep.
    const ts = Date.UTC(2026, 8, 19, 23, 30);
    expect(logicalDayKey(ts, 2, "Africa/Johannesburg")).toBe("2026-09-19");
    expect(logicalDayKey(ts, 0, "Africa/Johannesburg")).toBe("2026-09-20");
  });

  it("uses the given zone, not the host zone", () => {
    const ts = Date.UTC(2026, 8, 20, 3, 0); // 23:00 on 19 Sep in New York
    expect(logicalDayKey(ts, 0, "America/New_York")).toBe("2026-09-19");
    expect(logicalDayKey(ts, 0, "UTC")).toBe("2026-09-20");
  });

  it("puts a record exactly at dayStartHour on the new day", () => {
    const ts = Date.UTC(2026, 8, 20, 0, 0); // 02:00 Johannesburg
    expect(logicalDayKey(ts, 2, "Africa/Johannesburg")).toBe("2026-09-20");
    expect(logicalDayKey(ts - 1, 2, "Africa/Johannesburg")).toBe("2026-09-19");
  });
});

describe("logicalDayStart / logicalDayRange", () => {
  it("returns dayStartHour wall-clock in the zone", () => {
    expect(logicalDayStart("2026-09-20", 2, "Africa/Johannesburg")).toBe(
      Date.UTC(2026, 8, 20, 0, 0),
    );
    expect(logicalDayStart("2026-09-20", 0, "America/New_York")).toBe(
      Date.UTC(2026, 8, 20, 4, 0),
    );
  });

  it("spans 23 hours across a spring-forward DST change", () => {
    // Europe/Berlin moves to CEST on 29 Mar 2026.
    const start = logicalDayStart("2026-03-29", 0, "Europe/Berlin");
    const next = logicalDayStart("2026-03-30", 0, "Europe/Berlin");
    expect(next - start).toBe(23 * HOUR);
  });

  it("gives the logical day containing now, ending 1 ms before the next", () => {
    // 01:00 Johannesburg on 21 Sep with dayStartHour 2 is still 20 Sep.
    const now = Date.UTC(2026, 8, 20, 23, 0);
    const r = logicalDayRange(now, 2, "Africa/Johannesburg");
    expect(r.start).toBe(Date.UTC(2026, 8, 20, 0, 0));
    expect(r.end).toBe(Date.UTC(2026, 8, 21, 0, 0) - 1);
  });

  it("covers N whole logical days ending today", () => {
    const now = Date.UTC(2026, 8, 20, 12, 0);
    const r = logicalDaysRange(now, 7, 0, "UTC");
    expect(r.start).toBe(Date.UTC(2026, 8, 14));
    expect(r.end).toBe(Date.UTC(2026, 8, 21) - 1);
  });
});

describe("shiftDayKey", () => {
  it("moves across month and year boundaries", () => {
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("averagePerLoggedDay", () => {
  const tz = "UTC";
  const now = Date.UTC(2026, 8, 20, 9, 0);
  const at = (day: number, hour: number) => Date.UTC(2026, 8, day, hour);

  it("divides by days that have a record, not by the calendar span", () => {
    const points = [
      { timestamp: at(15, 8), value: 1000 },
      { timestamp: at(15, 18), value: 1000 },
      { timestamp: at(17, 8), value: 2000 },
    ];
    const r = averagePerLoggedDay(points, { now, dayStartHour: 0, tz });
    expect(r).toEqual({ total: 4000, days: 2, average: 2000 });
  });

  it("leaves out the incomplete current day", () => {
    const points = [
      { timestamp: at(19, 8), value: 2000 },
      { timestamp: at(20, 8), value: 250 },
    ];
    const r = averagePerLoggedDay(points, { now, dayStartHour: 0, tz });
    expect(r).toEqual({ total: 2000, days: 1, average: 2000 });
  });

  it("falls back to today when today is the only logged day", () => {
    const points = [{ timestamp: at(20, 8), value: 250 }];
    const r = averagePerLoggedDay(points, { now, dayStartHour: 0, tz });
    expect(r).toEqual({ total: 250, days: 1, average: 250 });
  });

  it("returns zeros for no points", () => {
    expect(averagePerLoggedDay([], { now, dayStartHour: 0, tz })).toEqual({
      total: 0,
      days: 0,
      average: 0,
    });
  });
});
