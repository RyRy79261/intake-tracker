// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";

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

    // The total is no longer capped at the limit. The value can also
    // appear in the weekly grid, so match on at-least-one.
    await waitFor(
      () => expect(screen.getAllByText("1,700").length).toBeGreaterThan(0),
      { timeout: 5000 },
    );
    expect(screen.getByText("/ 1,500 mg")).toBeInTheDocument();
    expect(screen.getByText(/200 \/\s*500 mg/)).toBeInTheDocument();
  });
});
