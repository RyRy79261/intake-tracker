// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

// PresetTab (rendered inside the card) gates its AI lookup on useAuthGate;
// open the gate so the card renders its full UI without a real session.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

import { LiquidsCard } from "@/components/liquids-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";

describe("LiquidsCard", () => {
  it("renders the tab strip", async () => {
    await renderWithFixtures(<LiquidsCard />);

    expect(await screen.findByText("Liquids")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Water" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Beverage" })).toBeInTheDocument();
  });

  it("lists a seeded water entry", async () => {
    await renderWithFixtures(<LiquidsCard />, {
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 250, source: "manual" }),
        ],
      },
    });

    expect(await screen.findAllByText("250ml")).not.toHaveLength(0);
  });
});
