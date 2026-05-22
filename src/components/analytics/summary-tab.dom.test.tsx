// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { screen } from "@testing-library/react";

import { SummaryTab } from "@/components/analytics/summary-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeIntakeRecord,
  makeBloodPressureRecord,
  makeWeightRecord,
} from "@/__tests__/fixtures/db-fixtures";
import type { TimeRange } from "@/lib/analytics-types";

// Recharts' ResponsiveContainer observes element size; jsdom has no
// ResizeObserver, so provide a no-op stand-in for the charts to mount.
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const DAY_MS = 86_400_000;
// "All" preset: start 0 makes the per-day divisor fall back to active days.
const RANGE: TimeRange = { start: 0, end: Date.now() + DAY_MS };

describe("SummaryTab", () => {
  it("shows the no-data state when nothing is logged for the period", async () => {
    await renderWithFixtures(<SummaryTab range={RANGE} />);

    expect(
      await screen.findByText("No data for this period"),
    ).toBeInTheDocument();
  });

  it("surfaces KPI cards with seeded blood pressure and weight averages", async () => {
    const now = Date.now();

    await renderWithFixtures(<SummaryTab range={RANGE} />, {
      seed: {
        bloodPressureRecords: [
          makeBloodPressureRecord({ systolic: 120, diastolic: 80, timestamp: now - 2 * DAY_MS }),
          makeBloodPressureRecord({ systolic: 130, diastolic: 84, timestamp: now - 1 * DAY_MS }),
        ],
        weightRecords: [
          makeWeightRecord({ weight: 80, timestamp: now - 2 * DAY_MS }),
          makeWeightRecord({ weight: 79, timestamp: now - 1 * DAY_MS }),
        ],
      },
    });

    // KPI labels render once there is any data.
    expect(await screen.findByText("Avg Blood Pressure")).toBeInTheDocument();
    expect(screen.getByText("Avg Weight")).toBeInTheDocument();
    // Average of 120 and 130 systolic / 80 and 84 diastolic = 125/82.
    expect(await screen.findByText("125/82")).toBeInTheDocument();
    // Average weight of 80 and 79 = 79.5 kg.
    expect(await screen.findByText("79.5 kg")).toBeInTheDocument();
  });

  it("aggregates intake totals into the water and sodium KPI subtitles", async () => {
    const now = Date.now();

    await renderWithFixtures(<SummaryTab range={RANGE} />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 500, timestamp: now - 1 * DAY_MS }),
          makeIntakeRecord({ type: "water", amount: 500, timestamp: now - 1 * DAY_MS }),
          makeIntakeRecord({ type: "salt", amount: 800, timestamp: now - 1 * DAY_MS }),
        ],
      },
    });

    // Water total 1000 ml -> "1.0 L total" subtitle.
    expect(await screen.findByText(/1\.0 L total/)).toBeInTheDocument();
    // Sodium total 800 mg appears in its KPI subtitle.
    expect(await screen.findByText(/800 mg total/)).toBeInTheDocument();
  });
});
