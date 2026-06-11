import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getCurrentDateTimeLocal,
  timestampToDateTimeLocal,
  dateTimeLocalToTimestamp,
  formatTimeOnly,
  formatDateTime,
} from "@/lib/date-utils";

describe("date-utils", () => {
  afterEach(() => {
    vi.useRealTimers();
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
      expect(formatTimeOnly(ts)).toBe("2:30 PM");
    });
  });

  describe("formatDateTime", () => {
    it("formats a timestamp with abbreviated month, day, and 12-hour time", () => {
      const ts = new Date(2024, 0, 15, 14, 30).getTime();
      expect(formatDateTime(ts)).toBe("Jan 15, 2:30 PM");
    });
  });
});
