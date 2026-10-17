import { describe, it, expect } from "vitest";
import {
  dailyTotals,
  metricDay,
  overTargetText,
  totalsWindow,
  type TotalsRow,
} from "@intake/core/daily-totals";

const HOUR = 3_600_000;
const BERLIN = "Europe/Berlin";
/** A wall-clock time in Berlin during CEST (UTC+2), September 2026. */
const berlin = (day: number, h: number, m = 0) => Date.UTC(2026, 8, day, h - 2, m);
const water = (timestamp: number, amount: number): TotalsRow => ({ metric: "water", timestamp, amount });

describe("metricDay: where a total sits against its target", () => {
  it.each([
    // value, limit, buffer, status, left, overTarget
    [946, 1000, 500, "ok", 54, 0],
    [1000, 1000, 500, "ok", 0, 0],
    [1200, 1000, 500, "extended", 0, 200],
    [1500, 1000, 500, "extended", 0, 500],
    [1501, 1000, 500, "over", 0, 501],
    [1001, 1000, 0, "over", 0, 1],
    [300, 0, 500, "none", 0, 0],
  ] as const)("%d against %d + %d is %s", (value, limit, buffer, status, left, overTarget) => {
    expect(metricDay(value, { limit, buffer })).toMatchObject({ status, left, overTarget });
  });

  it("a soft target (a minimum) is never over", () => {
    expect(metricDay(5000, { limit: 3500, soft: true })).toMatchObject({ status: "ok", left: 0 });
    expect(metricDay(1000, { limit: 3500, soft: true })).toMatchObject({ status: "ok", left: 2500 });
  });
});

describe("overTargetText: the #309 rule", () => {
  const n = (v: number) => v.toLocaleString("en-US");
  const ml = (v: number) => `${n(v)} ml`;

  it("reads progress into the buffer against the buffer's size, measured from the target", () => {
    // #309: a 1,500 ml target with a 500 ml buffer at 2,501 ml reads
    // 1,001 / 500 (not 501 / 500 against target + buffer).
    expect(overTargetText(metricDay(2501, { limit: 1500, buffer: 500 }), n, " ml")).toBe("1,001 / 500 ml extra");
    // A formatter with the unit on every amount (the Food card).
    expect(overTargetText(metricDay(1700, { limit: 1500, buffer: 500 }), ml)).toBe("200 ml / 500 ml extra");
  });

  it("reads how far over the target with no buffer", () => {
    expect(overTargetText(metricDay(1700, { limit: 1500 }), n, " ml")).toBe("200 ml over");
  });

  it("is empty at or under the target, with no target, and for a soft target", () => {
    expect(overTargetText(metricDay(1500, { limit: 1500, buffer: 500 }), ml)).toBe("");
    expect(overTargetText(metricDay(1500, { limit: 0 }), ml)).toBe("");
    expect(overTargetText(metricDay(5000, { limit: 3500, soft: true }), ml)).toBe("");
  });
});

describe("dailyTotals", () => {
  it("today and the week count the same rows in the repeated hour of a fall-back day", () => {
    // 25 Oct 2026, Berlin, day starts 02:00. 00:30 UTC is 02:30 CEST: the
    // first pass through 02:00-03:00, so it is already today.
    const now = Date.UTC(2026, 9, 25, 10, 0);
    const rows = [water(Date.UTC(2026, 9, 25, 0, 30), 250), water(Date.UTC(2026, 9, 25, 1, 30), 100)];
    const base = { now, tz: BERLIN, dayStartHour: 2, rows };
    const today = dailyTotals(base).metrics.water.today.value;
    const week = dailyTotals({ ...base, weekStartsOn: 1 }).metrics.water.today.value;
    expect(today).toBe(350);
    expect(week).toBe(today);
  });

  const base = { tz: BERLIN, dayStartHour: 2 };

  it("leaves out records dated after now, today and in the rolling 24 hours", () => {
    const now = berlin(24, 18);
    const t = dailyTotals({
      ...base,
      now,
      rows: [water(berlin(24, 9), 400), water(berlin(24, 20), 500), water(now + 5 * 24 * HOUR, 900)],
    });
    expect(t.metrics.water.today.value).toBe(400);
    expect(t.metrics.water.rolling24h).toBe(400);
  });

  it("counts a record at exactly now", () => {
    const now = berlin(24, 18);
    expect(dailyTotals({ ...base, now, rows: [water(now, 250)] }).metrics.water.today.value).toBe(250);
  });

  it("counts the small hours toward the previous logical day", () => {
    // 01:30 Thursday: still Wednesday with a 02:00 day start.
    const now = berlin(24, 1, 30);
    const t = dailyTotals({
      ...base,
      now,
      rows: [water(berlin(23, 20), 300), water(berlin(24, 0, 45), 250), water(berlin(23, 1, 59), 700)],
    });
    expect(t.today).toBe("2026-09-23");
    expect(t.metrics.water.today.value).toBe(550);
    expect(t.dayStart).toBe(berlin(23, 2));
  });

  it("uses the zone it is given, not the host's", () => {
    // 23:30 UTC on the 23rd is 01:30 on the 24th in Berlin.
    const ts = Date.UTC(2026, 8, 23, 23, 30);
    const now = Date.UTC(2026, 8, 24, 10);
    const atZero = (tz: string) =>
      dailyTotals({ now, tz, dayStartHour: 0, rows: [water(ts, 100)] }).metrics.water.today.value;
    expect(atZero(BERLIN)).toBe(100);
    expect(atZero("UTC")).toBe(0);
  });

  it("buckets the logical week starting on the chosen weekday", () => {
    const now = berlin(24, 18); // Thursday
    const rows = [water(berlin(21, 10), 100), water(berlin(23, 12), 1700), water(berlin(20, 12), 900)];
    const monday = dailyTotals({ ...base, now, weekStartsOn: 1, rows });
    expect(monday.dayKeys).toEqual([
      "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24",
      "2026-09-25", "2026-09-26", "2026-09-27",
    ]);
    expect(monday.todayIndex).toBe(3);
    expect(monday.metrics.water.days.map((d) => d.value)).toEqual([100, 0, 1700, 0, 0, 0, 0]);

    const sunday = dailyTotals({ ...base, now, weekStartsOn: 0, rows });
    expect(sunday.dayKeys[0]).toBe("2026-09-20");
    expect(sunday.todayIndex).toBe(4);
    expect(sunday.metrics.water.days.map((d) => d.value)).toEqual([900, 100, 0, 1700, 0, 0, 0]);
  });

  it("measures every day of the week against the target", () => {
    const t = dailyTotals({
      ...base,
      now: berlin(24, 18),
      weekStartsOn: 1,
      rows: [water(berlin(23, 12), 1700), water(berlin(24, 9), 1200)],
      targets: { water: { limit: 1000, buffer: 500 } },
    });
    expect(t.metrics.water.days.map((d) => d.status)).toEqual(["ok", "ok", "over", "extended", "ok", "ok", "ok"]);
    expect(t.metrics.water.today.status).toBe("extended");
    expect(t.metrics.caffeine.today.status).toBe("none");
  });

  it("covers today only without a week start, and reads back far enough for the 24 hours", () => {
    const now = berlin(24, 9);
    const w = totalsWindow(now, BERLIN, 2);
    expect(w.dayKeys).toEqual(["2026-09-24"]);
    expect(w.start).toBe(berlin(24, 2));
    expect(w.end).toBe(berlin(25, 2));
    expect(w.readFrom).toBe(now - 24 * HOUR);
    const t = dailyTotals({ ...base, now, rows: [water(berlin(23, 20), 300), water(berlin(24, 8), 200)] });
    expect(t.metrics.water.today.value).toBe(200);
    expect(t.metrics.water.rolling24h).toBe(500);
  });

  it("keeps a 23-hour DST day whole", () => {
    // Berlin springs forward on 29 Mar 2026: that logical day is 23 hours.
    const now = Date.UTC(2026, 2, 29, 20); // 22:00 CEST
    const w = totalsWindow(now, BERLIN, 0);
    expect(w.end - w.start).toBe(23 * HOUR);
    const t = dailyTotals({ now, tz: BERLIN, dayStartHour: 0, rows: [water(Date.UTC(2026, 2, 29, 1, 30), 100)] });
    expect(t.metrics.water.today.value).toBe(100);
  });
});
