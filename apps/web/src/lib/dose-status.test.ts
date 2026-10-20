/**
 * Owner decision (live-data-forensics#7): a scheduled dose on a past day with
 * no taken/skipped log counts as MISSED until the user updates it. Every
 * surface (schedule view, adherence, export, MCP, insights) resolves a slot
 * through this one rule.
 */
import { describe, it, expect } from "vitest";
import { resolveDoseStatus } from "@/lib/dose-status";

const TODAY = "2026-09-26";

describe("resolveDoseStatus", () => {
  it("a taken or skipped log wins on any day", () => {
    for (const day of ["2026-09-20", TODAY, "2026-09-30"]) {
      expect(resolveDoseStatus("taken", day, TODAY)).toBe("taken");
      expect(resolveDoseStatus("skipped", day, TODAY)).toBe("skipped");
    }
  });

  it("an unlogged dose on a past day is missed", () => {
    expect(resolveDoseStatus(undefined, "2026-09-25", TODAY)).toBe("missed");
    expect(resolveDoseStatus(null, "2026-01-01", TODAY)).toBe("missed");
  });

  it("a pending or rescheduled log on a past day is still owed, so missed", () => {
    expect(resolveDoseStatus("pending", "2026-09-25", TODAY)).toBe("missed");
    expect(resolveDoseStatus("rescheduled", "2026-09-25", TODAY)).toBe("missed");
  });

  it("an unlogged dose today or later is pending, not missed", () => {
    expect(resolveDoseStatus(undefined, TODAY, TODAY)).toBe("pending");
    expect(resolveDoseStatus("rescheduled", TODAY, TODAY)).toBe("pending");
    expect(resolveDoseStatus(undefined, "2026-09-27", TODAY)).toBe("pending");
  });
});

describe("resolveDoseStatus: a dose carried over from an earlier day", () => {
  const remindAt = Date.UTC(2026, 9, 20, 0, 30);
  it("is pending until the period after remindAt ends, not missed at midnight", () => {
    const ctx = (now: number) => ({ remindAt, now });
    expect(resolveDoseStatus("rescheduled", "2026-10-19", "2026-10-20", ctx(remindAt + 10 * 60_000))).toBe("pending");
    expect(resolveDoseStatus("rescheduled", "2026-10-19", "2026-10-20", ctx(remindAt + 31 * 60_000))).toBe("missed");
  });
  it("only for a rescheduled log", () => {
    expect(resolveDoseStatus("pending", "2026-10-19", "2026-10-20", { remindAt, now: remindAt })).toBe("missed");
    expect(resolveDoseStatus(undefined, "2026-10-19", "2026-10-20", { remindAt, now: remindAt })).toBe("missed");
  });
});
