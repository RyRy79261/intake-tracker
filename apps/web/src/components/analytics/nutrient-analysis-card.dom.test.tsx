// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NutrientAnalysisCard } from "@/components/analytics/nutrient-analysis-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeEatingRecord,
  makeUserProfile,
} from "@/__tests__/fixtures/db-fixtures";

describe("NutrientAnalysisCard personalisation label", () => {
  it("does not claim personalisation when medication sharing has nothing to send", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<NutrientAnalysisCard />, {
      seed: {
        userProfile: [makeUserProfile({ shareMedicationsWithAI: true })],
        eatingRecords: [
          makeEatingRecord({ timestamp: Date.now() - 86_400_000, note: "Oats" }),
        ],
      },
    });

    await user.click(
      await screen.findByRole("button", { name: "Analyze nutrient balance" }),
    );
    // Sharing is on, but there is no active prescription to include.
    expect(
      await screen.findByText(/no active prescriptions to include/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Personalised with your medical profile/i),
    ).not.toBeInTheDocument();
  });
});
