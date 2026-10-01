import { describe, it, expect } from "vitest";
import { logicalDayKey } from "@intake/core/logical-day";
import {
  clientNowForParse,
  describeSpokenTime,
  formatLocalDateTime,
  isLongAgo,
  normalizeSpokenTiming,
  parseLocalDateTime,
  resolveSpokenWhen,
  spokenTimeError,
  spokenTimestamp,
} from "@/lib/voice-time";
import type { VoiceParsedItem } from "@/lib/voice-types";

// Every instant is written as UTC and every zone is passed in, so these hold
// whatever TZ the suite runs in (CI runs Europe/Berlin and Africa/Johannesburg).
const JHB = "Africa/Johannesburg"; // UTC+2, no DST
const BERLIN = "Europe/Berlin"; // UTC+1 / UTC+2 (DST)

/** 2026-09-30 14:00 in Johannesburg. */
const NOW_JHB = Date.UTC(2026, 8, 30, 12, 0);

describe("clientNowForParse", () => {
  it("describes the device clock for the parse request", () => {
    expect(clientNowForParse(NOW_JHB, JHB)).toEqual({
      localDateTime: "2026-09-30T14:00",
      timeZone: JHB,
      utcOffsetMinutes: 120,
    });
  });

  it("uses the offset in force at that moment in a DST zone", () => {
    // Berlin: CEST (+120) in July, CET (+60) in January.
    expect(clientNowForParse(Date.UTC(2026, 6, 1, 10, 0), BERLIN)).toEqual({
      localDateTime: "2026-07-01T12:00",
      timeZone: BERLIN,
      utcOffsetMinutes: 120,
    });
    expect(clientNowForParse(Date.UTC(2026, 0, 15, 10, 0), BERLIN)).toEqual({
      localDateTime: "2026-01-15T11:00",
      timeZone: BERLIN,
      utcOffsetMinutes: 60,
    });
  });
});

describe("the owner's sentence", () => {
  // "I had a beer yesterday evening at 8pm, a bagel right now and 100mls of
  // water an hour ago", said at 2026-09-30 14:00 in Johannesburg.
  const parsed: VoiceParsedItem[] = [
    {
      kind: "alcohol",
      description: "beer",
      abvPercent: 5,
      volumeMl: 330,
      when: { kind: "absolute", localDateTime: "2026-09-29T20:00" },
    },
    { kind: "food", description: "bagel" },
    { kind: "water", ml: 100, when: { kind: "relative", minutesAgo: 60 } },
  ];
  const [beer, bagel, water] = parsed.map((item) => normalizeSpokenTiming(item, NOW_JHB, JHB));

  it("puts the beer at 20:00 yesterday, local", () => {
    expect(beer).not.toHaveProperty("when");
    expect(beer!.at).toBe("2026-09-29T20:00");
    // 20:00 in Johannesburg is 18:00 UTC.
    expect(spokenTimestamp(beer!, NOW_JHB, JHB)).toBe(Date.UTC(2026, 8, 29, 18, 0));
  });

  it("leaves the bagel at now", () => {
    expect(bagel).not.toHaveProperty("at");
    expect(spokenTimestamp(bagel!, NOW_JHB, JHB)).toBe(NOW_JHB);
  });

  it("puts the water at 13:00", () => {
    expect(water).not.toHaveProperty("when");
    expect(water!.at).toBe("2026-09-30T13:00");
    expect(spokenTimestamp(water!, NOW_JHB, JHB)).toBe(Date.UTC(2026, 8, 30, 11, 0));
  });

  it("counts the beer toward yesterday and the rest toward today", () => {
    const day = (item: VoiceParsedItem) =>
      logicalDayKey(spokenTimestamp(item, NOW_JHB, JHB), 2, JHB);
    expect(day(beer!)).toBe("2026-09-29");
    expect(day(bagel!)).toBe("2026-09-30");
    expect(day(water!)).toBe("2026-09-30");
  });

  it("names each time for the review row", () => {
    expect(describeSpokenTime(beer!.at!, NOW_JHB, JHB)).toBe("Yesterday 20:00");
    expect(describeSpokenTime(water!.at!, NOW_JHB, JHB)).toBe("Today 13:00");
  });
});

describe("resolveSpokenWhen", () => {
  it("is undefined (now) when no time was said", () => {
    expect(resolveSpokenWhen(undefined, NOW_JHB, JHB)).toBeUndefined();
    expect(resolveSpokenWhen(null, NOW_JHB, JHB)).toBeUndefined();
  });

  it("counts a relative time back across midnight", () => {
    // 15 hours before 14:00 is 23:00 the day before.
    expect(resolveSpokenWhen({ kind: "relative", minutesAgo: 900 }, NOW_JHB, JHB)).toBe(
      "2026-09-29T23:00",
    );
  });

  it("clamps a future time to now", () => {
    expect(
      resolveSpokenWhen({ kind: "absolute", localDateTime: "2026-09-30T21:00" }, NOW_JHB, JHB),
    ).toBeUndefined();
    expect(resolveSpokenWhen({ kind: "relative", minutesAgo: -30 }, NOW_JHB, JHB)).toBeUndefined();
  });

  it("treats the current minute and zero minutes ago as now", () => {
    expect(
      resolveSpokenWhen({ kind: "absolute", localDateTime: "2026-09-30T14:00" }, NOW_JHB + 20_000, JHB),
    ).toBeUndefined();
    expect(resolveSpokenWhen({ kind: "relative", minutesAgo: 0 }, NOW_JHB, JHB)).toBeUndefined();
  });

  it("drops a string that is not a real date-time", () => {
    for (const localDateTime of ["8pm", "2026-09-29", "2026-02-30T10:00", "2026-09-29T25:00", ""]) {
      expect(
        resolveSpokenWhen({ kind: "absolute", localDateTime }, NOW_JHB, JHB),
      ).toBeUndefined();
    }
    expect(
      resolveSpokenWhen({ kind: "relative", minutesAgo: Number.NaN }, NOW_JHB, JHB),
    ).toBeUndefined();
  });

  it("keeps a time from more than a week back, which the row then flags", () => {
    const at = resolveSpokenWhen(
      { kind: "absolute", localDateTime: "2026-09-20T09:00" },
      NOW_JHB,
      JHB,
    );
    expect(at).toBe("2026-09-20T09:00");
    expect(isLongAgo(at, NOW_JHB, JHB)).toBe(true);
    expect(isLongAgo("2026-09-24T09:00", NOW_JHB, JHB)).toBe(false);
    expect(isLongAgo(undefined, NOW_JHB, JHB)).toBe(false);
  });
});

describe("a DST zone (Europe/Berlin)", () => {
  it("uses the offset of the day the time falls on, not today's", () => {
    // Monday 2026-10-26 10:00 CET (+1), the day after clocks went back.
    // "Saturday at 8pm" was still CEST (+2): 18:00 UTC, not 19:00.
    const now = Date.UTC(2026, 9, 26, 9, 0);
    const at = resolveSpokenWhen(
      { kind: "absolute", localDateTime: "2026-10-24T20:00" },
      now,
      BERLIN,
    );
    expect(at).toBe("2026-10-24T20:00");
    expect(spokenTimestamp({ at: at! }, now, BERLIN)).toBe(Date.UTC(2026, 9, 24, 18, 0));
  });

  it("counts real minutes across the clock change for a relative time", () => {
    // Sunday 2026-10-25 04:00 CET, after the 02:00-03:00 hour ran twice.
    // Four real hours earlier the clock read 01:00 (CEST), not 00:00.
    const now = Date.UTC(2026, 9, 25, 3, 0);
    expect(formatLocalDateTime(now, BERLIN)).toBe("2026-10-25T04:00");
    expect(resolveSpokenWhen({ kind: "relative", minutesAgo: 240 }, now, BERLIN)).toBe(
      "2026-10-25T01:00",
    );
  });

  it("moves a time in the spring-forward gap to the hour that exists", () => {
    // 02:30 on 2026-03-29 does not exist in Berlin; it reads 03:30 CEST.
    const now = Date.UTC(2026, 2, 29, 12, 0);
    expect(
      resolveSpokenWhen({ kind: "absolute", localDateTime: "2026-03-29T02:30" }, now, BERLIN),
    ).toBe("2026-03-29T03:30");
  });

  it("buckets by the day-start hour on the local wall clock", () => {
    const now = Date.UTC(2026, 6, 15, 12, 0); // 14:00 CEST
    const day = (at: string, dayStartHour: number) =>
      logicalDayKey(spokenTimestamp({ at }, now, BERLIN), dayStartHour, BERLIN);
    // A nightcap at 01:30 belongs to the evening before with a 2am day start…
    expect(day("2026-07-15T01:30", 2)).toBe("2026-07-14");
    // …and to its own date once the day starts at midnight.
    expect(day("2026-07-15T01:30", 0)).toBe("2026-07-15");
    expect(day("2026-07-15T02:00", 2)).toBe("2026-07-15");
    expect(day("2026-07-14T20:00", 2)).toBe("2026-07-14");
  });
});

describe("parseLocalDateTime / formatLocalDateTime", () => {
  it("round-trips a wall-clock time in either zone", () => {
    for (const tz of [JHB, BERLIN]) {
      const ts = parseLocalDateTime("2026-09-29T20:00", tz);
      expect(ts).not.toBeNull();
      expect(formatLocalDateTime(ts!, tz)).toBe("2026-09-29T20:00");
    }
  });

  it("returns null for anything that is not YYYY-MM-DDTHH:mm", () => {
    expect(parseLocalDateTime("2026-09-29 20:00", JHB)).toBeNull();
    expect(parseLocalDateTime("2026-13-01T10:00", JHB)).toBeNull();
    expect(parseLocalDateTime("20:00", JHB)).toBeNull();
  });
});

describe("spokenTimestamp", () => {
  it("saves a time that has become invalid or future as now", () => {
    expect(spokenTimestamp({ at: "not a time" }, NOW_JHB, JHB)).toBe(NOW_JHB);
    expect(spokenTimestamp({ at: "2026-10-01T09:00" }, NOW_JHB, JHB)).toBe(NOW_JHB);
  });
});

describe("spokenTimeError", () => {
  it("accepts no time, and a past time", () => {
    expect(spokenTimeError(undefined, NOW_JHB, JHB)).toBeNull();
    expect(spokenTimeError("2026-09-29T20:00", NOW_JHB, JHB)).toBeNull();
    expect(spokenTimeError("2026-09-30T14:00", NOW_JHB + 5_000, JHB)).toBeNull();
  });

  it("refuses a future or malformed time", () => {
    expect(spokenTimeError("2026-09-30T14:01", NOW_JHB, JHB)).toMatch(/future/);
    expect(spokenTimeError("25:00", NOW_JHB, JHB)).toMatch(/valid/);
  });
});

describe("describeSpokenTime", () => {
  it("names today, yesterday, and older days", () => {
    expect(describeSpokenTime("2026-09-30T08:00", NOW_JHB, JHB)).toBe("Today 08:00");
    expect(describeSpokenTime("2026-09-29T19:00", NOW_JHB, JHB)).toBe("Yesterday 19:00");
    expect(describeSpokenTime("2026-09-28T20:00", NOW_JHB, JHB)).toBe("Mon 28 Sep 20:00");
    expect(describeSpokenTime("2025-12-31T23:30", NOW_JHB, JHB)).toBe("Wed 31 Dec 2025 23:30");
  });

  it("takes 'today' from the zone's calendar, not UTC's", () => {
    // 00:30 on 1 October in Johannesburg is still 30 September in UTC.
    const now = Date.UTC(2026, 8, 30, 22, 30);
    expect(describeSpokenTime("2026-09-30T23:00", now, JHB)).toBe("Yesterday 23:00");
  });
});
