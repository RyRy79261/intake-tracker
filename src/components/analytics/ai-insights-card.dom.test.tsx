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

  it("shows the pre-generation prompt and both fast/deep buttons when no result is cached", async () => {
    await renderWithFixtures(<AiInsightsCard />);

    expect(
      await screen.findByText(/Generate an AI summary of your last 30 days/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fast analysis" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Deep analysis/i }),
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
    // Both buttons remain available so the user can run either flavour
    // when a previous result is already cached.
    expect(
      screen.getByRole("button", { name: "Fast analysis" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Deep analysis/i }),
    ).toBeInTheDocument();
  });

  it("renders a 'Deep' badge on deep-mode cached reports", async () => {
    await renderWithFixtures(<AiInsightsCard />, {
      seed: {
        insightReports: [
          makeInsightReport({
            generatedAt: Date.now(),
            narrative: "Deep-research summary.",
            observations: ["With citations from current guidelines."],
            mode: "deep",
          }),
        ],
      },
    });

    expect(
      await screen.findByText("Deep-research summary."),
    ).toBeInTheDocument();
    expect(screen.getByText("Deep")).toBeInTheDocument();
  });

  it("opens the consent dialog explaining what data feeds the summary when fast is clicked", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<AiInsightsCard />);

    await user.click(screen.getByRole("button", { name: "Fast analysis" }));

    expect(
      await screen.findByText("What goes into this summary"),
    ).toBeInTheDocument();
    expect(screen.getByText("Water intake")).toBeInTheDocument();
    expect(screen.getByText("Blood pressure readings")).toBeInTheDocument();
    expect(
      screen.getByText(/Conditions not included/i),
    ).toBeInTheDocument();
  });

  it("surfaces the cost warning in the dialog when deep analysis is clicked", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<AiInsightsCard />);

    await user.click(screen.getByRole("button", { name: /Deep analysis/i }));

    expect(
      await screen.findByText("Deep analysis with web research"),
    ).toBeInTheDocument();
    // The cost-warning callout flagged by the prompt is what makes deep
    // mode distinguishable in the consent dialog.
    expect(
      screen.getByText("Deep analysis is a costly request"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start deep analysis" }),
    ).toBeInTheDocument();
  });
});
