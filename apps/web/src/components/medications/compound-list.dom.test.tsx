// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `useAuthGate` is backed by Better Auth's `useSession`, which would attempt a
// network request in jsdom. Stub it (mirroring about-medicine-view.dom.test)
// so CompoundList renders deterministically without the AI search panel.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => false,
}));

import { CompoundList } from "@/components/medications/compound-list";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * CompoundList self-fetches every prescription and inventory item from the
 * seeded IndexedDB and buckets them into Active / Other / Out of stock
 * sections. These tests verify the bucketing and the empty state.
 */
describe("CompoundList", () => {
  it("renders the empty state with an add CTA when nothing is seeded", async () => {
    const onAddMed = vi.fn();
    await renderWithFixtures(<CompoundList onAddMed={onAddMed} />);

    expect(
      await screen.findByText(/no medications yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add your first medication/i }),
    ).toBeInTheDocument();
  });

  it("invokes onAddMed when the empty-state button is clicked", async () => {
    const user = userEvent.setup();
    const onAddMed = vi.fn();
    await renderWithFixtures(<CompoundList onAddMed={onAddMed} />);

    await user.click(
      await screen.findByRole("button", {
        name: /add your first medication/i,
      }),
    );
    expect(onAddMed).toHaveBeenCalledTimes(1);
  });

  it("lists an in-stock active medicine under the Active section", async () => {
    const rx = makePrescription({ genericName: "Lisinopril" });
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id);
    const inventory = makeInventoryItem(rx.id, {
      prescriptionId: rx.id,
      brandName: "Zestril",
      currentStock: 25,
      isActive: true,
    });

    await renderWithFixtures(<CompoundList onAddMed={() => {}} />, {
      seed: {
        prescriptions: [rx],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Zestril")).toBeInTheDocument();
  });

  it("buckets a zero-stock medicine into a collapsible Out of stock section", async () => {
    const user = userEvent.setup();
    const rx = makePrescription({ genericName: "Furosemide" });
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id);
    const inventory = makeInventoryItem(rx.id, {
      prescriptionId: rx.id,
      brandName: "Lasix",
      currentStock: 0,
      isActive: true,
    });

    await renderWithFixtures(<CompoundList onAddMed={() => {}} />, {
      seed: {
        prescriptions: [rx],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    // The out-of-stock header reports the count and the section is collapsed.
    const toggle = await screen.findByRole("button", {
      name: /out of stock \(1\)/i,
    });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText("Lasix")).not.toBeInTheDocument();

    // Expanding the section reveals the medicine card.
    await user.click(toggle);
    expect(await screen.findByText("Lasix")).toBeInTheDocument();
  });

  it("keeps archived brands reachable in a collapsed Archived section", async () => {
    const user = userEvent.setup();
    const rx = makePrescription({ genericName: "Atenolol" });
    const phase = makeMedicationPhase(rx.id);
    const schedule = makePhaseSchedule(phase.id);
    const archived = makeInventoryItem(rx.id, {
      prescriptionId: rx.id,
      brandName: "Tenormin",
      currentStock: 50,
      isArchived: true,
    });

    await renderWithFixtures(<CompoundList onAddMed={() => {}} />, {
      seed: {
        prescriptions: [rx],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [archived],
      },
    });

    // Not the empty state: the archived brand can still be reopened to
    // unarchive or delete it.
    const toggle = await screen.findByRole("button", { name: /archived \(1\)/i });
    expect(screen.queryByText(/no medications yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Tenormin")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(await screen.findByText("Tenormin")).toBeInTheDocument();
  });

  it("keeps a deactivated prescription's brand out of the Active section", async () => {
    const rx = makePrescription({ genericName: "Digoxin", isActive: false });
    const inventory = makeInventoryItem(rx.id, {
      prescriptionId: rx.id,
      brandName: "Lanoxin",
      currentStock: 20,
      isActive: true,
    });

    await renderWithFixtures(<CompoundList onAddMed={() => {}} />, {
      seed: { prescriptions: [rx], inventoryItems: [inventory] },
    });

    expect(await screen.findByText("Other")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("hides soft-deleted inventory items", async () => {
    const rx = makePrescription({ genericName: "Warfarin" });
    const deleted = makeInventoryItem(rx.id, {
      prescriptionId: rx.id,
      brandName: "Coumadin",
      currentStock: 20,
      deletedAt: 1700000000001,
    });

    await renderWithFixtures(<CompoundList onAddMed={() => {}} />, {
      seed: { prescriptions: [rx], inventoryItems: [deleted] },
    });

    expect(await screen.findByText(/no medications yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Coumadin")).not.toBeInTheDocument();
  });
});
