import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getCurrentDateTimeLocal,
  timestampToDateTimeLocal,
  dateTimeLocalToTimestamp,
  parseDateTimeLocal,
  formatTimeOnly,
  formatDateTime,
  formatClockTime,
  DEFAULT_WEEK_STARTS_ON,
  normalizeWeekStartsOn,
  weekDayOrder,
  sortDaysForDisplay,
} from "@/lib/date-utils";
import { useSettingsStore } from "@/stores/settings-store";

describe("date-utils", () => {
  describe("week order", () => {
    it("defaults the week to starting on Monday", () => {
      expect(DEFAULT_WEEK_STARTS_ON).toBe(1);
      expect(weekDayOrder(DEFAULT_WEEK_STARTS_ON)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    });

    it("orders the week from any first day", () => {
      expect(weekDayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(weekDayOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
    });

    it("sorts Sunday-indexed days from the chosen first day", () => {
      expect(sortDaysForDisplay([0, 3, 1], 1)).toEqual([1, 3, 0]);
      expect(sortDaysForDisplay([6, 0], 1)).toEqual([6, 0]);
      expect(sortDaysForDisplay([6, 0, 3], 0)).toEqual([0, 3, 6]);
      expect(sortDaysForDisplay([1, 0, 6], 6)).toEqual([6, 0, 1]);
    });

    it("reads anything but a whole weekday 0-6 as the default", () => {
      expect(normalizeWeekStartsOn(0)).toBe(0);
      expect(normalizeWeekStartsOn(6)).toBe(6);
      for (const bad of [7, -1, 1.5, NaN, "0", null, undefined]) {
        expect(normalizeWeekStartsOn(bad)).toBe(1);
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  describe("dateTimeLocalToTimestamp", () => {
    it("parses a valid datetime-local string into a timestamp", () => {
      // new Date("YYYY-MM-DDTHH:mm") is interpreted in local time.
      const value = "2024-01-15T14:30";
      const expected = new Date(2024, 0, 15, 14, 30).getTime();
      expect(dateTimeLocalToTimestamp(value)).toBe(expected);
    });

    it.each(["", "not-a-date", "garbage", "2024-13-99T99:99"])(
      "throws with the documented message for invalid input %j",
      (bad) => {
        expect(() => dateTimeLocalToTimestamp(bad)).toThrow(
          `Invalid date value: "${bad}"`,
        );
      },
    );
  });

  describe("parseDateTimeLocal", () => {
    it("returns the timestamp for a valid value", () => {
      expect(parseDateTimeLocal("2024-01-15T14:30")).toBe(
        new Date(2024, 0, 15, 14, 30).getTime(),
      );
    });

    it.each(["", "not-a-date", "2024-13-99T99:99"])(
      "returns null instead of throwing for %j",
      (bad) => {
        expect(parseDateTimeLocal(bad)).toBeNull();
      },
    );
  });

  describe("timestampToDateTimeLocal", () => {
    it("renders a timestamp as a YYYY-MM-DDTHH:mm string (16 chars)", () => {
      const ts = new Date(2024, 5, 1, 9, 5).getTime();
      const out = timestampToDateTimeLocal(ts);
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(out).toHaveLength(16);
    });
  });

  describe("round-trip", () => {
    it("dateTimeLocalToTimestamp(timestampToDateTimeLocal(t)) equals t truncated to the minute", () => {
      // Fixed timestamp with non-zero seconds/ms to prove truncation.
      const t = new Date(2024, 2, 9, 13, 47, 33, 512).getTime();
      const truncatedToMinute = t - (t % 60000);
      const roundTripped = dateTimeLocalToTimestamp(timestampToDateTimeLocal(t));
      expect(roundTripped).toBe(truncatedToMinute);
    });
  });

  describe("getCurrentDateTimeLocal", () => {
    it("reflects the (pinned) current time as a minute-precision local string", () => {
      vi.useFakeTimers();
      const fixed = new Date(2024, 7, 20, 16, 42, 10);
      vi.setSystemTime(fixed);
      const out = getCurrentDateTimeLocal();
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      // Round-trips back to the same minute regardless of host timezone.
      const back = dateTimeLocalToTimestamp(out);
      expect(back).toBe(fixed.getTime() - (fixed.getTime() % 60000));
    });
  });

  describe("formatTimeOnly", () => {
    it("formats a timestamp as 12-hour time with AM/PM", () => {
      // Build the timestamp from local components so the formatted local
      // time is deterministic regardless of host timezone.
      const ts = new Date(2024, 0, 1, 14, 30).getTime();
      expect(formatTimeOnly(ts, "12h")).toBe("2:30 PM");
    });

    it("formats a timestamp as 24-hour time, with midnight as 00", () => {
      expect(formatTimeOnly(new Date(2024, 0, 1, 14, 30).getTime(), "24h")).toBe("14:30");
      expect(formatTimeOnly(new Date(2024, 0, 1, 0, 5).getTime(), "24h")).toBe("00:05");
    });

    it("follows the Time Format setting by default", () => {
      const ts = new Date(2024, 0, 1, 14, 30).getTime();
      useSettingsStore.setState({ timeFormat: "12h" });
      expect(formatTimeOnly(ts)).toBe("2:30 PM");
      useSettingsStore.setState({ timeFormat: "24h" });
      expect(formatTimeOnly(ts)).toBe("14:30");
    });
  });

  describe("formatDateTime", () => {
    it("formats a timestamp with abbreviated month, day, and 12-hour time", () => {
      const ts = new Date(2024, 0, 15, 14, 30).getTime();
      expect(formatDateTime(ts, "12h")).toBe("Jan 15, 2:30 PM");
    });

    it("follows the Time Format setting by default", () => {
      const ts = new Date(2024, 0, 15, 14, 30).getTime();
      useSettingsStore.setState({ timeFormat: "24h" });
      expect(formatDateTime(ts)).toBe("Jan 15, 14:30");
    });
  });

  describe("formatClockTime", () => {
    it("renders a schedule's HH:mm in the chosen format", () => {
      expect(formatClockTime("08:00", "24h")).toBe("08:00");
      expect(formatClockTime("14:05", "12h")).toBe("2:05 PM");
      expect(formatClockTime("00:30", "12h")).toBe("12:30 AM");
    });
  });
});
