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
import { buildAuditEntry, writeAuditLog } from "@/lib/audit-service";
import { buildTransaction } from "@/lib/medication-builders";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

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
 * Must run inside an rw transaction over inventoryItems,
 * inventoryTransactions and _syncQueue.
 */
async function refreshCachedStock(
  item: InventoryItem,
  now: number,
): Promise<{ stock: number; previous: number; changed: boolean }> {
  const stock = await deriveStock(item.id);
  const previous = item.currentStock ?? 0;
  const changed = item.currentStock === undefined || roundStock(previous) !== stock;
  if (changed) {
    await db.inventoryItems.update(item.id, { currentStock: stock, updatedAt: now });
    await enqueueInsideTx("inventoryItems", item.id, "upsert");
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
    await db.transaction("rw", [db.inventoryItems, db.auditLogs, db._syncQueue], async () => {
      await db.inventoryItems.add(item);
      await enqueueInsideTx("inventoryItems", item.id, "upsert");

      const audit = buildAuditEntry("inventory_added", {
        inventoryItemId: item.id,
        prescriptionId: item.prescriptionId,
        brandName: item.brandName,
        strength: item.strength,
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();
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
    await db.transaction("rw", [db.inventoryItems, db.auditLogs, db._syncQueue], async () => {
      await db.inventoryItems.update(id, { ...updates, updatedAt: Date.now() });
      await enqueueInsideTx("inventoryItems", id, "upsert");

      const audit = buildAuditEntry("inventory_adjusted", {
        inventoryItemId: id,
        updatedFields: Object.keys(updates),
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to update inventory item", e);
  }
}

export async function deleteInventoryItem(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await db.transaction("rw", [db.inventoryItems, db.auditLogs, db._syncQueue], async () => {
      // A tombstone is never the active brand.
      await db.inventoryItems.update(id, { deletedAt: now, updatedAt: now, isActive: false });
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
    const now = Date.now();
    await db.transaction("rw", [db.inventoryItems, db.auditLogs, db._syncQueue], async () => {
      const siblings = await db.inventoryItems.where("prescriptionId").equals(prescriptionId).toArray();
      const target = siblings.find((i) => i.id === itemId);
      if (!target || !isLive(target)) throw new InventoryRuleError("Brand not found");
      if (target.isArchived) throw new InventoryRuleError("Unarchive this brand before making it active");

      const previous: string[] = [];
      for (const sibling of siblings) {
        if (sibling.id === itemId || !sibling.isActive) continue;
        await db.inventoryItems.update(sibling.id, { isActive: false, updatedAt: now });
        await enqueueInsideTx("inventoryItems", sibling.id, "upsert");
        previous.push(sibling.id);
      }
      if (!target.isActive) {
        await db.inventoryItems.update(itemId, { isActive: true, updatedAt: now });
        await enqueueInsideTx("inventoryItems", itemId, "upsert");
      }

      const audit = buildAuditEntry("inventory_adjusted", {
        inventoryItemId: itemId,
        prescriptionId,
        action: "active_brand_set",
        deactivated: previous,
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();
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
    const now = Date.now();
    let promotedId: string | null = null;
    await db.transaction("rw", [db.inventoryItems, db.auditLogs, db._syncQueue], async () => {
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
            await db.inventoryItems.update(other.id, { isActive: shouldBeActive, updatedAt: now });
            await enqueueInsideTx("inventoryItems", other.id, "upsert");
          }
          promotedId = replacement.id;
        }
      }

      await db.inventoryItems.update(id, { isArchived: true, isActive: false, updatedAt: now });
      await enqueueInsideTx("inventoryItems", id, "upsert");

      const audit = buildAuditEntry("inventory_adjusted", {
        inventoryItemId: id,
        action: "archived",
        promotedId,
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();
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
export async function adjustStock(
  inventoryItemId: string,
  delta: number,
  note?: string,
  type?: "refill" | "consumed" | "adjusted",
): Promise<ServiceResult<number>> {
  try {
    const txType = type ?? (delta > 0 ? "refill" : "consumed");
    assertValidAmount(txType, delta);
    const now = Date.now();
    let newStock = 0;

    await db.transaction("rw", [db.inventoryItems, db.inventoryTransactions, db.auditLogs, db._syncQueue], async () => {
      const item = await getItemOrThrow(inventoryItemId);

      const transaction = buildTransaction(inventoryItemId, delta, txType, now, note);
      await db.inventoryTransactions.add(transaction);
      await enqueueInsideTx("inventoryTransactions", transaction.id, "upsert");

      // Negative stock allowed per user decision — no Math.max(0, ...) clamp
      newStock = (await refreshCachedStock(item, now)).stock;

      const audit = buildAuditEntry("inventory_adjusted", {
        inventoryItemId,
        delta,
        newStock,
        ...(note !== undefined && { note }),
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();

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

    await db.transaction("rw", [db.inventoryItems, db.inventoryTransactions, db.auditLogs, db._syncQueue], async () => {
      const item = await getItemOrThrow(inventoryItemId);
      const current = await deriveStock(inventoryItemId);
      const delta = roundStock(target - current);

      if (delta !== 0) {
        const transaction = buildTransaction(inventoryItemId, delta, "adjusted", now, note);
        await db.inventoryTransactions.add(transaction);
        await enqueueInsideTx("inventoryTransactions", transaction.id, "upsert");
      }
      newStock = (await refreshCachedStock(item, now)).stock;

      if (delta !== 0) {
        const audit = buildAuditEntry("inventory_adjusted", {
          inventoryItemId,
          action: "stock_counted",
          delta,
          newStock,
          ...(note !== undefined && { note }),
        });
        await db.auditLogs.add(audit);
        await enqueueInsideTx("auditLogs", audit.id, "upsert");
      }
    });
    schedulePush();

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
    const now = Date.now();

    await db.transaction("rw", [db.inventoryTransactions, db.inventoryItems, db.auditLogs, db._syncQueue], async () => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);
      if (updates.amount !== undefined) assertValidAmount(tx.type, updates.amount);

      const note = updates.note?.trim();
      const changes: Partial<InventoryTransaction> = {
        ...(updates.amount !== undefined && { amount: updates.amount }),
        updatedAt: now,
      };
      // Dexie removes a key whose update value is undefined — that is the clear.
      if (updates.note !== undefined) (changes as { note?: string | undefined }).note = note === "" ? undefined : note;

      await db.inventoryTransactions.update(id, changes);
      await enqueueInsideTx("inventoryTransactions", id, "upsert");

      const item = await db.inventoryItems.get(tx.inventoryItemId);
      if (item) await refreshCachedStock(item, now);

      const audit = buildAuditEntry("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_updated",
        updatedFields: Object.keys(updates),
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();

    return ok(undefined);
  } catch (e) {
    return failure("Failed to update inventory transaction", e);
  }
}

export async function deleteInventoryTransaction(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction("rw", [db.inventoryTransactions, db.inventoryItems, db.auditLogs, db._syncQueue], async () => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      // Soft-delete
      await db.inventoryTransactions.update(id, { deletedAt: now, updatedAt: now });
      await enqueueInsideTx("inventoryTransactions", id, "delete");

      const item = await db.inventoryItems.get(tx.inventoryItemId);
      if (item) await refreshCachedStock(item, now);

      const audit = buildAuditEntry("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_deleted",
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();

    return ok(undefined);
  } catch (e) {
    return err("Failed to delete inventory transaction", e);
  }
}

/** Undo `deleteInventoryTransaction`: clear deletedAt and re-derive stock. */
export async function restoreInventoryTransaction(id: string): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();

    await db.transaction("rw", [db.inventoryTransactions, db.inventoryItems, db.auditLogs, db._syncQueue], async () => {
      const tx = await db.inventoryTransactions.get(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);
      if (isLive(tx)) return;

      await db.inventoryTransactions.update(id, { deletedAt: null, updatedAt: now });
      await enqueueInsideTx("inventoryTransactions", id, "upsert");

      const item = await db.inventoryItems.get(tx.inventoryItemId);
      if (item) await refreshCachedStock(item, now);

      const audit = buildAuditEntry("inventory_adjusted", {
        transactionId: id,
        inventoryItemId: tx.inventoryItemId,
        action: "transaction_restored",
      });
      await db.auditLogs.add(audit);
      await enqueueInsideTx("auditLogs", audit.id, "upsert");
    });
    schedulePush();

    return ok(undefined);
  } catch (e) {
    return err("Failed to restore inventory transaction", e);
  }
}

// ---------------------------------------------------------------------------
// Stock recalculation
// ---------------------------------------------------------------------------

/**
 * Recalculate and persist stock for a single inventory item.
 * Derives from transactions, then refreshes the cached currentStock field.
 */
export async function recalculateStockForItem(inventoryItemId: string): Promise<number> {
  let derivedValue = 0;
  await db.transaction("rw", [db.inventoryItems, db.inventoryTransactions, db._syncQueue], async () => {
    const item = await db.inventoryItems.get(inventoryItemId);
    derivedValue = item
      ? (await refreshCachedStock(item, Date.now())).stock
      : await deriveStock(inventoryItemId);
  });
  schedulePush();
  return derivedValue;
}

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
    await db.transaction("rw", [db.inventoryItems, db.inventoryTransactions, db._syncQueue], async () => {
      // Re-read inside the transaction so a concurrent write isn't clobbered.
      const item = await db.inventoryItems.get(id);
      if (!item || !isLive(item)) return;
      const { stock, previous, changed } = await refreshCachedStock(item, Date.now());
      if (changed) {
        driftedItems.push({ id, brandName: item.brandName, oldStock: previous, newStock: stock });
      }
    });
  }

  if (driftedItems.length > 0) {
    schedulePush();
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
