// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiInsightsCard } from "@/components/analytics/ai-insights-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeInsightReport } from "@/__tests__/fixtures/db-fixtures";

/**
 * AiInsightsCard generates a summary via POST /api/analytics/insights and
 * caches the result to the `insightReports` Dexie table. The snapshot builder
 * reads the test DB and the request goes through `fetch`, so tests that
 * exercise generation stub `fetch`; tests that exercise the cached-render path
 * seed Dexie directly.
 */
describe("AiInsightsCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the pre-generation prompt and a Generate button when no result is cached", async () => {
    await renderWithFixtures(<AiInsightsCard />);

    expect(
      await screen.findByText(/Generate an AI summary of your last 30 days/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate insights" }),
    ).toBeInTheDocument();
  });

  it("renders a cached insights result with its narrative and observations", async () => {
    await renderWithFixtures(<AiInsightsCard />, {
      seed: {
        insightReports: [
          makeInsightReport({
            generatedAt: Date.now(),
            narrative: "Your hydration improved this week.",
            observations: [
              "Water intake rose 12%",
              "Sodium stayed within limit",
            ],
          }),
        ],
      },
    });

    expect(
      await screen.findByText("Your hydration improved this week."),
    ).toBeInTheDocument();
    expect(screen.getByText("Water intake rose 12%")).toBeInTheDocument();
    expect(screen.getByText("Sodium stayed within limit")).toBeInTheDocument();
    // With a cached result the button switches to "Regenerate".
    expect(
      screen.getByRole("button", { name: "Regenerate" }),
    ).toBeInTheDocument();
  });

  it("opens the consent dialog explaining what data feeds the summary", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<AiInsightsCard />);

    await user.click(screen.getByRole("button", { name: "Generate insights" }));

    expect(
      await screen.findByText("What goes into this summary"),
    ).toBeInTheDocument();
    expect(screen.getByText("Water intake")).toBeInTheDocument();
    expect(screen.getByText("Blood pressure readings")).toBeInTheDocument();
    expect(
      screen.getByText(/Conditions not included/i),
    ).toBeInTheDocument();
  });
});
