/**
 * Inventory service — inventory items, transactions, and stock recalculation.
 *
 * Companion to prescription-service.ts (prescription CRUD) and
 * phase-service.ts (phase lifecycle).
 */

import { db, type InventoryItem, type InventoryTransaction } from "@/lib/db";
import { ok, err, type ServiceResult } from "@/lib/service-result";
import { syncFields } from "@/lib/utils";
import { buildAuditEntry, writeAuditLog } from "@/lib/audit-service";
import { buildTransaction } from "@/lib/medication-builders";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getInventoryForPrescription(prescriptionId: string): Promise<InventoryItem[]> {
  return db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
}

export async function getActiveInventoryForPrescription(prescriptionId: string): Promise<InventoryItem | undefined> {
  const items = await db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
  return items.find(i => i.isActive === true);
}

export async function getAllInventoryItems(): Promise<InventoryItem[]> {
  return db.inventoryItems.toArray();
}

export async function getAllActiveInventoryItems(): Promise<InventoryItem[]> {
  const all = await db.inventoryItems.toArray();
  return all.filter(i => i.isActive === true);
}

export async function getInventoryTransactions(inventoryItemId: string): Promise<InventoryTransaction[]> {
  // Dexie's sortBy() materialises and overrides any prior reverse(),
  // so reverse the resulting array instead to get newest-first.
  const transactions = await db.inventoryTransactions
    .where("inventoryItemId")
    .equals(inventoryItemId)
    .sortBy("timestamp");
  return transactions.reverse();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function addInventoryItem(input: Omit<InventoryItem, "id" | "createdAt" | "updatedAt" | "deletedAt" | "deviceId">): Promise<ServiceResult<InventoryItem>> {
  try {
    const item: InventoryItem = {
      ...input,
      id: crypto.randomUUID(),
      ...syncFields(),
    };
    await db.transaction("rw", [db.inventoryItems, db.auditLogs], async () => {
      await db.inventoryItems.add(item);
      await db.auditLogs.add(buildAuditEntry("inventory_added", {
        inventoryItemId: item.id,
        prescriptionId: item.prescriptionId,
        brandName: item.brandName,
        strength: item.strength,
      }));
    });
    return ok(item);
  } catch (e) {
    return err("Failed to add inventory item", e);
  }
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<Omit<InventoryItem, "id" | "createdAt" | "prescriptionId">>,
): Promise<ServiceResult<void>> {
  try {
    await db.transaction("rw", [db.inventoryItems, db.auditLogs], async () => {
      await db.inventoryItems.update(id, { ...updates, updatedAt: Date.now() });
      await db.auditLogs.add(buildAuditEntry("inventory_adjusted", {
        inventoryItemId: id,
        updatedFields: Object.keys(updates),
      }));
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update inventory item", e);
  }
}

export async function deleteInventoryItem(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction("rw", [db.inventoryItems, db.auditLogs, db._syncQueue], async () => {
      await db.inventoryItems.update(id, { deletedAt: now, updatedAt: now });
      await enqueueInsideTx("inventoryItems", id, "delete");

      const audit = buildAuditEntry("inventory_deleted", {
        inventoryItemId: id,
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete inventory item", e);
  }
}

export async function adjustStock(
  inventoryItemId: string,
  delta: number,
  note?: string,
  type?: "refill" | "consumed" | "adjusted",
): Promise<ServiceResult<number>> {
  try {
    const item = await db.inventoryItems.get(inventoryItemId);
    if (!item) return err(`InventoryItem ${inventoryItemId} not found`);
    const currentStock = item.currentStock ?? 0;
    // Negative stock allowed per user decision — no Math.max(0, ...) clamp
    const newStock = Math.round((currentStock + delta) * 10000) / 10000;
    const now = Date.now();

    await db.transaction("rw", [db.inventoryItems, db.inventoryTransactions, db.auditLogs], async () => {
      await db.inventoryItems.update(inventoryItemId, { currentStock: newStock, updatedAt: now });
      await db.inventoryTransactions.add(buildTransaction(
        inventoryItemId,
        delta,
        type ?? (delta > 0 ? "refill" : "consumed"),
        now,
        note,
      ));
      await db.auditLogs.add(buildAuditEntry("inventory_adjusted", {
        inventoryItemId,
        delta,
        newStock,
        ...(note !== undefined && { note }),
      }));
    });

    return ok(newStock);
  } catch (e) {
    return err("Failed to adjust stock", e);
  }
}

export async function updateInventoryTransaction(
  id: string,
  updates: { amount?: number; note?: string },
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction("rw", [db.inventoryTransactions, db.inventoryItems, db.auditLogs], async () => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      await db.inventoryTransactions.update(id, { ...updates, updatedAt: now });

      // Recalculate currentStock from all non-deleted transactions
      const allTxs = await db.inventoryTransactions
        .where("inventoryItemId")
        .equals(tx.inventoryItemId)
        .toArray();
      const newStock = allTxs
        .filter(t => t.deletedAt === null)
        .reduce((sum, t) => {
          const amount = t.id === id && updates.amount !== undefined ? updates.amount : t.amount;
          return sum + amount;
        }, 0);

      await db.inventoryItems.update(tx.inventoryItemId, {
        currentStock: Math.round(newStock * 10000) / 10000,
        updatedAt: now,
      });

      await db.auditLogs.add(buildAuditEntry("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_updated",
        updatedFields: Object.keys(updates),
      }));
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to update inventory transaction", e);
  }
}

export async function deleteInventoryTransaction(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction("rw", [db.inventoryTransactions, db.inventoryItems, db.auditLogs], async () => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      // Soft-delete
      await db.inventoryTransactions.update(id, { deletedAt: now, updatedAt: now });

      // Recalculate currentStock from all non-deleted transactions (excluding this one)
      const allTxs = await db.inventoryTransactions
        .where("inventoryItemId")
        .equals(tx.inventoryItemId)
        .toArray();
      const newStock = allTxs
        .filter(t => t.deletedAt === null && t.id !== id)
        .reduce((sum, t) => sum + t.amount, 0);

      await db.inventoryItems.update(tx.inventoryItemId, {
        currentStock: Math.round(newStock * 10000) / 10000,
        updatedAt: now,
      });

      await db.auditLogs.add(buildAuditEntry("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_deleted",
      }));
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to delete inventory transaction", e);
  }
}

// ---------------------------------------------------------------------------
// Stock derivation / recalculation
// ---------------------------------------------------------------------------

/**
 * Derive current stock for an inventory item by summing all its transactions.
 * Does NOT update the cached currentStock field — read-only derivation.
 */
export async function getCurrentStock(inventoryItemId: string): Promise<number> {
  const transactions = await db.inventoryTransactions
    .where("inventoryItemId")
    .equals(inventoryItemId)
    .toArray();

  const sum = transactions.reduce((acc, tx) => acc + tx.amount, 0);
  return Math.round(sum * 10000) / 10000;
}

/**
 * Recalculate and persist stock for a single inventory item.
 * Derives from transactions, then updates the cached currentStock field.
 */
export async function recalculateStockForItem(inventoryItemId: string): Promise<number> {
  const derivedValue = await getCurrentStock(inventoryItemId);
  await db.transaction("rw", [db.inventoryItems, db._syncQueue], async () => {
    await db.inventoryItems.update(inventoryItemId, {
      currentStock: derivedValue,
      updatedAt: Date.now(),
    });
    await enqueueInsideTx("inventoryItems", inventoryItemId, "upsert");
  });
  schedulePush();
  return derivedValue;
}

/**
 * Recalculate stock for ALL inventory items. Tracks drift between cached
 * and derived values. Writes audit log with summary.
 */
export async function recalculateAllStock(): Promise<{
  updated: number;
  drifted: number;
  items: Array<{ id: string; brandName: string; oldStock: number; newStock: number }>;
}> {
  const allItems = await db.inventoryItems.toArray();
  const driftedItems: Array<{ id: string; brandName: string; oldStock: number; newStock: number }> = [];
  let updated = 0;

  for (const item of allItems) {
    const newStock = await getCurrentStock(item.id);
    const oldStock = item.currentStock ?? 0;

    await db.transaction("rw", [db.inventoryItems, db._syncQueue], async () => {
      await db.inventoryItems.update(item.id, {
        currentStock: newStock,
        updatedAt: Date.now(),
      });
      await enqueueInsideTx("inventoryItems", item.id, "upsert");
    });
    updated++;

    if (Math.abs(oldStock - newStock) > 0.001) {
      driftedItems.push({
        id: item.id,
        brandName: item.brandName,
        oldStock,
        newStock,
      });
    }
  }

  schedulePush();

  await writeAuditLog("stock_recalculated", {
    totalItems: updated,
    driftedCount: driftedItems.length,
    driftedItems: driftedItems.map((d) => ({
      id: d.id,
      brandName: d.brandName,
      oldStock: d.oldStock,
      newStock: d.newStock,
    })),
  });

  return { updated, drifted: driftedItems.length, items: driftedItems };
}

/**
 * Fire-and-forget stock recalculation on app launch.
 * Does NOT block app startup.
 */
export function initStockRecalculation(): void {
  recalculateAllStock()
    .then((result) => {
      console.log(
        `[inventory-service] Stock recalculated: ${result.updated} items, ${result.drifted} drifted`,
      );
      if (result.drifted > 0) {
        console.log(
          "[inventory-service] Drifted items:",
          result.items.map(
            (i) => `${i.brandName}: ${i.oldStock} -> ${i.newStock}`,
          ),
        );
      }
    })
    .catch((error) => {
      console.error("[inventory-service] Stock recalculation failed:", error);
    });
}
