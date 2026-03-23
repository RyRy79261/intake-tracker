import { describe, it, expect } from "vitest";
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
});
