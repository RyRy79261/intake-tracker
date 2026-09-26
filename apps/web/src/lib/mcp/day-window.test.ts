import { describe, it, expect } from "vitest";
import {
  isValidTimeZone,
  resolveTimeZone,
  zonedDayWindow,
} from "@/lib/mcp/day-window";

// These run in whatever TZ the host has. Every expectation is an absolute
// instant, so a host-zone leak (the old `setHours` bug) fails them.
describe("mcp/day-window", () => {
  describe("zonedDayWindow", () => {
    it("starts the day at the user's local day-start hour, not the server's", () => {
      // 2026-09-25T00:30Z = 02:30 in Berlin (CEST, UTC+2).
      const now = Date.UTC(2026, 8, 25, 0, 30);
      const w = zonedDayWindow(now, "Europe/Berlin", 2);
      // 02:00 CEST on the 25th = 00:00Z.
      expect(w.start).toBe(Date.UTC(2026, 8, 25, 0, 0));
      expect(w.date).toBe("2026-09-25");
    });

    it("uses the previous local day's start before the day-start hour", () => {
      // 2026-09-25T01:30Z = 03:30 CEST; day start hour 4.
      const now = Date.UTC(2026, 8, 25, 1, 30);
      const w = zonedDayWindow(now, "Europe/Berlin", 4);
      // 04:00 CEST on the 24th = 02:00Z on the 24th.
      expect(w.start).toBe(Date.UTC(2026, 8, 24, 2, 0));
      // Doses are keyed by the local calendar date, like the app.
      expect(w.date).toBe("2026-09-25");
    });

    it("handles a zone west of UTC across the UTC date line", () => {
      // 2026-01-10T03:00Z = 22:00 on the 9th in New York (EST, UTC-5).
      const now = Date.UTC(2026, 0, 10, 3, 0);
      const w = zonedDayWindow(now, "America/New_York", 2);
      expect(w.start).toBe(Date.UTC(2026, 0, 9, 7, 0));
      expect(w.date).toBe("2026-01-09");
      expect(w.weekday).toBe(5); // Friday
    });

    it("uses the offset in force at the day start across a DST change", () => {
      // Berlin leaves DST on 2026-10-25 at 03:00 CEST -> 02:00 CET.
      // At 12:00 CET that day, a 00:00 day start is still CEST (UTC+2).
      const now = Date.UTC(2026, 9, 25, 11, 0);
      const w = zonedDayWindow(now, "Europe/Berlin", 0);
      expect(w.start).toBe(Date.UTC(2026, 9, 24, 22, 0));
    });

    it("never returns a start after now", () => {
      const now = Date.UTC(2026, 8, 25, 0, 0);
      for (const tz of ["UTC", "Europe/Berlin", "Pacific/Auckland", "America/Los_Angeles"]) {
        for (let h = 0; h < 24; h++) {
          const w = zonedDayWindow(now, tz, h);
          expect(w.start).toBeLessThanOrEqual(now);
          expect(now - w.start).toBeLessThan(25 * 60 * 60_000);
        }
      }
    });
  });

  describe("resolveTimeZone", () => {
    it("prefers the explicit zone, then the stored one, then UTC", () => {
      expect(resolveTimeZone("Asia/Tokyo", "Europe/Berlin")).toBe("Asia/Tokyo");
      expect(resolveTimeZone(undefined, "Europe/Berlin")).toBe("Europe/Berlin");
      expect(resolveTimeZone(undefined, null)).toBe("UTC");
    });

    it("skips an invalid zone rather than throwing", () => {
      expect(resolveTimeZone(undefined, "Not/AZone")).toBe("UTC");
      expect(isValidTimeZone("Not/AZone")).toBe(false);
      expect(isValidTimeZone("Africa/Johannesburg")).toBe(true);
    });
  });
});
