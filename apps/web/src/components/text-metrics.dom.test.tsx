// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import {
  TextMetrics,
  bucketByLogicalDay,
  getLogicalWeek,
} from "@/components/text-metrics";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeIntakeRecord,
  makeSubstanceRecord,
} from "@/__tests__/fixtures/db-fixtures";

describe("TextMetrics", () => {
  it("renders the daily and weekly summary", async () => {
    await renderWithFixtures(<TextMetrics />);

    expect(
      await screen.findByRole("region", { name: /daily intake summary/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("This Week (Mon-Sun)")).toBeInTheDocument();
  });

  it("labels the week from the chosen first day", async () => {
    await renderWithFixtures(<TextMetrics />, { settings: { weekStartsOn: 0 } });
    expect(await screen.findByText("This Week (Sun-Sat)")).toBeInTheDocument();
  });

  it("orders the day headers from the chosen first day", async () => {
    await renderWithFixtures(<TextMetrics />, { settings: { weekStartsOn: 6 } });
    expect(await screen.findByText("This Week (Sat-Fri)")).toBeInTheDocument();
    const headers = screen.getAllByTestId("week-day-header").map((h) => h.textContent);
    expect(headers).toEqual(["S", "S", "M", "T", "W", "T", "F"]);
  });

  it("reflects today's seeded water intake", async () => {
    await renderWithFixtures(<TextMetrics />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 500, timestamp: Date.now() }),
        ],
      },
    });

    // The 500 ml shows in both the daily total and today's weekly-grid cell.
    expect(await screen.findAllByText("500")).not.toHaveLength(0);
  });

  it("shows the uncapped water total against the target, with buffer usage on a second line", async () => {
    await renderWithFixtures(<TextMetrics />, {
      settings: { waterLimit: 1500, waterExtendedBuffer: 500 },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 2501, timestamp: Date.now() }),
        ],
      },
    });

    // Main line: real total vs the configured target (never target+buffer).
    await waitFor(
      () =>
        expect(screen.getByTestId("today-water-value")).toHaveTextContent(
          "2,501",
        ),
      { timeout: 5000 },
    );
    expect(screen.getByText("/ 1,500 ml")).toBeInTheDocument();
    // Second line: progress into the buffer (2,501 − 1,500), not the
    // overage past target+buffer.
    expect(screen.getByText(/1,001 \/\s*500 ml/)).toBeInTheDocument();
  });

  it("shows buffer usage as a muted line while still inside the buffer", async () => {
    await renderWithFixtures(<TextMetrics />, {
      settings: { waterLimit: 1500, waterExtendedBuffer: 500 },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 1800, timestamp: Date.now() }),
        ],
      },
    });

    await waitFor(
      () =>
        expect(screen.getByTestId("today-water-value")).toHaveTextContent(
          "1,800",
        ),
      { timeout: 5000 },
    );
    expect(screen.getByText(/300 \/\s*500 ml/)).toBeInTheDocument();
  });

  it("renders sodium the same way: uncapped total plus buffer usage", async () => {
    await renderWithFixtures(<TextMetrics />, {
      settings: { saltLimit: 1500, saltExtendedBuffer: 500 },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "salt", amount: 1700, timestamp: Date.now() }),
        ],
      },
    });

    // The total is no longer capped at the limit. Gate on the Today row's
    // own element: the weekly grid renders the same number from a separate
    // live query, so matching on text alone can open the gate while the
    // daily total is still its default 0.
    await waitFor(
      () =>
        expect(screen.getByTestId("today-sodium-value")).toHaveTextContent(
          "1,700",
        ),
      { timeout: 5000 },
    );
    expect(screen.getByText("/ 1,500 mg")).toBeInTheDocument();
    expect(screen.getByText(/200 \/\s*500 mg/)).toBeInTheDocument();
  });

  it("colours a total inside the buffer as 'extended', the same as the Food card", async () => {
    await renderWithFixtures(<TextMetrics />, {
      settings: { waterLimit: 1000, waterExtendedBuffer: 500 },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 1200, timestamp: Date.now() }),
        ],
      },
    });

    await waitFor(
      () =>
        expect(screen.getByTestId("today-water-value")).toHaveTextContent(
          "1,200",
        ),
      { timeout: 5000 },
    );
    expect(screen.getByTestId("today-water-value").className).toMatch(
      /text-orange-600/,
    );
  });

  it("rounds a fractional caffeine total", async () => {
    await renderWithFixtures(<TextMetrics />, {
      seed: {
        substanceRecords: [
          makeSubstanceRecord({ type: "caffeine", amountMg: 0.1, timestamp: Date.now() }),
          makeSubstanceRecord({ type: "caffeine", amountMg: 0.2, timestamp: Date.now() }),
        ],
      },
    });

    expect(await screen.findByText("0.3 mg", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/0\.30000000000000004/)).not.toBeInTheDocument();
  });
});

describe("weekly bucketing", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("buckets by logical day across a 25h DST day", () => {
    process.env.TZ = "Europe/Berlin";
    // Wed 21 Oct 2026, 12:00 local; the week (Mon-Sun) is 19-25 Oct and
    // clocks go back on Sunday 25 Oct, so the last logical day is 25h long.
    const now = new Date(2026, 9, 21, 12, 0);
    const week = getLogicalWeek(now, 2, 1);

    expect(week.dayKeys[0]).toBe("2026-10-19");
    expect(week.dayKeys[6]).toBe("2026-10-25");
    // The week ends at the next logical day start (Mon 26 Oct 02:00 local),
    // not 7 × 24h after the start.
    expect(week.end).toBe(new Date(2026, 9, 26, 2, 0).getTime());

    // 01:30 on Mon 26 Oct still belongs to Sunday's logical day.
    const lateSunday = new Date(2026, 9, 26, 1, 30).getTime();
    // 01:30 on Sun 25 Oct belongs to Saturday's logical day.
    const lateSaturday = new Date(2026, 9, 25, 1, 30).getTime();
    const buckets = bucketByLogicalDay(
      [
        { timestamp: lateSunday, amount: 100 },
        { timestamp: lateSaturday, amount: 50 },
      ],
      week.dayKeys,
      2,
      (r) => r.amount,
    );
    expect(buckets).toEqual([0, 0, 0, 0, 0, 50, 100]);
  });

  it("uses the same Monday week start as the medications week strip", () => {
    const now = new Date(2026, 8, 26, 9, 0); // Sat 26 Sep 2026
    const week = getLogicalWeek(now, 2, 1);
    expect(week.dayKeys[0]).toBe("2026-09-21");
    expect(week.todayIndex).toBe(5);
  });

  it("puts Sunday last in the week", () => {
    const now = new Date(2026, 8, 27, 12, 0); // Sun 27 Sep 2026
    const week = getLogicalWeek(now, 2, 1);
    expect(week.dayKeys[0]).toBe("2026-09-21");
    expect(week.todayIndex).toBe(6);
  });

  it("starts the week on Sunday when the user chose Sunday", () => {
    const now = new Date(2026, 8, 26, 9, 0); // Sat 26 Sep 2026
    const week = getLogicalWeek(now, 2, 0);
    expect(week.dayKeys[0]).toBe("2026-09-20");
    expect(week.dayKeys[6]).toBe("2026-09-26");
    expect(week.todayIndex).toBe(6);

    // Sunday opens the next week.
    const sunday = getLogicalWeek(new Date(2026, 8, 27, 12, 0), 2, 0);
    expect(sunday.dayKeys[0]).toBe("2026-09-27");
    expect(sunday.todayIndex).toBe(0);
  });

  it("starts the week on Saturday when the user chose Saturday", () => {
    const week = getLogicalWeek(new Date(2026, 8, 25, 12, 0), 2, 6); // Fri
    expect(week.dayKeys[0]).toBe("2026-09-19");
    expect(week.todayIndex).toBe(6);
  });

  it("keeps a before-day-start hour in the previous logical week", () => {
    // 01:00 Sun 27 Sep with a 2am day start is still Saturday's logical day,
    // so a Sunday-first week is the one that started on 20 Sep.
    const week = getLogicalWeek(new Date(2026, 8, 27, 1, 0), 2, 0);
    expect(week.dayKeys[0]).toBe("2026-09-20");
    expect(week.todayIndex).toBe(6);
  });
});
