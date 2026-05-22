// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InventoryItemViewDrawer } from "@/components/medications/inventory-item-view-drawer";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
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
    // The refill amount input defaults to 30; the Add button commits it.
    const addBtn = await screen.findByRole("button", { name: /add/i });
    await user.click(addBtn);

    await vi.waitFor(async () => {
      const txns = await db.inventoryTransactions
        .where("inventoryItemId")
        .equals(item.id)
        .toArray();
      expect(txns.some((t) => t.type === "refill" && t.amount === 30)).toBe(
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
});
