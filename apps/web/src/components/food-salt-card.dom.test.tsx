// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

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

    expect(await screen.findByText("Food")).toBeInTheDocument();
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

  it("shows the true sodium total in the headline when the buffer is 0", async () => {
    await renderWithFixtures(<FoodSaltCard />, {
      settings: { saltLimit: 1500, saltExtendedBuffer: 0 },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "salt", amount: 3200, timestamp: Date.now() }),
        ],
      },
    });

    const headline = await screen.findByText(/^3200mg \/ 1500mg$/, undefined, {
      timeout: 5000,
    });
    expect(headline.className).toMatch(/text-red-600/);
    // The overshoot is spelled out even with no buffer configured.
    expect(screen.getByText(/1700mg over/)).toBeInTheDocument();
  });

  it("shows the true total (not the limit) inside the buffer, in the extended colour", async () => {
    await renderWithFixtures(<FoodSaltCard />, {
      settings: { saltLimit: 1500, saltExtendedBuffer: 500 },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "salt", amount: 1700, timestamp: Date.now() }),
        ],
      },
    });

    const headline = await screen.findByText(/^1700mg \/ 1500mg$/, undefined, {
      timeout: 5000,
    });
    expect(headline.className).toMatch(/text-orange-600/);
    expect(screen.getByText(/200mg \/\s*500mg extra/)).toBeInTheDocument();
  });

  it("rounds a fractional summed sugar total", async () => {
    await renderWithFixtures(<FoodSaltCard />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "sugar", amount: 0.1, timestamp: Date.now() }),
          makeIntakeRecord({ type: "sugar", amount: 0.2, timestamp: Date.now() }),
        ],
      },
    });

    await waitFor(
      () =>
        expect(screen.getByTestId("food-card-sugar")).toHaveTextContent(
          "0.3g / 30g",
        ),
      { timeout: 5000 },
    );
    expect(screen.getByTestId("food-card-sugar")).not.toHaveTextContent(
      "0.30000000000000004",
    );
  });
});
