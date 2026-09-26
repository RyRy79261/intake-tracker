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
  deriveStock,
  isActiveBrand,
  setActiveBrand,
  archiveInventoryItem,
  setStockCount,
  restoreInventoryTransaction,
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

  it("excludes soft-deleted transactions from the sum", async () => {
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

    // The soft-deleted -1 no longer counts: a deleted row must not come back.
    const stock = await getCurrentStock(item.id);
    expect(stock).toBe(30);
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
    expect(result.checked).toBe(2);
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
    expect(result.checked).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.drifted).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("leaves undrifted items, the sync queue and the audit log untouched", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 30, updatedAt: 1_000 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    await db.inventoryTransactions.add(
      makeInventoryTransaction(item.id, { type: "initial", amount: 30 }),
    );

    await recalculateAllStock();

    const stored = await db.inventoryItems.get(item.id);
    expect(stored!.updatedAt).toBe(1_000);
    expect(await db._syncQueue.count()).toBe(0);
    const audits = await db.auditLogs.toArray();
    expect(audits.some((a) => a.action === "stock_recalculated")).toBe(false);
  });

  it("does not add a deleted refill back into stock on the launch recount", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 30 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);
    await db.inventoryTransactions.add(
      makeInventoryTransaction(item.id, { type: "initial", amount: 30 }),
    );

    const refill = await adjustStock(item.id, 100, undefined, "refill");
    expect(refill.success).toBe(true);
    const refillTx = (await db.inventoryTransactions.toArray()).find((t) => t.amount === 100)!;
    await deleteInventoryTransaction(refillTx.id);
    expect((await db.inventoryItems.get(item.id))!.currentStock).toBe(30);

    await recalculateAllStock();
    expect((await db.inventoryItems.get(item.id))!.currentStock).toBe(30);
  });

  it("skips soft-deleted inventory items", async () => {
    const rx = makePrescription();
    const item = makeInventoryItem(rx.id, { currentStock: 99, deletedAt: 5_000, updatedAt: 5_000 });
    await db.prescriptions.add(rx);
    await db.inventoryItems.add(item);

    const result = await recalculateAllStock();
    expect(result.checked).toBe(0);
    expect((await db.inventoryItems.get(item.id))!.updatedAt).toBe(5_000);
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
    await db.inventoryTransactions.add(makeInventoryTransaction(item.id, { amount: 0.1 }));

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
    await db.inventoryTransactions.add(makeInventoryTransaction(item.id, { amount: 2 }));

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

// ---------------------------------------------------------------------------
// Audit 2026-09: one stock derivation, live-only readers, brand switching
// ---------------------------------------------------------------------------

async function seedItem(overrides = {}, stock = 30) {
  const rx = makePrescription();
  const item = makeInventoryItem(rx.id, { currentStock: stock, ...overrides });
  await db.prescriptions.add(rx);
  await db.inventoryItems.add(item);
  if (stock !== 0) {
    await db.inventoryTransactions.add(
      makeInventoryTransaction(item.id, { type: "initial", amount: stock }),
    );
  }
  return { rx, item };
}

describe("deriveStock", () => {
  it("treats a transaction with no deletedAt key (pulled row) as live", async () => {
    const { item } = await seedItem();
    const pulled = makeInventoryTransaction(item.id, { type: "refill", amount: 10 });
    delete (pulled as { deletedAt?: unknown }).deletedAt;
    await db.inventoryTransactions.add(pulled);

    expect(await deriveStock(item.id)).toBe(40);
  });
});

describe("adjustStock derives from the ledger", () => {
  it("keeps currentStock equal to the transaction sum under concurrent refills", async () => {
    const { item } = await seedItem({}, 10);

    await Promise.all([adjustStock(item.id, 30), adjustStock(item.id, 30)]);

    const stored = await db.inventoryItems.get(item.id);
    expect(stored!.currentStock).toBe(70);
    expect(await deriveStock(item.id)).toBe(70);
  });

  it("rejects a non-finite delta", async () => {
    const { item } = await seedItem();
    expect((await adjustStock(item.id, Number.NaN)).success).toBe(false);
    expect(await db.inventoryTransactions.count()).toBe(1);
  });

  it("rejects a non-positive refill and a zero adjustment", async () => {
    const { item } = await seedItem();
    expect((await adjustStock(item.id, -3, undefined, "refill")).success).toBe(false);
    expect((await adjustStock(item.id, 0, undefined, "adjusted")).success).toBe(false);
    expect(await db.inventoryTransactions.count()).toBe(1);
  });
});

describe("setStockCount", () => {
  it("records the difference to the counted value as one 'adjusted' transaction", async () => {
    const { item } = await seedItem({}, 35);

    const result = await setStockCount(item.id, 28, "Counted the box");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(28);

    const txs = await db.inventoryTransactions.where("inventoryItemId").equals(item.id).toArray();
    const adjustment = txs.find((t) => t.type === "adjusted");
    expect(adjustment!.amount).toBe(-7);
    expect(adjustment!.note).toBe("Counted the box");
    expect((await db.inventoryItems.get(item.id))!.currentStock).toBe(28);
  });

  it("counts against the ledger, not a drifted cache", async () => {
    const { item } = await seedItem({ currentStock: 99 }, 20);

    await setStockCount(item.id, 25);

    const txs = await db.inventoryTransactions.where("inventoryItemId").equals(item.id).toArray();
    expect(txs.find((t) => t.type === "adjusted")!.amount).toBe(5);
    expect((await db.inventoryItems.get(item.id))!.currentStock).toBe(25);
  });

  it("writes nothing when the count already matches", async () => {
    const { item } = await seedItem({}, 20);
    const result = await setStockCount(item.id, 20);
    expect(result.success).toBe(true);
    expect(await db.inventoryTransactions.count()).toBe(1);
  });

  it("rejects a negative or non-finite count", async () => {
    const { item } = await seedItem({}, 20);
    expect((await setStockCount(item.id, -1)).success).toBe(false);
    expect((await setStockCount(item.id, Number.NaN)).success).toBe(false);
  });
});

describe("updateInventoryTransaction validation", () => {
  async function seedRefill(amount = 30) {
    const { item } = await seedItem({}, 10);
    const refill = makeInventoryTransaction(item.id, { type: "refill", amount, note: "pharmacy" });
    await db.inventoryTransactions.add(refill);
    await db.inventoryItems.update(item.id, { currentStock: 10 + amount });
    return { item, refill };
  }

  it("rejects a refill edited to zero, a negative or a non-finite amount", async () => {
    const { item, refill } = await seedRefill();
    for (const amount of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await updateInventoryTransaction(refill.id, { amount });
      expect(result.success).toBe(false);
    }
    expect((await db.inventoryTransactions.get(refill.id))!.amount).toBe(30);
    expect((await db.inventoryItems.get(item.id))!.currentStock).toBe(40);
  });

  it("rejects an adjustment edited to zero but allows a negative one", async () => {
    const { item } = await seedItem({}, 10);
    const adj = makeInventoryTransaction(item.id, { type: "adjusted", amount: -2 });
    await db.inventoryTransactions.add(adj);

    expect((await updateInventoryTransaction(adj.id, { amount: 0 })).success).toBe(false);
    expect((await updateInventoryTransaction(adj.id, { amount: -4 })).success).toBe(true);
    expect((await db.inventoryItems.get(item.id))!.currentStock).toBe(6);
  });

  it("clears the note when given an empty note", async () => {
    const { refill } = await seedRefill();
    const result = await updateInventoryTransaction(refill.id, { note: "" });
    expect(result.success).toBe(true);
    const stored = await db.inventoryTransactions.get(refill.id);
    expect(stored!.note || undefined).toBeUndefined();
    // The key must survive in the row: push sends the row as-is and the
    // server upsert only overwrites columns present in it (sanitizeRow maps
    // "" to NULL). A removed key would leave the old note on the server and
    // the next pull would bring it back.
    expect(stored).toHaveProperty("note");
  });

  it("does not rewrite the item on a note-only edit when stock is in sync", async () => {
    const { item, refill } = await seedRefill();
    await db.inventoryItems.update(item.id, { updatedAt: 1_000 });

    await updateInventoryTransaction(refill.id, { note: "new note" });

    expect((await db.inventoryItems.get(item.id))!.updatedAt).toBe(1_000);
  });
});

describe("restoreInventoryTransaction", () => {
  it("undoes a delete and restores the stock", async () => {
    const { item } = await seedItem({}, 10);
    await adjustStock(item.id, 30, undefined, "refill");
    const refill = (await db.inventoryTransactions.toArray()).find((t) => t.amount === 30)!;

    await deleteInventoryTransaction(refill.id);
    expect((await db.inventoryItems.get(item.id))!.currentStock).toBe(10);

    const result = await restoreInventoryTransaction(refill.id);
    expect(result.success).toBe(true);
    expect((await db.inventoryTransactions.get(refill.id))!.deletedAt).toBeNull();
    expect((await db.inventoryItems.get(item.id))!.currentStock).toBe(40);

    const queued = await db._syncQueue
      .where("[tableName+recordId]")
      .equals(["inventoryTransactions", refill.id])
      .first();
    expect(queued!.op).toBe("upsert");
  });
});

describe("live-only inventory readers", () => {
  it("hide soft-deleted items and transactions", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const live = makeInventoryItem(rx.id, { isActive: false });
    const deleted = makeInventoryItem(rx.id, { isActive: true, deletedAt: 5_000 });
    await db.inventoryItems.bulkAdd([live, deleted]);
    await db.inventoryTransactions.bulkAdd([
      makeInventoryTransaction(live.id, { amount: 5 }),
      makeInventoryTransaction(live.id, { amount: 7, deletedAt: 5_000 }),
    ]);

    expect((await getInventoryForPrescription(rx.id)).map((i) => i.id)).toEqual([live.id]);
    expect((await getAllInventoryItems()).map((i) => i.id)).toEqual([live.id]);
    expect(await getAllActiveInventoryItems()).toHaveLength(0);
    expect(await getActiveInventoryForPrescription(rx.id)).toBeUndefined();
    expect((await getInventoryTransactions(live.id)).map((t) => t.amount)).toEqual([5]);
  });

  it("getActiveInventoryForPrescription skips an archived brand", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const archived = makeInventoryItem(rx.id, { isActive: true, isArchived: true });
    const current = makeInventoryItem(rx.id, { isActive: true });
    await db.inventoryItems.bulkAdd([archived, current]);

    expect((await getActiveInventoryForPrescription(rx.id))!.id).toBe(current.id);
  });

  it("isActiveBrand requires live, active and not archived", () => {
    const base = makeInventoryItem("rx");
    expect(isActiveBrand(base)).toBe(true);
    expect(isActiveBrand({ ...base, isActive: false })).toBe(false);
    expect(isActiveBrand({ ...base, isArchived: true })).toBe(false);
    expect(isActiveBrand({ ...base, deletedAt: 1 })).toBe(false);
  });

  it("deleteInventoryItem clears isActive", async () => {
    const { item } = await seedItem();
    await deleteInventoryItem(item.id);
    expect((await db.inventoryItems.get(item.id))!.isActive).toBe(false);
  });
});

describe("setActiveBrand", () => {
  it("activates the target and deactivates every other brand in one step", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const a = makeInventoryItem(rx.id, { isActive: true });
    const b = makeInventoryItem(rx.id, { isActive: true });
    const c = makeInventoryItem(rx.id, { isActive: false });
    await db.inventoryItems.bulkAdd([a, b, c]);

    const result = await setActiveBrand(rx.id, c.id);
    expect(result.success).toBe(true);

    const items = await db.inventoryItems.where("prescriptionId").equals(rx.id).toArray();
    expect(items.filter((i) => i.isActive).map((i) => i.id)).toEqual([c.id]);
    for (const id of [a.id, b.id, c.id]) {
      const queued = await db._syncQueue
        .where("[tableName+recordId]")
        .equals(["inventoryItems", id])
        .first();
      expect(queued).toBeDefined();
    }
  });

  it("rejects an archived, deleted or foreign item without changing anything", async () => {
    const rx = makePrescription();
    const other = makePrescription();
    await db.prescriptions.bulkAdd([rx, other]);
    const active = makeInventoryItem(rx.id, { isActive: true });
    const archived = makeInventoryItem(rx.id, { isActive: false, isArchived: true });
    const deleted = makeInventoryItem(rx.id, { isActive: false, deletedAt: 1 });
    const foreign = makeInventoryItem(other.id, { isActive: false });
    await db.inventoryItems.bulkAdd([active, archived, deleted, foreign]);

    for (const id of [archived.id, deleted.id, foreign.id, "missing"]) {
      expect((await setActiveBrand(rx.id, id)).success).toBe(false);
    }
    expect((await db.inventoryItems.get(active.id))!.isActive).toBe(true);
  });
});

describe("archiveInventoryItem", () => {
  it("auto-promotes the only other brand when archiving the active one", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const a = makeInventoryItem(rx.id, { isActive: true });
    const b = makeInventoryItem(rx.id, { isActive: false });
    await db.inventoryItems.bulkAdd([a, b]);

    const result = await archiveInventoryItem(a.id);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.promotedId).toBe(b.id);

    const storedA = await db.inventoryItems.get(a.id);
    expect(storedA!.isArchived).toBe(true);
    expect(storedA!.isActive).toBe(false);
    expect((await db.inventoryItems.get(b.id))!.isActive).toBe(true);
  });

  it("requires a replacement when several brands could take over", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const a = makeInventoryItem(rx.id, { isActive: true });
    const b = makeInventoryItem(rx.id, { isActive: false });
    const c = makeInventoryItem(rx.id, { isActive: false });
    await db.inventoryItems.bulkAdd([a, b, c]);

    const refused = await archiveInventoryItem(a.id);
    expect(refused.success).toBe(false);
    expect((await db.inventoryItems.get(a.id))!.isArchived).toBe(false);

    const result = await archiveInventoryItem(a.id, c.id);
    expect(result.success).toBe(true);
    expect((await db.inventoryItems.get(c.id))!.isActive).toBe(true);
    expect((await db.inventoryItems.get(b.id))!.isActive).toBe(false);
  });

  it("archives the last brand and leaves no active brand", async () => {
    const { item } = await seedItem();
    const result = await archiveInventoryItem(item.id);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.promotedId).toBeNull();
    const stored = await db.inventoryItems.get(item.id);
    expect(stored!.isArchived).toBe(true);
    expect(stored!.isActive).toBe(false);
  });

  it("archives an inactive brand without touching the active one", async () => {
    const rx = makePrescription();
    await db.prescriptions.add(rx);
    const a = makeInventoryItem(rx.id, { isActive: true });
    const b = makeInventoryItem(rx.id, { isActive: false });
    await db.inventoryItems.bulkAdd([a, b]);

    await archiveInventoryItem(b.id);
    expect((await db.inventoryItems.get(a.id))!.isActive).toBe(true);
    expect((await db.inventoryItems.get(b.id))!.isArchived).toBe(true);
  });
});
