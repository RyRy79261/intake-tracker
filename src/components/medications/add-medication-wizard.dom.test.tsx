// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The wizard reads auth state via `useSession` to gate the AI search box and
// the (AI-driven) conflict check. jsdom has no Neon Auth session, so stub the
// module. Returning a null session keeps the wizard in its signed-out path:
// the AI search input is hidden and the conflict check is skipped, which makes
// the multi-step flow deterministic to drive in a test.
const sessionMock = vi.fn(() => ({ data: null, isPending: false, error: null }));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => sessionMock(),
}));

// The medicine-search hook hits the server Claude API; never exercised on the
// signed-out path, but the module is imported eagerly so provide a stub that
// preserves the named `MedicineSearchCancelledError` export the wizard imports.
vi.mock("@/hooks/use-medicine-search", () => ({
  useMedicineSearch: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  MedicineSearchCancelledError: class MedicineSearchCancelledError extends Error {},
}));

import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
// A test asserting a write reached Dexie needs the db handle directly; the
// no-restricted-imports rule targets app components, not test files.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";

describe("AddMedicationWizard", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    sessionMock.mockReturnValue({ data: null, isPending: false, error: null });
  });

  it("opens on the Search step for a brand-new prescription", async () => {
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    // Header shows the search step label and the step counter. With no
    // existing prescriptions and the schedule step active, there are 6 steps.
    expect(await screen.findByText("Search Medicine")).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument();
    // The brand-name field is the gateway field on the search step.
    expect(screen.getByPlaceholderText(/e\.g\. Aviolix/i)).toBeInTheDocument();
  });

  it("blocks Next until the required brand name is supplied", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    // Advancing with an empty brand name fails validation and stays on step 1.
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(
      await screen.findByText(/medication name is required/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument();
  });

  it("advances to the Appearance step once a brand name is entered", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    await user.type(
      screen.getByPlaceholderText(/e\.g\. Aviolix/i),
      "Aspirin",
    );
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 2 is "Pill Appearance".
    expect(await screen.findByText("Pill Appearance")).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 6/i)).toBeInTheDocument();
    // A Back button now appears so the user can return to Search.
    expect(
      screen.getByRole("button", { name: /back/i }),
    ).toBeInTheDocument();
  });

  it("Back returns from Appearance to the Search step", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    await user.type(
      screen.getByPlaceholderText(/e\.g\. Aviolix/i),
      "Ibuprofen",
    );
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Pill Appearance");

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(await screen.findByText("Search Medicine")).toBeInTheDocument();
    // The typed brand name is preserved when stepping back.
    expect(screen.getByDisplayValue("Ibuprofen")).toBeInTheDocument();
  });

  it("walks every step and saves a new prescription to the database", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    // Step 1 — Search: supply the required brand name.
    await user.type(
      screen.getByPlaceholderText(/e\.g\. Aviolix/i),
      "Paracetamol",
    );

    // Steps 2–5 (Appearance, Indication, Dosage, Schedule) carry valid
    // defaults from the form's initial state, so Next clears each one.
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Pill Appearance");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Indication & Notes");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Dosage");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Schedule");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 6 — Inventory: the final step shows the Save button.
    expect(await screen.findByText("Inventory")).toBeInTheDocument();
    const save = await screen.findByRole("button", {
      name: /save medication/i,
    });
    await user.click(save);

    // The addPrescription mutation writes the prescription through to Dexie.
    await vi.waitFor(async () => {
      const all = await db.prescriptions.toArray();
      expect(all.some((p) => p.genericName === "Paracetamol")).toBe(true);
    });
  });
});
