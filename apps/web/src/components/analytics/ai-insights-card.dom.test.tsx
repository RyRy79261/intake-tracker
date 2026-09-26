// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiInsightsCard } from "@/components/analytics/ai-insights-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeInsightReport,
  makeUserProfile,
} from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";

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

  it("renders a compact preview of the cached report inline with the narrative and a Read affordance", async () => {
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

    // Narrative previewed inline so the user knows what's in the report
    // without opening it.
    expect(
      await screen.findByText("Your hydration improved this week."),
    ).toBeInTheDocument();
    // Observations are gated behind the reading dialog — they should NOT
    // be visible until the user clicks through. This keeps deep-mode
    // reports from dominating the analytics page.
    expect(screen.queryByText("Water intake rose 12%")).not.toBeInTheDocument();
    expect(screen.getByText(/Read/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fast analysis" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Deep analysis/i }),
    ).toBeInTheDocument();
  });

  it("opens the reading dialog with full observations + sources when the preview is tapped", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<AiInsightsCard />, {
      seed: {
        insightReports: [
          makeInsightReport({
            generatedAt: Date.now(),
            narrative: "Deep summary on the card.",
            observations: ["Observation revealed only in the modal."],
            sources: ["https://www.example.test/clinical-ref"],
            mode: "deep",
          }),
        ],
      },
    });

    // Tap the preview row to open the reading dialog.
    await user.click(
      await screen.findByText("Deep summary on the card."),
    );

    expect(
      await screen.findByText("Observation revealed only in the modal."),
    ).toBeInTheDocument();
    // Sources are surfaced inside the dialog as a hostname chip.
    expect(screen.getByText("example.test")).toBeInTheDocument();
  });

  it("never renders an anchor for a non-http source URL (XSS guard)", async () => {
    // The model-generated sources field is zod-validated as a URL but
    // z.url() accepts javascript: and data: schemes. The card MUST refuse
    // to make those clickable; only http(s) survive as an <a>. Anything
    // else falls back to plain text.
    const user = userEvent.setup();
    await renderWithFixtures(<AiInsightsCard />, {
      seed: {
        insightReports: [
          makeInsightReport({
            generatedAt: Date.now(),
            narrative: "Deep summary with a malicious source.",
            observations: ["Observation."],
            sources: ["javascript:alert(1)"],
            mode: "deep",
          }),
        ],
      },
    });

    await user.click(
      await screen.findByText("Deep summary with a malicious source."),
    );

    // The source still surfaces as plain text so the user sees it, but
    // the renderer is plain text, NOT an <a> the user can activate.
    const node = await screen.findByText("javascript:alert(1)");
    expect(node.tagName).not.toBe("A");
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

  it("labels itself as a fixed 30-day window, separate from the range selector", async () => {
    await renderWithFixtures(<AiInsightsCard />);
    expect(await screen.findByText("Last 30 days")).toBeInTheDocument();
  });

  it("deletes a report from the reading dialog after a confirming tap", async () => {
    const user = userEvent.setup();
    const report = makeInsightReport({
      generatedAt: Date.now(),
      narrative: "A report the user wants gone.",
    });
    await renderWithFixtures(<AiInsightsCard />, {
      seed: { insightReports: [report] },
    });

    await user.click(await screen.findByText("A report the user wants gone."));
    await user.click(await screen.findByRole("button", { name: "Delete report" }));
    // First tap only arms the action.
    expect((await db.insightReports.get(report.id))!.deletedAt).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tap again to delete" }));

    await waitFor(async () =>
      expect((await db.insightReports.get(report.id))!.deletedAt).not.toBeNull(),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("A report the user wants gone."),
      ).not.toBeInTheDocument(),
    );
  });

  it("offers the comparison only when a report for an earlier period exists", async () => {
    const user = userEvent.setup();
    // Covers the current window, so it is not an "earlier period".
    await renderWithFixtures(<AiInsightsCard />, {
      seed: {
        insightReports: [
          makeInsightReport({
            generatedAt: Date.now(),
            rangeStart: Date.now() - 30 * 86_400_000,
            rangeEnd: Date.now(),
          }),
        ],
      },
    });

    await user.click(screen.getByRole("button", { name: "Fast analysis" }));
    await screen.findByText("What goes into this summary");
    expect(screen.queryByText("Compare with history")).not.toBeInTheDocument();
  });

  it("does not claim a personalised summary when medication sharing has nothing to send", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<AiInsightsCard />, {
      seed: {
        userProfile: [makeUserProfile({ shareMedicationsWithAI: true })],
      },
    });

    await user.click(screen.getByRole("button", { name: "Fast analysis" }));
    expect(
      await screen.findByText(/no active prescriptions to include/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Personalised with your medical profile."),
    ).not.toBeInTheDocument();
  });
});
