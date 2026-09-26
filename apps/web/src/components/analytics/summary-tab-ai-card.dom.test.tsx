// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { SummaryTab } from "@/components/analytics/summary-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeInsightReport } from "@/__tests__/fixtures/db-fixtures";
import type { TimeRange } from "@intake/types/analytics";

// A quiet custom week with nothing logged in it.
const EMPTY_RANGE: TimeRange = { start: 0, end: 1 };

describe("SummaryTab — AI insights with an empty range", () => {
  it("keeps the AI card and its saved reports when the selected range has no data", async () => {
    // The AI card analyses its own fixed 30-day window, so an empty
    // range selection must not hide it or the user's past reports.
    await renderWithFixtures(<SummaryTab range={EMPTY_RANGE} />, {
      seed: {
        insightReports: [
          makeInsightReport({
            generatedAt: Date.now(),
            narrative: "A saved report that must stay visible.",
          }),
        ],
      },
    });

    expect(
      await screen.findByText("No data for this period"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("A saved report that must stay visible."),
    ).toBeInTheDocument();
  });
});
