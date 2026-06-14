// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { screen } from "@testing-library/react";

import { CorrelationChart } from "@/components/analytics/correlation-chart";
import { renderWithProviders } from "@/__tests__/react-test-utils";
import type { CorrelationResult, DataPoint } from "@intake/types/analytics";

// Recharts' ResponsiveContainer observes element size; jsdom has no
// ResizeObserver, so provide a no-op stand-in for the chart to mount.
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

/** A series of one daily DataPoint, ending today, going back `count` days. */
function dailySeries(count: number, value: (i: number) => number): DataPoint[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    timestamp: now - i * DAY_MS,
    value: value(i),
  }));
}

function makeResult(overrides: Partial<CorrelationResult> = {}): CorrelationResult {
  return {
    coefficient: 0.82,
    strength: "strong",
    seriesA: dailySeries(5, (i) => 1000 + i * 100),
    seriesB: dailySeries(5, (i) => 70 + i),
    pairs: [],
    pairedDays: 5,
    lagDays: 0,
    ...overrides,
  };
}

describe("CorrelationChart", () => {
  it("renders the Pearson coefficient and strength label for a meaningful result", () => {
    renderWithProviders(
      <CorrelationChart
        result={makeResult()}
        labelA="Salt"
        labelB="Weight"
        unitA=" mg"
        unitB=" kg"
      />,
    );

    expect(screen.getByText("r = 0.82")).toBeInTheDocument();
    expect(screen.getByText("Strong positive")).toBeInTheDocument();
    expect(screen.getByText(/5 days/)).toBeInTheDocument();
  });

  it("shows the empty-data placeholder when a series has no points", () => {
    renderWithProviders(
      <CorrelationChart
        result={makeResult({ seriesA: [], pairedDays: 0 })}
        labelA="Salt"
        labelB="Weight"
        unitA=" mg"
        unitB=" kg"
      />,
    );

    expect(screen.getByText("Not enough data to compare")).toBeInTheDocument();
    expect(screen.queryByText(/^r = /)).not.toBeInTheDocument();
  });

  it("warns when fewer than 3 overlapping days are paired", () => {
    renderWithProviders(
      <CorrelationChart
        result={makeResult({ pairedDays: 2, coefficient: 0.4, strength: "weak" })}
        labelA="Caffeine"
        labelB="Systolic BP"
        unitA=" mg"
        unitB=" mmHg"
      />,
    );

    expect(
      screen.getByText(/Not enough overlapping days to correlate \(2\/3\)/),
    ).toBeInTheDocument();
  });

  it("labels a negative correlation and surfaces the lag window", () => {
    renderWithProviders(
      <CorrelationChart
        result={makeResult({ coefficient: -0.61, strength: "moderate", lagDays: 2 })}
        labelA="Sugar"
        labelB="Weight"
        unitA=" g"
        unitB=" kg"
      />,
    );

    expect(screen.getByText("r = -0.61")).toBeInTheDocument();
    expect(screen.getByText("Moderate negative")).toBeInTheDocument();
    expect(screen.getByText("with 2-day lag")).toBeInTheDocument();
  });
});
