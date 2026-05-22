/**
 * Property-based tests for the local↔UTC time conversion in timezone.ts.
 *
 * The existing timezone.test.ts only exercises the cache helper. The
 * functions that matter — localTimeToUTCMinutes / utcMinutesToLocalTime
 * / formatLocalTime / localHHMMStringToUTCMinutes — have no example
 * tests. These functions form the spine of medication scheduling
 * (PhaseSchedule.scheduleTimeUTC is written by buildSchedules using
 * localHHMMStringToUTCMinutes; the schedule UI displays via
 * formatLocalTime), so a regression here silently moves user doses
 * by hours.
 *
 * Paradigm (docs/TESTING_STRATEGY.md §2.3): pure-function invariants
 * are textbook fast-check candidates. The most important is the
 * round-trip identity:
 *
 *     for all (h, m, tz):
 *         utcMinutesToLocalTime(localTimeToUTCMinutes(h, m, tz), tz) ≡ (h, m)
 *
 * Note on DST: getTimezoneOffsetMinutes() uses Date.now() internally,
 * so the offset is stable for any single test run. This file exercises
 * the round-trip identity at a fixed wall-clock moment per test, which
 * is exactly the operational mode the app uses (offset captured at
 * write time, then later read back). A DST-aware property would
 * require a wider arbitrary that includes the timestamp — left for a
 * follow-up.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  localTimeToUTCMinutes,
  utcMinutesToLocalTime,
  formatLocalTime,
  localHHMMStringToUTCMinutes,
} from "@/lib/timezone";

// A handful of IANA zones covering positive, negative, and zero
// offsets, plus a DST zone. fast-check picks uniformly from this set
// per iteration.
const TIMEZONES = [
  "UTC",
  "Europe/Berlin", // +1 / +2 (DST)
  "Africa/Johannesburg", // +2 (no DST)
  "America/New_York", // -5 / -4 (DST)
  "Asia/Tokyo", // +9 (no DST)
  "Pacific/Honolulu", // -10 (no DST)
  "Asia/Kolkata", // +5:30 (half-hour offset — important edge case)
  "Asia/Kathmandu", // +5:45 (quarter-hour offset — even rarer edge)
];

const hour = fc.integer({ min: 0, max: 23 });
const minute = fc.integer({ min: 0, max: 59 });
const tz = fc.constantFrom(...TIMEZONES);
const utcMinutes = fc.integer({ min: 0, max: 1439 });

describe("timezone — round-trip identity (property)", () => {
  it("local → UTC → local recovers the original (h, m) for any timezone", () => {
    fc.assert(
      fc.property(hour, minute, tz, (h, m, zone) => {
        const u = localTimeToUTCMinutes(h, m, zone);
        const back = utcMinutesToLocalTime(u, zone);
        // The expected result is (h, m). On half-hour or quarter-hour
        // offset zones (Kolkata, Kathmandu) the round-trip is still
        // exact in minutes — they only matter for hour conversion
        // arithmetic.
        expect(back).toEqual({ hours: h, minutes: m });
      }),
      { numRuns: 100 },
    );
  });

  it("UTC → local → UTC recovers the original minutes for any timezone", () => {
    fc.assert(
      fc.property(utcMinutes, tz, (u, zone) => {
        const local = utcMinutesToLocalTime(u, zone);
        const back = localTimeToUTCMinutes(local.hours, local.minutes, zone);
        expect(back).toBe(u);
      }),
      { numRuns: 100 },
    );
  });

  it("HHMM string → UTC → HHMM string is identity", () => {
    fc.assert(
      fc.property(hour, minute, tz, (h, m, zone) => {
        const original = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const u = localHHMMStringToUTCMinutes(original, zone);
        const back = formatLocalTime(u, zone);
        expect(back).toBe(original);
      }),
      { numRuns: 100 },
    );
  });
});

describe("timezone — bounded outputs (property)", () => {
  it("localTimeToUTCMinutes always returns a value in [0, 1440)", () => {
    fc.assert(
      fc.property(hour, minute, tz, (h, m, zone) => {
        const u = localTimeToUTCMinutes(h, m, zone);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThan(1440);
      }),
      { numRuns: 80 },
    );
  });

  it("utcMinutesToLocalTime always returns hours in [0, 24) and minutes in [0, 60)", () => {
    fc.assert(
      fc.property(utcMinutes, tz, (u, zone) => {
        const { hours, minutes } = utcMinutesToLocalTime(u, zone);
        expect(hours).toBeGreaterThanOrEqual(0);
        expect(hours).toBeLessThan(24);
        expect(minutes).toBeGreaterThanOrEqual(0);
        expect(minutes).toBeLessThan(60);
      }),
      { numRuns: 80 },
    );
  });

  it("formatLocalTime always returns exactly HH:MM (5 chars, with leading zeros)", () => {
    fc.assert(
      fc.property(utcMinutes, tz, (u, zone) => {
        const s = formatLocalTime(u, zone);
        expect(s).toMatch(/^[0-2]\d:[0-5]\d$/);
        expect(s).toHaveLength(5);
      }),
      { numRuns: 80 },
    );
  });
});

describe("timezone — UTC special case", () => {
  it("with zone='UTC', local minutes equal the input directly", () => {
    fc.assert(
      fc.property(hour, minute, (h, m) => {
        const u = localTimeToUTCMinutes(h, m, "UTC");
        expect(u).toBe(h * 60 + m);
      }),
      { numRuns: 50 },
    );
  });

  it("with zone='UTC', utcMinutesToLocalTime is pure integer division", () => {
    fc.assert(
      fc.property(utcMinutes, (u) => {
        const back = utcMinutesToLocalTime(u, "UTC");
        expect(back).toEqual({
          hours: Math.floor(u / 60),
          minutes: u % 60,
        });
      }),
      { numRuns: 50 },
    );
  });
});
