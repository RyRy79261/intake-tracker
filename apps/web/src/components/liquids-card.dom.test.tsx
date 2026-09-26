// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";

// PresetTab (rendered inside the card) gates its AI lookup on useAuthGate;
// open the gate so the card renders its full UI without a real session.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

import { LiquidsCard } from "@/components/liquids-card";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
import { useSettingsStore } from "@/stores/settings-store";

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

  const colaSeed = () => ({
    intakeRecords: [
      makeIntakeRecord({
        type: "water",
        amount: 330,
        source: "preset:manual",
        note: "Cola",
        groupId: "g-cola",
      }),
      makeIntakeRecord({
        type: "sugar",
        amount: 35,
        source: "manual:sugar",
        groupId: "g-cola",
      }),
    ],
  });

  it("labels a drink row from its note and shows its sugar", async () => {
    await renderWithFixtures(<LiquidsCard />, { seed: colaSeed() });
    expect(await screen.findByText("35g sugar")).toBeInTheDocument();
    expect(screen.getByText("Cola")).toBeInTheDocument();
  });

  // A disabled tracker is hidden from every surface (optional-trackers.ts);
  // the Food card's recent list already hid its sugar badge.
  it("hides the sugar badge while the sugar tracker is off", async () => {
    await renderWithFixtures(<LiquidsCard />, { seed: colaSeed() });
    // Wait for the sugar totals to load before switching the tracker off, so
    // the badge's absence can't just be the query still in flight.
    expect(await screen.findByText("35g sugar")).toBeInTheDocument();

    act(() => useSettingsStore.getState().setOptionalTracker("sugar", false));

    await waitFor(() =>
      expect(screen.queryByText("35g sugar")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Cola")).toBeInTheDocument();
  });
});
