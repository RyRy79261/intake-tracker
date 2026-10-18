/**
 * Inventory service — inventory items, transactions, and stock recalculation.
 *
 * Companion to prescription-service.ts (prescription CRUD) and
 * phase-service.ts (phase lifecycle).
 *
 * Stock is the signed sum of an item's live transactions (`deriveStock`).
 * `currentStock` on the item is a synced cache of that sum: every write here
 * recomputes it from the ledger inside the same transaction, and only touches
 * the item when the value actually changed.
 */

import { db, type InventoryItem, type InventoryTransaction } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import { isLive } from "@intake/core/lifecycle";
import type { ServiceResult } from "@intake/types/service";
import { syncFields } from "@/lib/utils";
import { writeAuditLog } from "@/lib/audit-service";
import { buildTransaction } from "@/lib/medication-builders";
import { syncedWrite, type SyncedWriter, type SyncedChanges } from "@/lib/synced-write";

/** A rule violation whose message is safe to show the user as-is. */
class InventoryRuleError extends Error {}

function failure<T>(fallback: string, e: unknown): ServiceResult<T> {
  return e instanceof InventoryRuleError ? err(e.message) : err(fallback, e);
}

function roundStock(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * The brand doses are deducted from: live, flagged active and not archived.
 * Shared by every reader that resolves "the active brand".
 */
export function isActiveBrand(
  item: Pick<InventoryItem, "isActive" | "isArchived" | "deletedAt">,
): boolean {
  return isLive(item) && item.isActive === true && !item.isArchived;
}

/**
 * Validate a transaction amount for its type: always finite, a refill must
 * add pills, and an adjustment must change something (either sign).
 */
function assertValidAmount(type: InventoryTransaction["type"], amount: number): void {
  if (!Number.isFinite(amount)) throw new InventoryRuleError("Amount must be a number");
  if (type === "refill" && amount <= 0) throw new InventoryRuleError("A refill must add pills");
  if (type === "adjusted" && amount === 0) throw new InventoryRuleError("An adjustment cannot be zero");
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getInventoryForPrescription(prescriptionId: string): Promise<InventoryItem[]> {
  const items = await db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
  return items.filter(isLive);
}

export async function getActiveInventoryForPrescription(prescriptionId: string): Promise<InventoryItem | undefined> {
  const items = await db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
  return items.find(isActiveBrand);
}

export async function getAllInventoryItems(): Promise<InventoryItem[]> {
  const all = await db.inventoryItems.toArray();
  return all.filter(isLive);
}

export async function getAllActiveInventoryItems(): Promise<InventoryItem[]> {
  const all = await db.inventoryItems.toArray();
  return all.filter(isActiveBrand);
}

export async function getInventoryTransactions(inventoryItemId: string): Promise<InventoryTransaction[]> {
  // Dexie's sortBy() materialises and overrides any prior reverse(),
  // so reverse the resulting array instead to get newest-first.
  const transactions = await db.inventoryTransactions
    .where("inventoryItemId")
    .equals(inventoryItemId)
    .sortBy("timestamp");
  return transactions.filter(isLive).reverse();
}

// ---------------------------------------------------------------------------
// Stock derivation
// ---------------------------------------------------------------------------

/**
 * The one stock derivation: the signed sum of the item's live transactions,
 * rounded to 4 decimals. Read-only. Inside a Dexie transaction it reads
 * through that transaction, so callers must include `inventoryTransactions`
 * in their scope.
 */
export async function deriveStock(inventoryItemId: string): Promise<number> {
  const transactions = await db.inventoryTransactions
    .where("inventoryItemId")
    .equals(inventoryItemId)
    .toArray();
  return roundStock(transactions.filter(isLive).reduce((acc, tx) => acc + tx.amount, 0));
}

/** Alias of `deriveStock`, kept for existing callers (debug panel). */
export async function getCurrentStock(inventoryItemId: string): Promise<number> {
  return deriveStock(inventoryItemId);
}

/**
 * Re-derive an item's stock and write it to the `currentStock` cache — but
 * only when it differs, so an in-sync item keeps its `updatedAt` and isn't
 * re-pushed (a fresh `updatedAt` would win LWW over other devices).
 *
 * Runs inside a synced write over inventoryItems and inventoryTransactions.
 */
async function refreshCachedStock(
  w: SyncedWriter,
  item: InventoryItem,
): Promise<{ stock: number; previous: number; changed: boolean }> {
  const stock = await deriveStock(item.id);
  const previous = item.currentStock ?? 0;
  const changed = item.currentStock === undefined || roundStock(previous) !== stock;
  if (changed) {
    await w.patch("inventoryItems", item.id, { currentStock: stock });
  }
  return { stock, previous, changed };
}

async function getItemOrThrow(id: string): Promise<InventoryItem> {
  const item = await db.inventoryItems.get(id);
  if (!item) throw new InventoryRuleError(`InventoryItem ${id} not found`);
  return item;
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
    await syncedWrite(["inventoryItems"], async (w) => {
      await w.insert("inventoryItems", item);

      await w.audit("inventory_added", {
        inventoryItemId: item.id,
        prescriptionId: item.prescriptionId,
        brandName: item.brandName,
        strength: item.strength,
      });
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
    await syncedWrite(["inventoryItems"], async (w) => {
      await w.patch("inventoryItems", id, { ...updates });

      await w.audit("inventory_adjusted", {
        inventoryItemId: id,
        updatedFields: Object.keys(updates),
      });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update inventory item", e);
  }
}

export async function deleteInventoryItem(id: string): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["inventoryItems"], async (w) => {
      // A tombstone is never the active brand: the synced write switches
      // isActive off as it tombstones the row.
      await w.tombstone("inventoryItems", id);

      await w.audit("inventory_deleted", {
        inventoryItemId: id,
      });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete inventory item", e);
  }
}

/**
 * Make `itemId` the prescription's only active brand, deactivating every
 * other brand in the same transaction so a crash or closed tab can't leave
 * zero or two active brands behind.
 */
export async function setActiveBrand(
  prescriptionId: string,
  itemId: string,
): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["inventoryItems"], async (w) => {
      const siblings = await db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
      const target = siblings.find((i) => i.id === itemId);
      if (!target || !isLive(target)) throw new InventoryRuleError("Brand not found");
      if (target.isArchived) throw new InventoryRuleError("Unarchive this brand before making it active");

      const previous: string[] = [];
      for (const sibling of siblings) {
        if (sibling.id === itemId || !sibling.isActive) continue;
        await w.patch("inventoryItems", sibling.id, { isActive: false });
        previous.push(sibling.id);
      }
      if (!target.isActive) {
        await w.patch("inventoryItems", itemId, { isActive: true });
      }

      await w.audit("inventory_adjusted", {
        inventoryItemId: itemId,
        prescriptionId,
        action: "active_brand_set",
        deactivated: previous,
      });
    });
    return ok(undefined);
  } catch (e) {
    return failure("Failed to set active brand", e);
  }
}

/**
 * Archive a brand. Archiving the active brand hands "active" to a
 * replacement in the same transaction: `replacementId` when given, otherwise
 * the only other live, unarchived brand. With several candidates and no
 * choice it refuses; with none, the prescription is left without an active
 * brand (the card warns about that).
 */
export async function archiveInventoryItem(
  id: string,
  replacementId?: string,
): Promise<ServiceResult<{ promotedId: string | null }>> {
  try {
    let promotedId: string | null = null;
    await syncedWrite(["inventoryItems"], async (w) => {
      const item = await getItemOrThrow(id);
      if (!isLive(item)) throw new InventoryRuleError("Brand not found");

      if (item.isActive) {
        const candidates = (
          await db.inventoryItems.where("prescriptionId").equals(item.prescriptionId).toArray()
        ).filter((i) => i.id !== id && isLive(i) && !i.isArchived);

        let replacement: InventoryItem | undefined;
        if (replacementId !== undefined) {
          replacement = candidates.find((i) => i.id === replacementId);
          if (!replacement) throw new InventoryRuleError("Choose another unarchived brand to use instead");
        } else if (candidates.length === 1) {
          replacement = candidates[0];
        } else if (candidates.length > 1) {
          throw new InventoryRuleError("Choose which brand to use instead");
        }

        if (replacement) {
          for (const other of candidates) {
            const shouldBeActive = other.id === replacement.id;
            if (other.isActive === shouldBeActive) continue;
            await w.patch("inventoryItems", other.id, { isActive: shouldBeActive });
          }
          promotedId = replacement.id;
        }
      }

      await w.patch("inventoryItems", id, { isArchived: true, isActive: false });

      await w.audit("inventory_adjusted", {
        inventoryItemId: id,
        action: "archived",
        promotedId,
      });
    });
    return ok({ promotedId });
  } catch (e) {
    return failure("Failed to archive inventory item", e);
  }
}

/**
 * Append a stock transaction and refresh the cached stock from the ledger,
 * all inside one rw transaction (no read-modify-write race). Returns the new
 * derived stock.
 */
/** Slack for an "occurred at" time taken from a date picker a moment ago. */
const FUTURE_OCCURRED_AT_GRACE_MS = 60 * 1000;

/**
 * Add a stock movement. `occurredAt` backdates it (a refill collected
 * earlier); it defaults to now and may not lie in the future. Only the
 * transaction's `timestamp` is backdated: stock is the sum of amounts, so the
 * date never changes it, and the sync metadata still records the write time.
 */
export async function adjustStock(
  inventoryItemId: string,
  delta: number,
  note?: string,
  type?: "refill" | "consumed" | "adjusted",
  occurredAt?: number,
): Promise<ServiceResult<number>> {
  try {
    const txType = type ?? (delta > 0 ? "refill" : "consumed");
    assertValidAmount(txType, delta);
    const now = Date.now();
    if (occurredAt !== undefined) {
      if (!Number.isFinite(occurredAt)) throw new InventoryRuleError("Invalid date");
      if (occurredAt > now + FUTURE_OCCURRED_AT_GRACE_MS) {
        throw new InventoryRuleError("A stock change cannot be dated in the future");
      }
    }
    let newStock = 0;

    await syncedWrite(["inventoryItems", "inventoryTransactions"], async (w) => {
      const item = await getItemOrThrow(inventoryItemId);

      const transaction = {
        ...buildTransaction(inventoryItemId, delta, txType, now, note),
        timestamp: occurredAt ?? now,
      };
      await w.insert("inventoryTransactions", transaction);

      // Negative stock allowed per user decision — no Math.max(0, ...) clamp
      newStock = (await refreshCachedStock(w, item)).stock;

      await w.audit("inventory_adjusted", {
        inventoryItemId,
        delta,
        newStock,
        ...(note !== undefined && { note }),
      });
    });

    return ok(newStock);
  } catch (e) {
    return failure("Failed to adjust stock", e);
  }
}

/**
 * Correct stock to a physically counted value. Writes one 'adjusted'
 * transaction for the difference against the derived stock (negative when
 * the box holds fewer pills than the app thinks). A matching count writes
 * nothing.
 */
export async function setStockCount(
  inventoryItemId: string,
  counted: number,
  note?: string,
): Promise<ServiceResult<number>> {
  try {
    if (!Number.isFinite(counted) || counted < 0) {
      throw new InventoryRuleError("Enter the number of pills you counted");
    }
    const target = roundStock(counted);
    const now = Date.now();
    let newStock = target;

    await syncedWrite(["inventoryItems", "inventoryTransactions"], async (w) => {
      const item = await getItemOrThrow(inventoryItemId);
      const current = await deriveStock(inventoryItemId);
      const delta = roundStock(target - current);

      if (delta !== 0) {
        const transaction = buildTransaction(inventoryItemId, delta, "adjusted", now, note);
        await w.insert("inventoryTransactions", transaction);
      }
      newStock = (await refreshCachedStock(w, item)).stock;

      if (delta !== 0) {
        await w.audit("inventory_adjusted", {
          inventoryItemId,
          action: "stock_counted",
          delta,
          newStock,
          ...(note !== undefined && { note }),
        });
      }
    });

    return ok(newStock);
  } catch (e) {
    return failure("Failed to set stock count", e);
  }
}

/**
 * Edit a transaction's amount and/or note. The amount is validated for the
 * transaction's type; an empty note clears it.
 */
export async function updateInventoryTransaction(
  id: string,
  updates: { amount?: number; note?: string },
): Promise<ServiceResult<void>> {
  try {

    await syncedWrite(["inventoryTransactions", "inventoryItems"], async (w) => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);
      if (updates.amount !== undefined) assertValidAmount(tx.type, updates.amount);

      const note = updates.note?.trim();
      const changes: SyncedChanges<"inventoryTransactions"> = {
        ...(updates.amount !== undefined && { amount: updates.amount }),
      };
      // Clear with "" rather than undefined: Dexie would drop the key, the
      // push would then omit the column, and the server (which maps "" to
      // NULL) would keep the old note and hand it back on the next pull.
      if (note !== undefined) changes.note = note;

      await w.patch("inventoryTransactions", id, changes);

      const item = await db.inventoryItems.get(tx.inventoryItemId);
      if (item) await refreshCachedStock(w, item);

      await w.audit("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_updated",
        updatedFields: Object.keys(updates),
      });
    });

    return ok(undefined);
  } catch (e) {
    return failure("Failed to update inventory transaction", e);
  }
}

export async function deleteInventoryTransaction(id: string): Promise<ServiceResult<void>> {
  try {

    await syncedWrite(["inventoryTransactions", "inventoryItems"], async (w) => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      await w.tombstone("inventoryTransactions", id);

      const item = await db.inventoryItems.get(tx.inventoryItemId);
      if (item) await refreshCachedStock(w, item);

      await w.audit("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_deleted",
      });
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to delete inventory transaction", e);
  }
}

/** Undo `deleteInventoryTransaction`: clear deletedAt and re-derive stock. */
export async function restoreInventoryTransaction(id: string): Promise<ServiceResult<void>> {
  try {

    await syncedWrite(["inventoryTransactions", "inventoryItems"], async (w) => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);
      if (isLive(tx)) return;

      await w.restore("inventoryTransactions", id);

      const item = await db.inventoryItems.get(tx.inventoryItemId);
      if (item) await refreshCachedStock(w, item);

      await w.audit("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_restored",
      });
    });

    return ok(undefined);
  } catch (e) {
    return err("Failed to restore inventory transaction", e);
  }
}

// ---------------------------------------------------------------------------
// Stock recalculation
// ---------------------------------------------------------------------------

/**
 * Recalculate stock for every live inventory item. Only items whose cached
 * value drifted from the ledger are rewritten (and pushed); an audit entry is
 * written only when something drifted, so a clean launch writes nothing.
 */
export async function recalculateAllStock(): Promise<{
  checked: number;
  updated: number;
  drifted: number;
  items: Array<{ id: string; brandName: string; oldStock: number; newStock: number }>;
}> {
  const allItems = (await db.inventoryItems.toArray()).filter(isLive);
  const driftedItems: Array<{ id: string; brandName: string; oldStock: number; newStock: number }> = [];

  for (const { id } of allItems) {
    await syncedWrite(["inventoryItems", "inventoryTransactions"], async (w) => {
      // Re-read inside the transaction so a concurrent write isn't clobbered.
      const item = await db.inventoryItems.get(id);
      if (!item || !isLive(item)) return;
      const { stock, previous, changed } = await refreshCachedStock(w, item);
      if (changed) {
        driftedItems.push({ id, brandName: item.brandName, oldStock: previous, newStock: stock });
      }
    });
  }

  if (driftedItems.length > 0) {
    await writeAuditLog("stock_recalculated", {
      totalItems: allItems.length,
      driftedCount: driftedItems.length,
      driftedItems,
    });
  }

  return {
    checked: allItems.length,
    updated: driftedItems.length,
    drifted: driftedItems.length,
    items: driftedItems,
  };
}

/**
 * Fire-and-forget stock recalculation on app launch.
 * Does NOT block app startup.
 */
export function initStockRecalculation(): void {
  recalculateAllStock()
    .then((result) => {
      if (result.drifted > 0) {
        console.log(
          `[inventory-service] Stock recalculated: ${result.drifted} of ${result.checked} items drifted:`,
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
