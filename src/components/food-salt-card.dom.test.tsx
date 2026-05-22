// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

// FoodSection (rendered inside the card) gates its AI helpers on useAuthGate;
// open the gate so the card renders its full UI without a real session.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

import { FoodSaltCard } from "@/components/food-salt-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";

describe("FoodSaltCard", () => {
  it("renders the card header", async () => {
    await renderWithFixtures(<FoodSaltCard />);

    expect(await screen.findByText("Food + Sodium")).toBeInTheDocument();
  });

  it("reflects the day's seeded sodium total", async () => {
    await renderWithFixtures(<FoodSaltCard />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "salt", amount: 500, timestamp: Date.now() }),
        ],
      },
    });

    expect(await screen.findAllByText(/500mg/)).not.toHaveLength(0);
  });
});
