// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiInsightsCard } from "@/components/analytics/ai-insights-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useInsightsStore } from "@/stores/insights-store";

/**
 * AiInsightsCard generates a summary via POST /api/analytics/insights. The
 * snapshot builder reads the test DB and the request goes through `fetch`,
 * so we stub `fetch` to return a deterministic narrative.
 */
describe("AiInsightsCard", () => {
  beforeEach(() => {
    useInsightsStore.getState().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useInsightsStore.getState().clear();
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
    useInsightsStore.getState().setResult({
      narrative: "Your hydration improved this week.",
      observations: ["Water intake rose 12%", "Sodium stayed within limit"],
      generatedAt: Date.now(),
    });

    await renderWithFixtures(<AiInsightsCard />);

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
