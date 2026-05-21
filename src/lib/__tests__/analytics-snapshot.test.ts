import { describe, it, expect } from "vitest";
import {
  insightsRange,
  snapshotIsEmpty,
  INSIGHTS_WINDOW_DAYS,
} from "../analytics-snapshot";
import type { AnalyticsInsightsRequest } from "../analytics-insights";

describe("insightsRange", () => {
  it("spans exactly the rolling window ending at the given time", () => {
    const now = 1_700_000_000_000;
    const range = insightsRange(now);
    expect(range.end).toBe(now);
    expect((range.end - range.start) / (24 * 60 * 60 * 1000)).toBe(
      INSIGHTS_WINDOW_DAYS,
    );
  });
});

describe("snapshotIsEmpty", () => {
  const range = { start: 0, end: 1000 };

  it("is true when no metric group is present", () => {
    expect(snapshotIsEmpty({ range, metrics: {} })).toBe(true);
  });

  it("is true when correlations is present but empty", () => {
    expect(snapshotIsEmpty({ range, metrics: { correlations: [] } })).toBe(
      true,
    );
  });

  it("is false when at least one metric group has data", () => {
    const req: AnalyticsInsightsRequest = {
      range,
      metrics: {
        fluidBalance: { avgBalanceMl: 200, daysOnTarget: 4, daysTotal: 7 },
      },
    };
    expect(snapshotIsEmpty(req)).toBe(false);
  });
});
