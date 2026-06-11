import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import {
  makePrescription,
  makeInventoryItem,
  makeInventoryTransaction,
} from "@/__tests__/fixtures/db-fixtures";
import {
  getCurrentStock,
  recalculateStockForItem,
  recalculateAllStock,
  getInventoryForPrescription,
  getActiveInventoryForPrescription,
  getAllInventoryItems,
  getAllActiveInventoryItems,
  getInventoryTransactions,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  adjustStock,
  updateInventoryTransaction,
  deleteInventoryTransaction,
  initStockRecalculation,
} from "@/lib/inventory-service";

describe("getCurrentStock", () => {
  it("returns sum of all transaction amounts for an item", async () => {
    const rx = makePrescription({ id: "rx-stock-1" });
    const item = makeInventoryItem(rx.id, { id: "item-stock-1" });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    await db.inventoryTransactions.bulkAdd([
      makeInventoryTransaction(item.id, { id: "txn-init", type: "initial", amount: 30 }),
      makeInventoryTransaction(item.id, { id: "txn-take-1", type: "consumed", amount: -1 }),
      makeInventoryTransaction(item.id, { id: "txn-take-2", type: "consumed", amount: -0.5 }),
    ]);

    const stock = await getCurrentStock(item.id);
    expect(stock).toBe(28.5);
  });

  it("returns 0 when no transactions exist", async () => {
    const rx = makePrescription({ id: "rx-empty-1" });
    const item = makeInventoryItem(rx.id, { id: "item-empty-1" });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    const stock = await getCurrentStock(item.id);
    expect(stock).toBe(0);
  });

  it("includes soft-deleted transactions in sum (no deletedAt filter)", async () => {
    const rx = makePrescription({ id: "rx-del-1" });
    const item = makeInventoryItem(rx.id, { id: "item-del-1" });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    await db.inventoryTransactions.bulkAdd([
      makeInventoryTransaction(item.id, { id: "txn-a", type: "initial", amount: 30 }),
      makeInventoryTransaction(item.id, {
        id: "txn-b",
        type: "consumed",
        amount: -1,
        deletedAt: Date.now(), // soft-deleted
      }),
    ]);

    // getCurrentStock sums ALL transactions (does not filter deletedAt)
    const stock = await getCurrentStock(item.id);
    expect(stock).toBe(29);
  });
});

describe("recalculateStockForItem", () => {
  it("returns derived stock and updates the cached currentStock field", async () => {
    const rx = makePrescription({ id: "rx-recalc-1" });
    const item = makeInventoryItem(rx.id, { id: "item-recalc-1", currentStock: 0 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    await db.inventoryTransactions.bulkAdd([
      makeInventoryTransaction(item.id, { id: "txn-r1", type: "initial", amount: 30 }),
      makeInventoryTransaction(item.id, { id: "txn-r2", type: "refill", amount: 10 }),
      makeInventoryTransaction(item.id, { id: "txn-r3", type: "consumed", amount: -2 }),
    ]);

    const result = await recalculateStockForItem(item.id);
    expect(result).toBe(38);

    // Verify the cached field was updated
    const updated = await db.inventoryItems.get(item.id);
    expect(updated!.currentStock).toBe(38);
  });
});

describe("recalculateAllStock", () => {
  it("processes all inventory items and reports drift", async () => {
    const rx = makePrescription({ id: "rx-all-1" });
    const item1 = makeInventoryItem(rx.id, { id: "item-all-1", currentStock: 99 });
    const item2 = makeInventoryItem(rx.id, { id: "item-all-2", currentStock: 0 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.bulkAdd([item1, item2]);

    await db.inventoryTransactions.bulkAdd([
      makeInventoryTransaction(item1.id, { id: "txn-all-1", type: "initial", amount: 30 }),
      makeInventoryTransaction(item2.id, { id: "txn-all-2", type: "initial", amount: 10 }),
    ]);

    const result = await recalculateAllStock();
    expect(result.updated).toBe(2);
    // item1 drifted: cached 99 vs derived 30
    // item2 drifted: cached 0 vs derived 10
    expect(result.drifted).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it("reports zero drift when cached values already match transactions", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 30 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    await db.inventoryTransactions.add(
      makeInventoryTransaction(item.id, { type: "initial", amount: 30 }),
    );

    const result = await recalculateAllStock();
    expect(result.updated).toBe(1);
    expect(result.drifted).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("writes a stock_recalculated audit log", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 5 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    await recalculateAllStock();

    const audits = await db.auditLogs.toArray();
    const recalc = audits.find((a) => a.action === "stock_recalculated");
    expect(recalc).toBeDefined();
    const details = JSON.parse(recalc!.details!);
    expect(details.totalItems).toBe(1);
  });
});

describe("getCurrentStock rounding", () => {
  it("rounds floating-point sums to 4 decimal places", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id);
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE-754
    await db.inventoryTransactions.bulkAdd([
      makeInventoryTransaction(item.id, { amount: 0.1 }),
      makeInventoryTransaction(item.id, { amount: 0.2 }),
    ]);

    expect(await getCurrentStock(item.id)).toBe(0.3);
  });
});

describe("adjustStock rounding", () => {
  it("rounds the resulting stock to 4 decimal places", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 0.1 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    const result = await adjustStock(item.id, 0.2);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(0.3);
  });

  it("writes an inventory_adjusted audit entry capturing the delta", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 10 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    await adjustStock(item.id, 5, "restocked");

    const audits = await db.auditLogs.toArray();
    const audit = audits.find((a) => a.action === "inventory_adjusted");
    expect(audit).toBeDefined();
    const details = JSON.parse(audit!.details!);
    expect(details.delta).toBe(5);
    expect(details.note).toBe("restocked");
  });
});

describe("initStockRecalculation", () => {
  it("fires recalculateAllStock without throwing and persists derived stock", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 999 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    await db.inventoryTransactions.add(
      makeInventoryTransaction(item.id, { type: "initial", amount: 12 }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Fire-and-forget — give the microtask chain time to settle.
    initStockRecalculation();
    await vi.waitFor(async () => {
      const updated = await db.inventoryItems.get(item.id);
      expect(updated!.currentStock).toBe(12);
    });

    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

describe("inventory reads", () => {
  it("getInventoryForPrescription returns only that prescription's items", async () => {
    const rxA = makePrescription();
    const rxB = makePrescription();
    await db.prescriptions.bulkAdd([rxA, rxB]);
    await db.inventoryItems.bulkAdd([
      makeInventoryItem(rxA.id),
      makeInventoryItem(rxA.id),
      makeInventoryItem(rxB.id),
    ]);

    const items = await getInventoryForPrescription(rxA.id);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.prescriptionId === rxA.id)).toBe(true);
  });

  it("getActiveInventoryForPrescription returns the active item only", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const active = makeInventoryItem(rx.id, { isActive: true });
    const inactive = makeInventoryItem(rx.id, { isActive: false });
    await db.inventoryItems.bulkAdd([inactive, active]);

    const found = await getActiveInventoryForPrescription(rx.id);
    expect(found!.id).toBe(active.id);
  });

  it("getActiveInventoryForPrescription returns undefined when none active", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(makeInventoryItem(rx.id, { isActive: false }));

    expect(await getActiveInventoryForPrescription(rx.id)).toBeUndefined();
  });

  it("getAllInventoryItems returns every item across prescriptions", async () => {
    const rxA = makePrescription();
    const rxB = makePrescription();
    await db.prescriptions.bulkAdd([rxA, rxB]);
    await db.inventoryItems.bulkAdd([
      makeInventoryItem(rxA.id),
      makeInventoryItem(rxB.id),
    ]);

    expect(await getAllInventoryItems()).toHaveLength(2);
  });

  it("getAllActiveInventoryItems filters out inactive items", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    await db.inventoryItems.bulkAdd([
      makeInventoryItem(rx.id, { isActive: true }),
      makeInventoryItem(rx.id, { isActive: false }),
    ]);

    const active = await getAllActiveInventoryItems();
    expect(active).toHaveLength(1);
    expect(active[0]!.isActive).toBe(true);
  });

  it("getInventoryTransactions returns newest-first", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id);
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    await db.inventoryTransactions.bulkAdd([
      makeInventoryTransaction(item.id, { timestamp: 1_000 }),
      makeInventoryTransaction(item.id, { timestamp: 3_000 }),
      makeInventoryTransaction(item.id, { timestamp: 2_000 }),
    ]);

    const txs = await getInventoryTransactions(item.id);
    expect(txs.map((t) => t.timestamp)).toEqual([3_000, 2_000, 1_000]);
  });
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

describe("addInventoryItem", () => {
  it("persists a new item with sync fields and an audit entry", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);

    const result = await addInventoryItem({
      prescriptionId: rx.id,
      brandName: "Lopressor",
      strength: 50,
      unit: "mg",
      pillShape: "round",
      pillColor: "#FFFFFF",
      refillAlertDays: 7,
      refillAlertPills: 14,
      isActive: true,
      isArchived: false,
      timezone: "UTC",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.id).toBeTruthy();
    expect(result.data.createdAt).toBeGreaterThan(0);

    const stored = await db.inventoryItems.get(result.data.id);
    expect(stored!.brandName).toBe("Lopressor");

    const audits = await db.auditLogs.toArray();
    expect(audits.some((a) => a.action === "inventory_added")).toBe(true);
  });
});

describe("updateInventoryItem", () => {
  it("updates fields, bumps updatedAt, and writes an audit entry", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { brandName: "Old", updatedAt: 1_000 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    const result = await updateInventoryItem(item.id, { brandName: "New" });
    expect(result.success).toBe(true);

    const updated = await db.inventoryItems.get(item.id);
    expect(updated!.brandName).toBe("New");
    expect(updated!.updatedAt).toBeGreaterThan(1_000);

    const audits = await db.auditLogs.toArray();
    const audit = audits.find((a) => a.action === "inventory_adjusted");
    expect(audit).toBeDefined();
    expect(JSON.parse(audit!.details!).updatedFields).toEqual(["brandName"]);
  });
});

describe("deleteInventoryItem", () => {
  it("soft-deletes the item and writes an audit entry", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id);
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    const result = await deleteInventoryItem(item.id);
    expect(result.success).toBe(true);

    const stored = await db.inventoryItems.get(item.id);
    expect(stored!.deletedAt).toBeGreaterThan(0);

    const audits = await db.auditLogs.toArray();
    expect(audits.some((a) => a.action === "inventory_deleted")).toBe(true);
  });
});

describe("adjustStock", () => {
  it("returns an error when the inventory item does not exist", async () => {
    const result = await adjustStock("missing-id", 5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("allows negative resulting stock (no clamp)", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 2 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    const result = await adjustStock(item.id, -5);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(-3);

    const updated = await db.inventoryItems.get(item.id);
    expect(updated!.currentStock).toBe(-3);
  });

  it("defaults the transaction type to 'refill' for positive deltas", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 10 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    await adjustStock(item.id, 5);

    const txs = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(item.id)
      .toArray();
    expect(txs[0]!.type).toBe("refill");
    expect(txs[0]!.amount).toBe(5);
  });

  it("honors an explicit transaction type and note", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 10 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    await adjustStock(item.id, -1, "manual count", "adjusted");

    const txs = await db.inventoryTransactions
      .where("inventoryItemId")
      .equals(item.id)
      .toArray();
    expect(txs[0]!.type).toBe("adjusted");
    expect(txs[0]!.note).toBe("manual count");
  });
});

describe("updateInventoryTransaction", () => {
  it("recalculates currentStock from the new amount", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 28 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    const t1 = makeInventoryTransaction(item.id, { type: "initial", amount: 30 });
    const t2 = makeInventoryTransaction(item.id, { type: "consumed", amount: -2 });
    await db.inventoryTransactions.bulkAdd([t1, t2]);

    const result = await updateInventoryTransaction(t2.id, { amount: -5 });
    expect(result.success).toBe(true);

    const updatedTx = await db.inventoryTransactions.get(t2.id);
    expect(updatedTx!.amount).toBe(-5);

    // 30 + (-5) = 25
    const updatedItem = await db.inventoryItems.get(item.id);
    expect(updatedItem!.currentStock).toBe(25);
  });

  it("excludes soft-deleted transactions from the recalculation", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 0 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    const t1 = makeInventoryTransaction(item.id, { type: "initial", amount: 30 });
    const t2 = makeInventoryTransaction(item.id, {
      type: "consumed",
      amount: -2,
      deletedAt: Date.now(),
    });
    await db.inventoryTransactions.bulkAdd([t1, t2]);

    await updateInventoryTransaction(t1.id, { note: "checked" });

    // Only t1 (30) counts; t2 is soft-deleted
    const updatedItem = await db.inventoryItems.get(item.id);
    expect(updatedItem!.currentStock).toBe(30);
  });

  it("returns an error when the transaction does not exist", async () => {
    const result = await updateInventoryTransaction("missing-tx", { amount: 1 });
    expect(result.success).toBe(false);
  });
});

describe("deleteInventoryTransaction", () => {
  it("soft-deletes the transaction and recalculates stock without it", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 28 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    const t1 = makeInventoryTransaction(item.id, { type: "initial", amount: 30 });
    const t2 = makeInventoryTransaction(item.id, { type: "consumed", amount: -2 });
    await db.inventoryTransactions.bulkAdd([t1, t2]);

    const result = await deleteInventoryTransaction(t2.id);
    expect(result.success).toBe(true);

    const deleted = await db.inventoryTransactions.get(t2.id);
    expect(deleted!.deletedAt).toBeGreaterThan(0);

    // Stock recalculated from t1 only
    const updatedItem = await db.inventoryItems.get(item.id);
    expect(updatedItem!.currentStock).toBe(30);
  });

  it("returns an error when the transaction does not exist", async () => {
    const result = await deleteInventoryTransaction("missing-tx");
    expect(result.success).toBe(false);
  });
});
