import { describe, it, expect } from "vitest";
import {
  addDaysToKey,
  isEmptyPlan,
  isNewestRegimen,
  pendingChangeDays,
  planPendingMove,
  planScheduleChange,
  type PendingMoveInput,
  scheduleInEffectOn,
  type PlannedRow,
  type ScheduleChangeInput,
} from "@intake/core/schedule-window";
import { selectEffectivePhases } from "@intake/core/effective-phase";

const ALL = [0, 1, 2, 3, 4, 5, 6];
const row = (id: string, time: string, extra: Partial<PlannedRow> = {}): PlannedRow => ({
  id,
  time,
  dosage: 5,
  daysOfWeek: ALL,
  enabled: true,
  start: "2026-01-01",
  ...extra,
});
const plan = (input: Partial<ScheduleChangeInput> & Pick<ScheduleChangeInput, "rows" | "desired">) =>
  planScheduleChange({ applyFrom: "2026-10-20", loggedDates: new Map(), rule: "start-next-day", ...input });

describe("scheduleInEffectOn", () => {
  it("from is inclusive, to is exclusive", () => {
    const s = { effectiveFrom: "2026-10-20", effectiveTo: "2026-10-23" };
    expect(scheduleInEffectOn(s, "2026-10-19")).toBe(false);
    expect(scheduleInEffectOn(s, "2026-10-20")).toBe(true);
    expect(scheduleInEffectOn(s, "2026-10-22")).toBe(true);
    expect(scheduleInEffectOn(s, "2026-10-23")).toBe(false);
  });

  it("a row with no window (written before Apply from) is in effect every day", () => {
    expect(scheduleInEffectOn({}, "1999-01-01")).toBe(true);
    expect(scheduleInEffectOn({ effectiveFrom: null, effectiveTo: null }, "2099-01-01")).toBe(true);
  });

  it("selectEffectivePhases keeps only the rows of the date when given one", () => {
    const phases = [{ id: "ph", prescriptionId: "rx", type: "maintenance", status: "active" }];
    const schedules = [
      { id: "old", phaseId: "ph", enabled: true, effectiveTo: "2026-10-22" },
      { id: "new", phaseId: "ph", enabled: true, effectiveFrom: "2026-10-22" },
    ];
    const ids = (onDate?: string) =>
      selectEffectivePhases(phases, schedules, onDate ? { onDate } : {})[0]!.schedules.map((s) => s.id);
    expect(ids()).toEqual(["old", "new"]);
    expect(ids("2026-10-21")).toEqual(["old"]);
    expect(ids("2026-10-22")).toEqual(["new"]);
  });
});

describe("addDaysToKey", () => {
  it("crosses month and year ends", () => {
    expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("planScheduleChange", () => {
  it("writes nothing when nothing changed", () => {
    const p = plan({ rows: [row("a", "08:30")], desired: [{ id: "a", time: "08:30", dosage: 5, daysOfWeek: ALL }] });
    expect(isEmptyPlan(p)).toBe(true);
  });

  it("closes a changed row at the change day and starts a new row there", () => {
    const p = plan({ rows: [row("a", "08:30")], desired: [{ id: "a", time: "09:00", dosage: 10, daysOfWeek: ALL }] });
    expect(p.patches).toEqual([{ id: "a", changes: { effectiveTo: "2026-10-20" } }]);
    expect(p.inserts).toEqual([
      { content: { time: "09:00", dosage: 10, daysOfWeek: ALL }, effectiveFrom: "2026-10-20", replaces: "a" },
    ]);
    expect(p.tombstones).toEqual([]);
  });

  it("keeps an unchanged row and only changes the other", () => {
    const p = plan({
      rows: [row("am", "08:30"), row("pm", "20:00")],
      desired: [
        { id: "am", time: "08:30", dosage: 5, daysOfWeek: ALL },
        { id: "pm", time: "21:00", dosage: 5, daysOfWeek: ALL },
      ],
    });
    expect(p.patches).toEqual([{ id: "pm", changes: { effectiveTo: "2026-10-20" } }]);
    expect(p.inserts.map((i) => i.content.time)).toEqual(["21:00"]);
  });

  it("edits a row in place when it never applied before the change day", () => {
    const p = plan({
      rows: [row("a", "08:30", { start: "2026-10-20" })],
      desired: [{ id: "a", time: "09:00", dosage: 5, daysOfWeek: ALL }],
    });
    expect(p.patches).toEqual([{ id: "a", changes: { time: "09:00", dosage: 5, daysOfWeek: ALL } }]);
    expect(p.inserts).toEqual([]);
  });

  it("closes a removed row that ran before, and drops one that never ran", () => {
    const p = plan({
      rows: [row("old", "08:30"), row("fresh", "20:00", { start: "2026-10-20" })],
      desired: [],
    });
    expect(p.patches).toEqual([{ id: "old", changes: { effectiveTo: "2026-10-20" } }]);
    expect(p.tombstones).toEqual(["fresh"]);
  });

  it("a future Apply from keeps the old row until that date", () => {
    const p = plan({
      applyFrom: "2026-10-25",
      rows: [row("a", "08:30")],
      desired: [{ id: "a", time: "09:00", dosage: 5, daysOfWeek: ALL }],
    });
    expect(p.patches).toEqual([{ id: "a", changes: { effectiveTo: "2026-10-25" } }]);
    expect(p.inserts[0]!.effectiveFrom).toBe("2026-10-25");
  });

  describe("change-day rule: a dose already logged on the change day", () => {
    const logged = new Map([["a", ["2026-10-20"]]]);
    const desired = [{ id: "a", time: "09:00", dosage: 5, daysOfWeek: ALL }];

    it("start-next-day: the change for that row starts the day after", () => {
      const p = plan({ rows: [row("a", "08:30")], desired, loggedDates: logged, rule: "start-next-day" });
      expect(p.patches).toEqual([{ id: "a", changes: { effectiveTo: "2026-10-21" } }]);
      expect(p.inserts[0]!.effectiveFrom).toBe("2026-10-21");
      expect(p.logMoves).toEqual([]);
      expect(p.startsOn).toBe("2026-10-21");
    });

    it("move-logs: the change starts on the day and the log moves to the new row", () => {
      const p = plan({ rows: [row("a", "08:30")], desired, loggedDates: logged, rule: "move-logs" });
      expect(p.patches).toEqual([{ id: "a", changes: { effectiveTo: "2026-10-20" } }]);
      expect(p.inserts[0]!.effectiveFrom).toBe("2026-10-20");
      expect(p.logMoves).toEqual([{ fromScheduleId: "a", insertIndex: 0, dates: ["2026-10-20"] }]);
      expect(p.startsOn).toBe("2026-10-20");
    });

    it("a removed row with a logged dose stays through that day under both rules", () => {
      for (const rule of ["start-next-day", "move-logs"] as const) {
        const p = plan({ rows: [row("a", "08:30")], desired: [], loggedDates: logged, rule });
        expect(p.patches).toEqual([{ id: "a", changes: { effectiveTo: "2026-10-21" } }]);
        expect(p.tombstones).toEqual([]);
      }
    });

    it("a dose logged on a later day (moved into today) keeps the old row until after it", () => {
      const p = plan({
        rows: [row("a", "08:30")],
        desired,
        loggedDates: new Map([["a", ["2026-10-22"]]]),
      });
      expect(p.inserts[0]!.effectiveFrom).toBe("2026-10-23");
    });

    it("a log before the change day does not count", () => {
      const p = plan({ rows: [row("a", "08:30")], desired, loggedDates: new Map([["a", ["2026-10-19"]]]) });
      expect(p.inserts[0]!.effectiveFrom).toBe("2026-10-20");
    });
  });

  describe("a second edit while a change is pending", () => {
    // Saved earlier: 08:30 until the 22nd, 09:00 from the 22nd.
    const rows = [
      row("old", "08:30", { effectiveTo: "2026-10-22" }),
      row("next", "09:00", { start: "2026-10-22", effectiveFrom: "2026-10-22" }),
    ];

    it("applied from today edits the pending row in place from today and closes the old row today", () => {
      const p = plan({ rows, desired: [{ id: "next", time: "10:00", dosage: 5, daysOfWeek: ALL }] });
      expect(p.patches).toEqual([
        { id: "next", changes: { time: "10:00", dosage: 5, daysOfWeek: ALL, effectiveFrom: "2026-10-20" } },
        { id: "old", changes: { effectiveTo: "2026-10-20" } },
      ]);
      expect(p.inserts).toEqual([]);
      expect(p.tombstones).toEqual([]);
    });

    it("a dose of the pending row already taken keeps that row through its day (start-next-day)", () => {
      // Tomorrow's 09:00 dose was moved to today and taken.
      const p = plan({
        rows,
        applyFrom: "2026-10-20",
        desired: [{ id: "next", time: "10:00", dosage: 5, daysOfWeek: ALL }],
        loggedDates: new Map([["next", ["2026-10-22"]]]),
      });
      expect(p.startsOn).toBe("2026-10-23");
      expect(p.tombstones).toEqual([]);
      expect(p.patches).toEqual([{ id: "next", changes: { effectiveTo: "2026-10-23" } }]);
      expect(p.inserts).toEqual([
        { content: { time: "10:00", dosage: 5, daysOfWeek: ALL }, effectiveFrom: "2026-10-23", replaces: "next" },
      ]);
    });

    it("move-logs: a logged dose of the pending row stays on it, edited in place", () => {
      const p = plan({
        rows,
        rule: "move-logs",
        desired: [{ id: "next", time: "10:00", dosage: 5, daysOfWeek: ALL }],
        loggedDates: new Map([["next", ["2026-10-22"]]]),
      });
      expect(p.tombstones).toEqual([]);
      expect(p.patches).toContainEqual({
        id: "next",
        changes: { time: "10:00", dosage: 5, daysOfWeek: ALL, effectiveFrom: "2026-10-20" },
      });
    });

    it("a removed pending row with a logged dose is not dropped", () => {
      const p = plan({
        rows,
        rule: "move-logs",
        desired: [{ id: "old", time: "08:30", dosage: 5, daysOfWeek: ALL }],
        loggedDates: new Map([["next", ["2026-10-22"]]]),
      });
      expect(p.tombstones).toEqual([]);
      expect(p.patches).toContainEqual({ id: "next", changes: { effectiveTo: "2026-10-23" } });
    });

    it("going back to the old time re-opens the old row", () => {
      const p = plan({ rows, desired: [{ id: "next", time: "08:30", dosage: 5, daysOfWeek: ALL }] });
      expect(p.patches).toEqual([{ id: "old", changes: { effectiveTo: null } }]);
      expect(p.inserts).toEqual([]);
      expect(p.tombstones).toEqual(["next"]);
    });

    it("applied after the pending date leaves the old row alone", () => {
      const p = plan({
        rows,
        applyFrom: "2026-10-25",
        desired: [{ id: "next", time: "10:00", dosage: 5, daysOfWeek: ALL }],
      });
      expect(p.patches).toEqual([{ id: "next", changes: { effectiveTo: "2026-10-25" } }]);
      expect(p.inserts[0]).toMatchObject({ effectiveFrom: "2026-10-25", replaces: "next" });
      expect(p.tombstones).toEqual([]);
    });
  });

  describe("start-next-day: one change day for the whole regimen", () => {
    it("a split dose added to a taken dose starts tomorrow, not on top of it today", () => {
      const p = plan({
        rows: [row("a", "08:00", { dosage: 50 })],
        desired: [
          { id: "a", time: "08:00", dosage: 25, daysOfWeek: ALL },
          { time: "20:00", dosage: 25, daysOfWeek: ALL },
        ],
        loggedDates: new Map([["a", ["2026-10-20"]]]),
      });
      expect(p.startsOn).toBe("2026-10-21");
      expect(p.patches).toEqual([{ id: "a", changes: { effectiveTo: "2026-10-21" } }]);
      expect(p.inserts.map((i) => [i.content.time, i.effectiveFrom])).toEqual([
        ["08:00", "2026-10-21"],
        ["20:00", "2026-10-21"],
      ]);
    });

    it("a second edit the same day keeps the pending change and adds to it from tomorrow", () => {
      // Edit 1: 08:00 (taken today) moved to 20:00 from tomorrow.
      const rows = [
        row("a", "08:00", { effectiveTo: "2026-10-21" }),
        row("b", "20:00", { start: "2026-10-21", effectiveFrom: "2026-10-21" }),
      ];
      const p = plan({
        rows,
        desired: [
          { id: "b", time: "20:00", dosage: 5, daysOfWeek: ALL },
          { time: "12:00", dosage: 5, daysOfWeek: ALL },
        ],
        loggedDates: new Map([["a", ["2026-10-20"]]]),
      });
      expect(p.startsOn).toBe("2026-10-21");
      expect(p.patches).toEqual([]);
      expect(p.tombstones).toEqual([]);
      expect(p.inserts).toEqual([{ content: { time: "12:00", dosage: 5, daysOfWeek: ALL }, effectiveFrom: "2026-10-21" }]);
    });

    it("a removed row without a log waits for the change day of its taken sibling", () => {
      const p = plan({
        rows: [row("am", "08:00"), row("pm", "20:00")],
        desired: [{ id: "am", time: "09:00", dosage: 5, daysOfWeek: ALL }],
        loggedDates: new Map([["am", ["2026-10-20"]]]),
      });
      expect(p.patches).toEqual([
        { id: "am", changes: { effectiveTo: "2026-10-21" } },
        { id: "pm", changes: { effectiveTo: "2026-10-21" } },
      ]);
    });

    it("a taken dose of an unchanged row does not hold back the change of another row", () => {
      const p = plan({
        rows: [row("am", "08:00"), row("pm", "20:00")],
        desired: [
          { id: "am", time: "08:00", dosage: 5, daysOfWeek: ALL },
          { id: "pm", time: "21:00", dosage: 5, daysOfWeek: ALL },
        ],
        loggedDates: new Map([["am", ["2026-10-20"]]]),
      });
      expect(p.startsOn).toBe("2026-10-20");
      expect(p.inserts[0]).toMatchObject({ effectiveFrom: "2026-10-20", replaces: "pm" });
    });
  });

  describe("unit", () => {
    it("a unit-only change closes every row and starts new ones", () => {
      const p = plan({
        rows: [row("a", "08:30", { unit: "mg" })],
        desired: [{ id: "a", time: "08:30", dosage: 5, daysOfWeek: ALL }],
        unit: "mcg",
      });
      expect(p.patches).toEqual([{ id: "a", changes: { effectiveTo: "2026-10-20" } }]);
      expect(p.inserts).toHaveLength(1);
    });

    it("from a future date, the row runs in the old unit until then", () => {
      const p = plan({
        applyFrom: "2026-10-25",
        rows: [row("a", "08:30", { unit: "mg" })],
        desired: [{ id: "a", time: "08:30", dosage: 5, daysOfWeek: ALL }],
        unit: "mcg",
      });
      expect(p.patches).toEqual([{ id: "a", changes: { effectiveTo: "2026-10-25" } }]);
      expect(p.inserts[0]!.effectiveFrom).toBe("2026-10-25");
    });

    it("the same unit keeps the row", () => {
      const p = plan({
        rows: [row("a", "08:30", { unit: "mg" })],
        desired: [{ id: "a", time: "08:30", dosage: 5, daysOfWeek: ALL }],
        unit: "mg",
      });
      expect(isEmptyPlan(p)).toBe(true);
    });
  });

  describe("isNewestRegimen", () => {
    const rows = [
      row("old", "08:30", { effectiveTo: "2026-10-25" }),
      row("next", "09:00", { start: "2026-10-25", effectiveFrom: "2026-10-25" }),
    ];
    it("is true for the rows a drawer shows (the pending change)", () => {
      expect(isNewestRegimen(rows, [{ id: "next", time: "09:00", dosage: 5, daysOfWeek: ALL }])).toBe(true);
    });
    it("is false for any change, also a unit change", () => {
      expect(isNewestRegimen(rows, [{ time: "10:00", dosage: 5, daysOfWeek: ALL }])).toBe(false);
      expect(
        isNewestRegimen([row("a", "08:30", { unit: "mg" })], [{ time: "08:30", dosage: 5, daysOfWeek: ALL }], "mcg"),
      ).toBe(false);
    });
  });

  it("a disabled row is left alone", () => {
    const p = plan({ rows: [row("off", "08:30", { enabled: false })], desired: [] });
    expect(isEmptyPlan(p)).toBe(true);
  });
});

describe("planPendingMove (a date-only edit of a pending change)", () => {
  const TODAY = "2026-10-19";
  // 08:00 until Thursday the 22nd, 09:00 from it.
  const current = row("cur", "08:00", { effectiveTo: "2026-10-22" });
  const pending = row("new", "09:00", { effectiveFrom: "2026-10-22", start: "2026-10-22" });
  const move = (input: Partial<PendingMoveInput>) =>
    planPendingMove({
      rows: [current, pending],
      today: TODAY,
      to: "2026-10-24",
      loggedDates: new Map(),
      rule: "start-next-day",
      ...input,
    });

  it("lists the pending change days after today", () => {
    expect(pendingChangeDays([current, pending], TODAY)).toEqual(["2026-10-22"]);
    expect(pendingChangeDays([current, pending], "2026-10-22")).toEqual([]);
    expect(pendingChangeDays([row("a", "08:00")], TODAY)).toEqual([]);
  });

  it("later: the current row ends and the pending row starts on the new day", () => {
    const m = move({});
    expect(m).toMatchObject({ kind: "planned", from: "2026-10-22" });
    if (m.kind !== "planned") throw new Error("expected a plan");
    expect(m.plan.startsOn).toBe("2026-10-24");
    expect(m.plan.patches).toEqual([
      { id: "cur", changes: { effectiveTo: "2026-10-24" } },
      { id: "new", changes: { effectiveFrom: "2026-10-24" } },
    ]);
    expect(m.plan.inserts).toEqual([]);
    expect(m.plan.tombstones).toEqual([]);
  });

  it("later: an unchanged row and older history stay as they are", () => {
    const evening = row("eve", "20:00");
    const history = row("old", "07:00", { effectiveTo: "2026-10-01" });
    const m = move({ rows: [history, current, pending, evening] });
    if (m.kind !== "planned") throw new Error("expected a plan");
    expect(m.plan.patches.map((p) => p.id)).toEqual(["cur", "new"]);
  });

  it("later: a removed time (a row that only ends) ends on the new day", () => {
    const m = move({ rows: [row("eve", "20:00", { effectiveTo: "2026-10-22" }), row("am", "08:00")] });
    if (m.kind !== "planned") throw new Error("expected a plan");
    expect(m.plan.patches).toEqual([{ id: "eve", changes: { effectiveTo: "2026-10-24" } }]);
  });

  it("later: a dose of the pending change logged before the new day refuses the move", () => {
    const m = move({ loggedDates: new Map([["new", ["2026-10-23", "2026-10-26"]]]) });
    expect(m).toEqual({ kind: "refused", from: "2026-10-22", reason: "logged-dose", limit: "2026-10-23" });
    // A log on or after the new day stays with its row: the move goes ahead.
    expect(move({ loggedDates: new Map([["new", ["2026-10-24"]]]) }).kind).toBe("planned");
  });

  it("earlier: the pending row starts and the current row ends on the new day", () => {
    const m = move({ to: "2026-10-20" });
    if (m.kind !== "planned") throw new Error("expected a plan");
    expect(m.plan.startsOn).toBe("2026-10-20");
    expect(m.plan.patches).toEqual(
      expect.arrayContaining([
        { id: "new", changes: { time: "09:00", dosage: 5, daysOfWeek: ALL, effectiveFrom: "2026-10-20" } },
        { id: "cur", changes: { effectiveTo: "2026-10-20" } },
      ]),
    );
    expect(m.plan.inserts).toEqual([]);
  });

  it("earlier: a dose logged on the current row keeps the change-day rule", () => {
    const m = move({ to: TODAY, loggedDates: new Map([["cur", [TODAY]]]) });
    if (m.kind !== "planned") throw new Error("expected a plan");
    expect(m.plan.startsOn).toBe("2026-10-20");
  });

  it("the same day writes nothing; no pending change is none", () => {
    const m = move({ to: "2026-10-22" });
    expect(m.kind === "planned" && isEmptyPlan(m.plan)).toBe(true);
    expect(move({ rows: [row("a", "08:00")] })).toEqual({ kind: "none" });
  });

  describe("two pending changes (tomorrow, then Thursday)", () => {
    const rows = [
      row("cur", "08:00", { effectiveTo: "2026-10-20" }),
      row("mid", "09:00", { effectiveFrom: "2026-10-20", effectiveTo: "2026-10-22", start: "2026-10-20" }),
      row("new", "10:00", { effectiveFrom: "2026-10-22", start: "2026-10-22" }),
    ];

    it("moves the newest one later", () => {
      const m = move({ rows });
      if (m.kind !== "planned") throw new Error("expected a plan");
      expect(m.from).toBe("2026-10-22");
      expect(m.plan.patches).toEqual([
        { id: "mid", changes: { effectiveTo: "2026-10-24" } },
        { id: "new", changes: { effectiveFrom: "2026-10-24" } },
      ]);
    });

    it("moves the newest one earlier, but not past the one before it", () => {
      const m = move({ rows, to: "2026-10-21" });
      if (m.kind !== "planned") throw new Error("expected a plan");
      expect(m.plan.patches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "new", changes: expect.objectContaining({ effectiveFrom: "2026-10-21" }) }),
          { id: "mid", changes: { effectiveTo: "2026-10-21" } },
        ]),
      );
      expect(m.plan.patches.some((p) => p.id === "cur")).toBe(false);
      for (const to of ["2026-10-20", TODAY]) {
        expect(move({ rows, to })).toEqual({
          kind: "refused",
          from: "2026-10-22",
          reason: "earlier-change",
          limit: "2026-10-20",
        });
      }
    });
  });
});
