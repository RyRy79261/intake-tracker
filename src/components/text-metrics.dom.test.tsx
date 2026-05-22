// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { TextMetrics } from "@/components/text-metrics";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";

describe("TextMetrics", () => {
  it("renders the daily and weekly summary", async () => {
    await renderWithFixtures(<TextMetrics />);

    expect(
      await screen.findByRole("region", { name: /daily intake summary/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("This Week (Mon-Sun)")).toBeInTheDocument();
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
});
