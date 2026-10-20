import { describe, it, expect } from "vitest";
import {
  addDaysToKey,
  isEmptyPlan,
  planScheduleChange,
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
      expect(p.deferred).toEqual([{ scheduleId: "a", startsOn: "2026-10-21" }]);
    });

    it("move-logs: the change starts on the day and the log moves to the new row", () => {
      const p = plan({ rows: [row("a", "08:30")], desired, loggedDates: logged, rule: "move-logs" });
      expect(p.patches).toEqual([{ id: "a", changes: { effectiveTo: "2026-10-20" } }]);
      expect(p.inserts[0]!.effectiveFrom).toBe("2026-10-20");
      expect(p.logMoves).toEqual([{ fromScheduleId: "a", insertIndex: 0, dates: ["2026-10-20"] }]);
      expect(p.deferred).toEqual([]);
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

    it("applied from today replaces the pending change and closes the old row today", () => {
      const p = plan({ rows, desired: [{ id: "next", time: "10:00", dosage: 5, daysOfWeek: ALL }] });
      expect(p.patches).toEqual([{ id: "old", changes: { effectiveTo: "2026-10-20" } }]);
      expect(p.inserts).toEqual([
        { content: { time: "10:00", dosage: 5, daysOfWeek: ALL }, effectiveFrom: "2026-10-20", replaces: "old" },
      ]);
      expect(p.tombstones).toEqual(["next"]);
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

  it("a disabled row is left alone", () => {
    const p = plan({ rows: [row("off", "08:30", { enabled: false })], desired: [] });
    expect(isEmptyPlan(p)).toBe(true);
  });
});
