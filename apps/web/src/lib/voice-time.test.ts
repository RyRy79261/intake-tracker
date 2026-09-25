import { describe, it, expect } from "vitest";
import {
  resolveSpokenTime,
  normalizeSpokenTiming,
  isEarlierLogicalDay,
} from "@/lib/voice-time";

/** Local wall-clock timestamp on 2026-09-26 (month is 0-based). */
function at(hours: number, minutes = 0, day = 26): number {
  return new Date(2026, 8, day, hours, minutes).getTime();
}

describe("resolveSpokenTime", () => {
  it("places an earlier clock time on the same day", () => {
    // Dictated at 21:00: "lunch at 1pm".
    expect(resolveSpokenTime("13:00", at(21), 2)).toBe(at(13));
  });

  it("never resolves to the future — a later clock time is yesterday's", () => {
    // Dictated at 12:30: "a beer at 9" can only mean last night.
    expect(resolveSpokenTime("21:00", at(12, 30), 2)).toBe(at(21, 0, 25));
  });

  it("keeps a late-evening time in the same logical day after midnight", () => {
    // 01:00 with a 2am day start is still "yesterday's" logical day, so
    // "at 11pm" is 23:00 on the calendar day before.
    expect(resolveSpokenTime("23:00", at(1), 2)).toBe(at(23, 0, 25));
  });

  it("returns the save time for a malformed value", () => {
    expect(resolveSpokenTime("1pm", at(21), 2)).toBe(at(21));
  });
});

describe("normalizeSpokenTiming", () => {
  it("turns a relative offset into a clock time", () => {
    const item = normalizeSpokenTiming({ kind: "water", ml: 250, minutesAgo: 90 }, at(21));
    expect(item).toEqual({ kind: "water", ml: 250, time: "19:30" });
  });

  it("keeps an explicit clock time over a relative offset", () => {
    const item = normalizeSpokenTiming(
      { kind: "water", ml: 250, time: "08:00", minutesAgo: 90 },
      at(21),
    );
    expect(item).toEqual({ kind: "water", ml: 250, time: "08:00" });
  });

  it("leaves an item with no timing untouched", () => {
    const item = { kind: "weight" as const, weightKg: 80 };
    expect(normalizeSpokenTiming(item, at(21))).toEqual(item);
  });
});

describe("isEarlierLogicalDay", () => {
  it("is true for a time before the current day's start", () => {
    expect(isEarlierLogicalDay(at(21, 0, 25), at(12), 2)).toBe(true);
  });

  it("is false for a time within the current logical day", () => {
    expect(isEarlierLogicalDay(at(3), at(12), 2)).toBe(false);
  });
});
