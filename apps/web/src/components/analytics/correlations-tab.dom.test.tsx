// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CorrelationsTab } from "@/components/analytics/correlations-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeIntakeRecord,
  makeWeightRecord,
} from "@/__tests__/fixtures/db-fixtures";
import type { TimeRange } from "@intake/types/analytics";

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
const RANGE: TimeRange = { start: 0, end: Date.now() + DAY_MS };

describe("CorrelationsTab", () => {
  it("renders every pre-configured correlation card and the custom comparison", async () => {
    await renderWithFixtures(<CorrelationsTab range={RANGE} />);

    expect(
      await screen.findByText("Weight vs Salt Intake"),
    ).toBeInTheDocument();
    expect(screen.getByText("Weight vs Sugar Intake")).toBeInTheDocument();
    expect(screen.getByText("Caffeine vs Blood Pressure")).toBeInTheDocument();
    expect(screen.getByText("Alcohol vs Blood Pressure")).toBeInTheDocument();
    // "Custom Comparison" renders twice — a section heading and the card title.
    expect(screen.getAllByText("Custom Comparison")).toHaveLength(2);
  });

  it("shows the fluid-balance empty state when no fluid data exists", async () => {
    await renderWithFixtures(<CorrelationsTab range={RANGE} />);

    expect(
      await screen.findByText("No fluid data for this period"),
    ).toBeInTheDocument();
  });

  it("interprets an empty correlation as not enough data", async () => {
    await renderWithFixtures(<CorrelationsTab range={RANGE} />);

    // With no records, each correlation card explains the lack of overlap.
    const messages = await screen.findAllByText(
      /Not enough overlapping days in this period/i,
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it("runs a custom comparison only after the Compare button is clicked", async () => {
    const user = userEvent.setup();
    const now = Date.now();

    // Seed enough salt + weight days to produce a correlation chart.
    const seed = {
      intakeRecords: Array.from({ length: 6 }, (_, i) =>
        makeIntakeRecord({
          type: "salt",
          amount: 1000 + i * 100,
          timestamp: now - i * DAY_MS,
        }),
      ),
      weightRecords: Array.from({ length: 6 }, (_, i) =>
        makeWeightRecord({ weight: 78 + i * 0.2, timestamp: now - i * DAY_MS }),
      ),
    };

    await renderWithFixtures(<CorrelationsTab range={RANGE} />, { seed });

    // The custom comparison card is the one containing the Compare button.
    const compareButton = await screen.findByRole("button", {
      name: "Compare",
    });
    const customCard = compareButton.closest("div.rounded-xl") as HTMLElement;
    expect(customCard).not.toBeNull();

    // Before clicking Compare the custom card renders no correlation output.
    expect(
      within(customCard).queryByText(/r = |Not enough overlapping days/),
    ).not.toBeInTheDocument();

    await user.click(compareButton);

    // After comparing, the custom card renders a coefficient or a paired-day
    // notice — either way the comparison output now exists in this card.
    await within(customCard).findByText(
      /r = |Not enough overlapping days/,
    );
  });
});
