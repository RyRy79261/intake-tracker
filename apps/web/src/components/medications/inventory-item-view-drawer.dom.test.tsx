// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InventoryItemViewDrawer } from "@/components/medications/inventory-item-view-drawer";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { showUndoToast } from "@/components/medications/undo-toast";
// A test asserting a write reached Dexie needs the db handle directly; the
// no-restricted-imports rule targets app components, not test files.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeInventoryTransaction,
} from "@/__tests__/fixtures/db-fixtures";

vi.mock("@/components/medications/undo-toast", () => ({
  showUndoToast: vi.fn(),
}));

function fixture(itemOverrides = {}) {
  const prescription = makePrescription({ genericName: "Amlodipine" });
  const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
  const schedule = makePhaseSchedule(phase.id, { dosage: 10 });
  const item = makeInventoryItem(prescription.id, {
    brandName: "Norvasc",
    strength: 5,
    unit: "mg",
    currentStock: 42,
    ...itemOverrides,
  });
  return { prescription, phase, schedule, item };
}

describe("InventoryItemViewDrawer", () => {
  it("renders nothing when no item is supplied", async () => {
    const { container } = await renderWithFixtures(
      <InventoryItemViewDrawer
        item={null}
        prescription={null}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the seeded brand, strength and prescription context", async () => {
    const { prescription, phase, schedule, item } = fixture();
    await renderWithFixtures(
      <InventoryItemViewDrawer
        item={item}
        prescription={prescription}
        open
        onOpenChange={() => {}}
      />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item],
        },
      },
    );

    // The drawer title carries the brand + per-pill strength; the Details tab
    // body also names the brand, so /Norvasc/ legitimately matches twice.
    expect(await screen.findByText("Norvasc 5mg")).toBeInTheDocument();
    expect(screen.getByText(/For Amlodipine/)).toBeInTheDocument();
  });

  it("Details tab shows the effective phase, not a completed maintenance phase", async () => {
    const prescription = makePrescription({ genericName: "Amlodipine" });
    // The old lookup fell back to ANY maintenance phase, so it said
    // "Maintenance" here while the Stock tab and dose schedule used the
    // live active phase.
    const completed = makeMedicationPhase(prescription.id, { status: "completed" });
    const active = makeMedicationPhase(prescription.id, { type: "titration", status: "active" });
    const item = makeInventoryItem(prescription.id, { brandName: "Norvasc", strength: 5, unit: "mg" });
    await renderWithFixtures(
      <InventoryItemViewDrawer item={item} prescription={prescription} open onOpenChange={() => {}} />,
      { seed: { prescriptions: [prescription], medicationPhases: [completed, active], inventoryItems: [item] } },
    );

    expect(await screen.findByText("On titration")).toBeInTheDocument();
    expect(screen.queryByText("Maintenance")).not.toBeInTheDocument();
  });

  it("Stock tab surfaces the seeded current stock", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture();
    await renderWithFixtures(
      <InventoryItemViewDrawer
        item={item}
        prescription={prescription}
        open
        onOpenChange={() => {}}
      />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /stock/i }));
    // currentStock 42 is rendered as the headline number on the Stock tab.
    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText(/current stock/i)).toBeInTheDocument();
  });

  it("logging a refill writes a transaction to the database", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture();
    await renderWithFixtures(
      <InventoryItemViewDrawer
        item={item}
        prescription={prescription}
        open
        onOpenChange={() => {}}
      />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /stock/i }));
    // The refill field starts empty: Add stays disabled until an amount is typed.
    const addBtn = await screen.findByRole("button", { name: /add/i });
    expect(addBtn).toBeDisabled();
    await user.type(screen.getByLabelText(/refill amount/i), "28");
    await user.click(addBtn);

    await vi.waitFor(async () => {
      const txns = await db.inventoryTransactions
        .where("inventoryItemId")
        .equals(item.id)
        .toArray();
      expect(txns.some((t) => t.type === "refill" && t.amount === 28)).toBe(
        true,
      );
    });
  });

  it("Stock tab renders existing transaction history", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture();
    const txn = makeInventoryTransaction(item.id, {
      type: "refill",
      amount: 60,
      note: "Pharmacy pickup",
    });
    await renderWithFixtures(
      <InventoryItemViewDrawer
        item={item}
        prescription={prescription}
        open
        onOpenChange={() => {}}
      />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item],
          inventoryTransactions: [txn],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /stock/i }));
    expect(await screen.findByText("History")).toBeInTheDocument();
    expect(screen.getByText("Pharmacy pickup")).toBeInTheDocument();
  });

  it("Manage tab archives the medicine through the DB", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture({
      isActive: false,
    });
    await renderWithFixtures(
      <InventoryItemViewDrawer
        item={item}
        prescription={prescription}
        open
        onOpenChange={() => {}}
      />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /manage/i }));
    const archiveBtn = await screen.findByRole("button", { name: /^archive$/i });
    await user.click(archiveBtn);

    await vi.waitFor(async () => {
      const stored = await db.inventoryItems.get(item.id);
      expect(stored?.isArchived).toBe(true);
    });
  });

  it("Set count records the difference as a negative adjustment", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture({ currentStock: 35 });
    const initial = makeInventoryTransaction(item.id, { type: "initial", amount: 35 });
    await renderWithFixtures(
      <InventoryItemViewDrawer item={item} prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item],
          inventoryTransactions: [initial],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /stock/i }));
    await user.type(await screen.findByLabelText(/counted pills/i), "28");
    await user.click(screen.getByRole("button", { name: /set count/i }));

    await vi.waitFor(async () => {
      const txns = await db.inventoryTransactions.where("inventoryItemId").equals(item.id).toArray();
      expect(txns.some((t) => t.type === "adjusted" && t.amount === -7)).toBe(true);
      expect((await db.inventoryItems.get(item.id))?.currentStock).toBe(28);
    });
  });

  it("deleting a transaction offers an undo that restores it", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(showUndoToast).mockClear();
    const { prescription, phase, schedule, item } = fixture({ currentStock: 90 });
    const initial = makeInventoryTransaction(item.id, { type: "initial", amount: 30 });
    const refill = makeInventoryTransaction(item.id, { type: "refill", amount: 60 });
    await renderWithFixtures(
      <InventoryItemViewDrawer item={item} prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item],
          inventoryTransactions: [initial, refill],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /stock/i }));
    await user.click(await screen.findByRole("button", { name: /delete transaction/i }));

    await vi.waitFor(() => expect(showUndoToast).toHaveBeenCalled());
    expect((await db.inventoryItems.get(item.id))?.currentStock).toBe(30);

    vi.mocked(showUndoToast).mock.calls[0]![0].onUndo();
    await vi.waitFor(async () => {
      expect((await db.inventoryTransactions.get(refill.id))?.deletedAt).toBeNull();
      expect((await db.inventoryItems.get(item.id))?.currentStock).toBe(90);
    });
  });

  it("disables Save when a refill amount is cleared", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture();
    const refill = makeInventoryTransaction(item.id, { type: "refill", amount: 60 });
    await renderWithFixtures(
      <InventoryItemViewDrawer item={item} prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item],
          inventoryTransactions: [refill],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /stock/i }));
    await user.click(await screen.findByRole("button", { name: /edit transaction/i }));
    await user.clear(screen.getByLabelText(/transaction amount/i));
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("shows no supply estimate for a brand that is not active", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture({ isActive: false });
    const active = makeInventoryItem(prescription.id, { brandName: "Generic", isActive: true });
    await renderWithFixtures(
      <InventoryItemViewDrawer item={item} prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item, active],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /stock/i }));
    expect(await screen.findByText(/not deducted/i)).toBeInTheDocument();
    expect(screen.getByTestId("est-supply")).toHaveTextContent("—");
  });

  it("warns when the prescription has no active brand", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture({ isActive: false });
    await renderWithFixtures(
      <InventoryItemViewDrawer item={item} prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /stock/i }));
    expect(await screen.findByText(/no active brand/i)).toBeInTheDocument();
  });

  it("archiving the active brand hands active to the only other brand", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture({ isActive: true });
    const spare = makeInventoryItem(prescription.id, { brandName: "Generic", isActive: false });
    await renderWithFixtures(
      <InventoryItemViewDrawer item={item} prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item, spare],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /manage/i }));
    await user.click(await screen.findByRole("button", { name: /^archive$/i }));

    await vi.waitFor(async () => {
      expect((await db.inventoryItems.get(item.id))?.isArchived).toBe(true);
      expect((await db.inventoryItems.get(spare.id))?.isActive).toBe(true);
    });
  });

  it("archiving the active brand asks which of several brands takes over", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, item } = fixture({ isActive: true });
    const a = makeInventoryItem(prescription.id, { brandName: "Generic A", isActive: false });
    const b = makeInventoryItem(prescription.id, { brandName: "Generic B", isActive: false });
    await renderWithFixtures(
      <InventoryItemViewDrawer item={item} prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [item, a, b],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /manage/i }));
    await user.click(await screen.findByRole("button", { name: /^archive$/i }));
    await user.click(await screen.findByRole("button", { name: /generic b/i }));

    await vi.waitFor(async () => {
      expect((await db.inventoryItems.get(item.id))?.isArchived).toBe(true);
      expect((await db.inventoryItems.get(b.id))?.isActive).toBe(true);
      expect((await db.inventoryItems.get(a.id))?.isActive).toBe(false);
    });
  });
});
