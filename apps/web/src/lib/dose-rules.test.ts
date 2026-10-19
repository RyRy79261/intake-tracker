import { describe, it, expect } from "vitest";
import {
  LATE_WINDOW_ALWAYS,
  LATE_WINDOW_NEVER,
  bulkDoseTargets,
  needsTakenTimePrompt,
  reminderRepeatCount,
  resolveLiveDoseStatus,
  slotActions,
} from "@intake/core/dose-rules";

/** A local instant on 2026-10-19 (or `day` days later). */
const at = (h: number, m: number, day = 0) => new Date(2026, 9, 19 + day, h, m).getTime();
const DUE = at(8, 30);

describe("needsTakenTimePrompt: the late window (default 40 minutes)", () => {
  it.each([
    ["07:30 (early)", at(7, 30), false],
    ["08:30", at(8, 30), false],
    ["09:09", at(9, 9), false],
    ["09:10", at(9, 10), false],
    ["09:10:59", at(9, 10) + 59_000, false],
    ["09:11", at(9, 11), true],
    ["the next day (a past-day dose)", at(8, 0, 1), true],
  ])("an 08:30 dose tapped at %s asks: %s", (_label, now, expected) => {
    expect(needsTakenTimePrompt(DUE, now, 40)).toBe(expected);
  });

  it('"Always ask" asks at 08:31, but never for an early tap', () => {
    expect(needsTakenTimePrompt(DUE, at(8, 31), LATE_WINDOW_ALWAYS)).toBe(true);
    expect(needsTakenTimePrompt(DUE, at(8, 30), LATE_WINDOW_ALWAYS)).toBe(false);
    expect(needsTakenTimePrompt(DUE, at(7, 30), LATE_WINDOW_ALWAYS)).toBe(false);
  });

  it('"Never ask" does not ask at 12:00, nor days later', () => {
    expect(needsTakenTimePrompt(DUE, at(12, 0), LATE_WINDOW_NEVER)).toBe(false);
    expect(needsTakenTimePrompt(DUE, at(12, 0, 3), LATE_WINDOW_NEVER)).toBe(false);
  });

  it("compares instants: a 23:50 dose tapped at 00:20 is inside 40 minutes", () => {
    expect(needsTakenTimePrompt(at(23, 50), at(0, 20, 1), 40)).toBe(false);
    expect(needsTakenTimePrompt(at(23, 50), at(0, 31, 1), 40)).toBe(true);
  });
});

describe("resolveLiveDoseStatus: Missed at the end of the reminder period (default 30)", () => {
  it("an open 08:30 dose is not missed at 09:00 and is missed at 09:01", () => {
    expect(resolveLiveDoseStatus(undefined, DUE, at(9, 0), 30)).toBe("pending");
    expect(resolveLiveDoseStatus(undefined, DUE, at(9, 0) + 59_000, 30)).toBe("pending");
    expect(resolveLiveDoseStatus(undefined, DUE, at(9, 1), 30)).toBe("missed");
    expect(resolveLiveDoseStatus("pending", DUE, at(9, 1), 30)).toBe("missed");
    expect(resolveLiveDoseStatus("rescheduled", DUE, at(9, 1), 30)).toBe("missed");
  });

  it("a taken or skipped dose is never missed", () => {
    expect(resolveLiveDoseStatus("taken", DUE, at(23, 0), 30)).toBe("taken");
    expect(resolveLiveDoseStatus("skipped", DUE, at(8, 0, 2), 30)).toBe("skipped");
  });

  it("follows the reminder period setting", () => {
    expect(resolveLiveDoseStatus(undefined, DUE, at(9, 1), 60)).toBe("pending");
    expect(resolveLiveDoseStatus(undefined, DUE, at(9, 31), 60)).toBe("missed");
  });
});

describe("reminderRepeatCount", () => {
  it("fires every interval through the period, never before the dose", () => {
    expect(reminderRepeatCount(10, 30)).toBe(3); // 08:40, 08:50, 09:00
    expect(reminderRepeatCount(15, 30)).toBe(2); // 08:45, 09:00
    expect(reminderRepeatCount(30, 20)).toBe(0); // only 08:30
  });
});

describe("bulkDoseTargets", () => {
  const doses = [
    { id: 1, status: "taken" },
    { id: 2, status: "skipped" },
    { id: 3, status: "pending" },
    { id: 4, status: "missed" },
  ];
  it("Take all and Skip all change only open doses", () => {
    expect(bulkDoseTargets(doses, "take").map((d) => d.id)).toEqual([3, 4]);
    expect(bulkDoseTargets(doses, "skip").map((d) => d.id)).toEqual([3, 4]);
  });
  it("Untake all changes taken doses, Unskip all skipped ones", () => {
    expect(bulkDoseTargets(doses, "untake").map((d) => d.id)).toEqual([1]);
    expect(bulkDoseTargets(doses, "unskip").map((d) => d.id)).toEqual([2]);
  });
});

describe("slotActions: the button table of section 4.4", () => {
  const s = (...statuses: string[]) => statuses.map((status) => ({ status }));

  it("all open, today", () => {
    expect(slotActions(s("pending", "missed"), "today")).toEqual({
      skipAll: true, unskipAll: false, takeAll: true, untakeAll: false, reschedule: false,
    });
  });
  it("some taken, some open: Untake all is a text button above the bar", () => {
    expect(slotActions(s("taken", "pending"), "today")).toMatchObject({
      skipAll: true, takeAll: true, untakeAll: "secondary",
    });
  });
  it("all taken: Untake all takes the place of Take all", () => {
    expect(slotActions(s("taken", "taken"), "past")).toEqual({
      skipAll: false, unskipAll: false, takeAll: false, untakeAll: "primary", reschedule: false,
    });
  });
  it("all skipped: Unskip all in place of Skip all", () => {
    expect(slotActions(s("skipped", "skipped"), "today")).toEqual({
      skipAll: false, unskipAll: true, takeAll: false, untakeAll: false, reschedule: false,
    });
  });
  it("taken and skipped, none open: Unskip all and Untake all", () => {
    expect(slotActions(s("skipped", "taken"), "today")).toMatchObject({
      unskipAll: true, untakeAll: "primary", takeAll: false, skipAll: false,
    });
  });
  it("a future day has no take or skip, and Reschedule waits for PR 2", () => {
    expect(slotActions(s("pending", "pending"), "future")).toEqual({
      skipAll: false, unskipAll: false, takeAll: false, untakeAll: false, reschedule: false,
    });
    expect(slotActions(s("pending"), "future", { allowReschedule: true }).reschedule).toBe(true);
  });
});
