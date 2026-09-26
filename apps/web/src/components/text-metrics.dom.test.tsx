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
    expect(screen.getByText("This Week (Sun-Sat)")).toBeInTheDocument();
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
    // Wed 28 Oct 2026, 12:00 local; the week (Sun-Sat) is 25-31 Oct and
    // clocks go back on Sunday 25 Oct.
    const now = new Date(2026, 9, 28, 12, 0);
    const week = getLogicalWeek(now, 2);

    expect(week.dayKeys[0]).toBe("2026-10-25");
    expect(week.dayKeys[6]).toBe("2026-10-31");
    // The week ends at the next logical day start (Sun 1 Nov 02:00 local),
    // not 7 × 24h after the start.
    expect(week.end).toBe(new Date(2026, 10, 1, 2, 0).getTime());

    // 01:30 on Sun 1 Nov still belongs to Saturday's logical day.
    const lateSaturday = new Date(2026, 10, 1, 1, 30).getTime();
    // 01:30 on Sat 31 Oct belongs to Friday's logical day.
    const lateFriday = new Date(2026, 9, 31, 1, 30).getTime();
    const buckets = bucketByLogicalDay(
      [
        { timestamp: lateSaturday, amount: 100 },
        { timestamp: lateFriday, amount: 50 },
      ],
      week.dayKeys,
      2,
      (r) => r.amount,
    );
    expect(buckets).toEqual([0, 0, 0, 0, 0, 50, 100]);
  });

  it("uses the same Sunday week start as the medications week strip", () => {
    const now = new Date(2026, 8, 26, 9, 0); // Sat 26 Sep 2026
    const week = getLogicalWeek(now, 2);
    expect(week.dayKeys[0]).toBe("2026-09-20");
    expect(week.todayIndex).toBe(6);
  });
});
