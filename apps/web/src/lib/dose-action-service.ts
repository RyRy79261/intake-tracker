import { db, type DoseLog } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import { isLive } from "@intake/core/lifecycle";
import type { ServiceResult } from "@intake/types/service";
import { buildAuditEntry } from "@/lib/audit-service";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

/**
 * Small read/undo helpers backing the dose action UI: undo toasts bound to a
 * log id, and the as-needed (PRN) dose list on the prescription card.
 */

/** A live dose log by id; undefined when missing or soft-deleted. */
export async function getDoseLogById(id: string): Promise<DoseLog | undefined> {
  const log = await db.doseLogs.get(id);
  return log && isLive(log) ? log : undefined;
}

/**
 * Live PRN (kind='prn') logs for a prescription dated on or after `sinceDate`
 * ("YYYY-MM-DD"), newest first.
 */
export async function getPrnDoseLogs(prescriptionId: string, sinceDate: string): Promise<DoseLog[]> {
  const logs = await db.doseLogs
    .where("prescriptionId")
    .equals(prescriptionId)
    .filter((l) => l.kind === "prn" && isLive(l) && l.scheduledDate >= sinceDate)
    .toArray();
  return logs.sort((a, b) => (b.actionTimestamp ?? 0) - (a.actionTimestamp ?? 0));
}

/**
 * Undo a mistaken PRN dose: soft-delete the log and soft-delete the consumed
 * inventory transaction(s) linked to it, putting exactly those pills back in
 * stock. The linked transaction is the record of what was debited, so the
 * restore never depends on the current dose or pill strength.
 */
export async function undoPrnDose(id: string): Promise<ServiceResult<void>> {
  try {
    await db.transaction(
      "rw",
      [db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.auditLogs, db._syncQueue],
      async () => {
        const log = await db.doseLogs.get(id);
        if (!log || !isLive(log)) throw new Error("Dose log not found");
        if (log.kind !== "prn") throw new Error("Not an as-needed dose");

        const now = Date.now();
        let pillsRestored = 0;

        if (log.inventoryItemId) {
          const linked = await db.inventoryTransactions
            .where("inventoryItemId")
            .equals(log.inventoryItemId)
            .filter((t) => t.doseLogId === id && t.type === "consumed" && isLive(t))
            .toArray();
          for (const tx of linked) {
            await db.inventoryTransactions.update(tx.id, { deletedAt: now, updatedAt: now });
            await enqueueInsideTx("inventoryTransactions", tx.id, "delete");
            pillsRestored -= tx.amount;
          }
          const inventory = await db.inventoryItems.get(log.inventoryItemId);
          if (inventory && pillsRestored !== 0) {
            const newStock = (inventory.currentStock ?? 0) + pillsRestored;
            await db.inventoryItems.update(inventory.id, {
              currentStock: Math.round(newStock * 10000) / 10000,
              updatedAt: now,
            });
            await enqueueInsideTx("inventoryItems", inventory.id, "upsert");
          }
        }

        await db.doseLogs.update(id, { deletedAt: now, updatedAt: now });
        await enqueueInsideTx("doseLogs", id, "delete");

        const auditEntry = buildAuditEntry("dose_untaken", {
          prescriptionId: log.prescriptionId,
          date: log.scheduledDate,
          time: log.scheduledTime,
          kind: "prn",
          pillsConsumed: pillsRestored,
          inventoryItemId: log.inventoryItemId,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
      },
    );
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err("Failed to undo as-needed dose", e);
  }
}
