import { describe, it, expect } from "vitest";
import {
  LATE_WINDOW_ALWAYS,
  LATE_WINDOW_NEVER,
  bulkDoseTargets,
  dueInstant,
  isRescheduleWaiting,
  needsTakenTimePrompt,
  reopenedStatus,
  rescheduleWarnings,
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
      skipAll: true, unskipAll: false, takeAll: true, untakeAll: false, reschedule: true,
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
  it("a future day has only Reschedule", () => {
    expect(slotActions(s("pending", "pending"), "future")).toEqual({
      skipAll: false, unskipAll: false, takeAll: false, untakeAll: false, reschedule: true,
    });
  });
  it("Reschedule shows only while a dose is open", () => {
    expect(slotActions(s("taken", "pending"), "today").reschedule).toBe(true);
    expect(slotActions(s("taken", "skipped"), "today").reschedule).toBe(false);
  });
});

describe("rescheduling rules", () => {
  it("dueInstant: remindAt counts only while the dose is rescheduled", () => {
    expect(dueInstant({ status: "rescheduled", remindAt: at(10, 0) }, DUE)).toBe(at(10, 0));
    expect(dueInstant({ status: "taken", remindAt: at(10, 0) }, DUE)).toBe(DUE);
    expect(dueInstant({ status: "pending", remindAt: at(10, 0) }, DUE)).toBe(DUE);
    expect(dueInstant({ status: "rescheduled" }, DUE)).toBe(DUE);
    expect(dueInstant(undefined, DUE)).toBe(DUE);
  });

  it("a dose rescheduled to 10:00 with no action is missed after 10:30, not after 09:00", () => {
    const due = dueInstant({ status: "rescheduled", remindAt: at(10, 0) }, DUE);
    expect(resolveLiveDoseStatus("rescheduled", due, at(9, 1), 30)).toBe("pending");
    expect(resolveLiveDoseStatus("rescheduled", due, at(10, 30), 30)).toBe("pending");
    expect(resolveLiveDoseStatus("rescheduled", due, at(10, 31), 30)).toBe("missed");
  });

  it("reopenedStatus: rescheduled while remindAt is ahead, else pending", () => {
    expect(reopenedStatus(at(10, 0), at(9, 0))).toBe("rescheduled");
    expect(reopenedStatus(at(10, 0), at(10, 0))).toBe("pending");
    expect(reopenedStatus(undefined, at(9, 0))).toBe("pending");
  });

  it("no time limit: now + 1 min, now - 1 hour (warning) and original + 3 days all save", () => {
    const now = at(9, 0);
    expect(rescheduleWarnings(now + 60_000, now)).toEqual([]);
    expect(rescheduleWarnings(now - 3_600_000, now)).toEqual([{ kind: "past" }]);
    expect(rescheduleWarnings(at(8, 30, 3), now)).toEqual([]);
  });

  it("warns at or after the next dose of the same med", () => {
    const now = at(9, 0);
    expect(rescheduleWarnings(at(20, 30), now, at(20, 30))).toEqual([
      { kind: "after-next-dose", nextDoseAt: at(20, 30) },
    ]);
    expect(rescheduleWarnings(at(20, 29), now, at(20, 30))).toEqual([]);
  });

  it("isRescheduleWaiting: until the period after remindAt ends", () => {
    expect(isRescheduleWaiting("rescheduled", at(0, 30, 1), at(0, 40, 1))).toBe(true);
    expect(isRescheduleWaiting("rescheduled", at(0, 30, 1), at(1, 1, 1))).toBe(false);
    expect(isRescheduleWaiting("rescheduled", at(9, 0, 2), at(12, 0))).toBe(true);
    expect(isRescheduleWaiting("pending", at(0, 30, 1), at(0, 40, 1))).toBe(false);
  });

  it("bulk reschedule targets only the open doses", () => {
    const doses = [{ status: "taken" }, { status: "skipped" }, { status: "pending" }, { status: "missed" }];
    expect(bulkDoseTargets(doses, "reschedule").map((d) => d.status)).toEqual(["pending", "missed"]);
  });
});
