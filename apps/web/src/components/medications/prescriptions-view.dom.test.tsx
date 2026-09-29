// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PrescriptionsView } from "@/components/medications/prescriptions-view";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makePrescription } from "@/__tests__/fixtures/db-fixtures";

/**
 * PrescriptionsView lists active prescriptions and keeps deactivated ones in a
 * collapsed Inactive section, so they can be reopened and reactivated.
 */
describe("PrescriptionsView", () => {
  it("shows a deactivated prescription in a collapsible Inactive section", async () => {
    const user = userEvent.setup();
    const active = makePrescription({ genericName: "Lisinopril", isActive: true });
    const paused = makePrescription({ genericName: "Spironolactone", isActive: false });

    await renderWithFixtures(<PrescriptionsView onAddMed={() => {}} />, {
      seed: { prescriptions: [active, paused] },
    });

    expect(await screen.findByText("Lisinopril")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /inactive \(1\)/i });
    expect(screen.queryByText("Spironolactone")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(await screen.findByText("Spironolactone")).toBeInTheDocument();
  });

  it("does not show the empty state when only inactive prescriptions exist", async () => {
    const paused = makePrescription({ genericName: "Spironolactone", isActive: false });

    await renderWithFixtures(<PrescriptionsView onAddMed={() => {}} />, {
      seed: { prescriptions: [paused] },
    });

    expect(await screen.findByRole("button", { name: /inactive \(1\)/i })).toBeInTheDocument();
    expect(screen.queryByText(/no prescriptions yet/i)).not.toBeInTheDocument();
  });

  it("spans an expanded right-column card and the neighbour it leaves alone", async () => {
    const user = userEvent.setup();
    const names = ["Amlodipine", "Bisoprolol", "Candesartan"];
    await renderWithFixtures(<PrescriptionsView onAddMed={() => {}} />, {
      seed: { prescriptions: names.map((genericName) => makePrescription({ genericName })) },
    });

    await screen.findByText("Candesartan");
    const cards = () => screen.getAllByTestId("rx-card");
    const spans = () => cards().map((c) => c.className.includes("col-span-2"));
    expect(spans()).toEqual([false, false, false]);

    // Bisoprolol sits in the right column: it spans, and Amlodipine (left
    // alone on its row) spans too. Candesartan starts a new row.
    await user.click(screen.getByRole("button", { name: /bisoprolol/i, expanded: false }));
    expect(await screen.findByText("Medicines")).toBeInTheDocument();
    expect(spans()).toEqual([true, true, false]);
    expect(cards()[1]).toHaveAttribute("data-expanded", "true");

    // Collapsing restores the plain 2-column grid.
    await user.click(screen.getByRole("button", { name: /bisoprolol/i, expanded: true }));
    expect(spans()).toEqual([false, false, false]);
  });

  it("never lists a soft-deleted prescription", async () => {
    const ghost = makePrescription({
      genericName: "Ghostamine",
      isActive: false,
      deletedAt: 1700000000001,
    });

    await renderWithFixtures(<PrescriptionsView onAddMed={() => {}} />, {
      seed: { prescriptions: [ghost] },
    });

    expect(await screen.findByText(/no prescriptions yet/i)).toBeInTheDocument();
  });
});
