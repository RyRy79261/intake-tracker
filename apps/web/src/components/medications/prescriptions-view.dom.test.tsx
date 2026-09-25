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
