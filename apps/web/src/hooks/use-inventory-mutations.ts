"use client";

import { useMutation } from "@tanstack/react-query";
import {
  setActiveBrand,
  archiveInventoryItem,
  setStockCount,
  restoreInventoryTransaction,
} from "@/lib/inventory-service";
import { unwrap } from "@intake/core/service";

// ============================================================================
// Inventory mutations — brand switching, archiving, recounts and undo.
// No invalidation needed: the inventory reads are useLiveQuery.
// ============================================================================

/** Make one brand the prescription's only active brand, in one transaction. */
export function useSetActiveBrand() {
  return useMutation({
    mutationFn: async ({ prescriptionId, itemId }: { prescriptionId: string; itemId: string }) =>
      unwrap(await setActiveBrand(prescriptionId, itemId)),
  });
}

/** Archive a brand; archiving the active one hands "active" to a replacement. */
export function useArchiveInventoryItem() {
  return useMutation({
    mutationFn: async ({ id, replacementId }: { id: string; replacementId?: string }) =>
      unwrap(await archiveInventoryItem(id, replacementId)),
  });
}

/** Correct stock to a counted value with one 'adjusted' transaction. */
export function useSetStockCount() {
  return useMutation({
    mutationFn: async ({ inventoryItemId, counted, note }: { inventoryItemId: string; counted: number; note?: string }) =>
      unwrap(await setStockCount(inventoryItemId, counted, note)),
  });
}

/** Undo a deleted stock transaction. */
export function useRestoreInventoryTransaction() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await restoreInventoryTransaction(id)),
  });
}
