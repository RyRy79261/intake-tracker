/**
 * Inventory service — stock recalculation from event-sourced transactions.
 *
 * Separate from medication-service.ts intentionally:
 *   - medication-service.ts: prescription/phase/schedule CRUD
 *   - inventory-service.ts: stock derivation from transactions
 */

import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit-service";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

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
