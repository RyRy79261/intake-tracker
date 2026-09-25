/**
 * DST tests for the wall-clock schedule resolver (doses-titration-schedule#7).
 *
 * `PhaseSchedule.time` in `anchorTimezone` is the canonical dose time. The
 * cached `scheduleTimeUTC` bakes in the offset of the day it was written, so
 * decoding it after a DST change moves the dose by an hour. Europe/Berlin
 * shifts on 2026-10-25 (CEST -> CET) and 2027-03-28 (CET -> CEST).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  formatLocalTime,
  getTimezoneOffsetAt,
  localHHMMStringToUTCMinutes,
  resolveScheduleLocalTime,
  zonedWallClockToInstant,
} from "@/lib/timezone";

const BERLIN = "Europe/Berlin";

afterEach(() => {
  vi.useRealTimers();
});

describe("getTimezoneOffsetAt", () => {
  it("returns the offset in force at the given instant, not today's", () => {
    expect(getTimezoneOffsetAt(Date.UTC(2026, 6, 15, 12), BERLIN)).toBe(120);
    expect(getTimezoneOffsetAt(Date.UTC(2026, 10, 2, 12), BERLIN)).toBe(60);
    expect(getTimezoneOffsetAt(Date.UTC(2026, 10, 2, 12), "America/New_York")).toBe(-300);
    expect(getTimezoneOffsetAt(Date.UTC(2026, 10, 2, 12), "Asia/Kathmandu")).toBe(345);
  });
});

describe("zonedWallClockToInstant", () => {
  it("uses the offset of the requested date on each side of a DST change", () => {
    expect(zonedWallClockToInstant("2026-10-24", "08:30", BERLIN)).toBe(
      Date.UTC(2026, 9, 24, 6, 30),
    );
    expect(zonedWallClockToInstant("2026-10-26", "08:30", BERLIN)).toBe(
      Date.UTC(2026, 9, 26, 7, 30),
    );
  });

  it("moves a time in the spring-forward gap forward by the gap", () => {
    const instant = zonedWallClockToInstant("2027-03-28", "02:30", BERLIN);
    expect(instant).toBe(Date.UTC(2027, 2, 28, 1, 30)); // 03:30 CEST
  });

  it("returns null for a malformed time or date", () => {
    expect(zonedWallClockToInstant("2026-10-26", "8h30", BERLIN)).toBeNull();
    expect(zonedWallClockToInstant("not-a-date", "08:30", BERLIN)).toBeNull();
  });
});

describe("resolveScheduleLocalTime across Berlin DST", () => {
  // Written in summer: the cache holds 06:30 UTC.
  const schedule = {
    time: "08:30",
    anchorTimezone: BERLIN,
    scheduleTimeUTC: 390,
  };

  it("keeps an 08:30 Berlin dose at 08:30 across 2026-10-25 and 2027-03-28", () => {
    for (const now of ["2026-09-25T10:00:00Z", "2026-11-02T10:00:00Z", "2027-04-02T10:00:00Z"]) {
      vi.useFakeTimers({ now: new Date(now) });
      for (const day of ["2026-10-24", "2026-10-25", "2026-10-26", "2027-03-27", "2027-03-28", "2027-03-29"]) {
        expect(resolveScheduleLocalTime(schedule, day, BERLIN)).toBe("08:30");
      }
      vi.useRealTimers();
    }
  });

  it("reproduces the old drift when the UTC cache is decoded instead", () => {
    // Guard that the cache really is stale in winter; the resolver must not use it.
    vi.useFakeTimers({ now: new Date("2026-11-02T10:00:00Z") });
    expect(formatLocalTime(schedule.scheduleTimeUTC, BERLIN)).toBe("07:30");
    expect(resolveScheduleLocalTime(schedule, "2026-11-02", BERLIN)).toBe("08:30");
  });

  it("shows the device-local equivalent on a device in another zone, per date", () => {
    // New York leaves DST a week after Berlin, so the gap is 5h then 6h.
    expect(resolveScheduleLocalTime(schedule, "2026-10-20", "America/New_York")).toBe("02:30");
    expect(resolveScheduleLocalTime(schedule, "2026-10-27", "America/New_York")).toBe("03:30");
    expect(resolveScheduleLocalTime(schedule, "2026-11-02", "America/New_York")).toBe("02:30");
  });

  it("round-trips a schedule written in winter and read in summer", () => {
    vi.useFakeTimers({ now: new Date("2026-01-15T10:00:00Z") });
    const winter = {
      time: "08:00",
      anchorTimezone: BERLIN,
      scheduleTimeUTC: localHHMMStringToUTCMinutes("08:00", BERLIN),
    };
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    expect(resolveScheduleLocalTime(winter, "2026-07-15", BERLIN)).toBe("08:00");
  });

  it("falls back to the UTC cache when time is unusable", () => {
    const legacy = { time: "", anchorTimezone: "UTC", scheduleTimeUTC: 480 };
    expect(resolveScheduleLocalTime(legacy, "2026-10-26", "UTC")).toBe("08:00");
  });

  it("shows the stored wall clock when the anchor zone is unknown", () => {
    const bad = { time: "08:30", anchorTimezone: "Mars/Olympus", scheduleTimeUTC: 390 };
    expect(resolveScheduleLocalTime(bad, "2026-10-26", BERLIN)).toBe("08:30");
  });
});
