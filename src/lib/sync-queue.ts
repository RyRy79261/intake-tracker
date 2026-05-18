/**
 * Sync queue — op-log helpers over Dexie `_syncQueue` (Phase 43 D-01/D-03/D-04).
 *
 * Responsibilities:
 * - `enqueue(table, id, op)`: add or coalesce a pending op against the [tableName+recordId]
 *   compound index per the four D-04 rules.
 * - `ack(queueIds)`: remove acknowledged rows (D-03).
 * - `getQueueDepth()`: cheap count for the status UI.
 * - `writeWithSync(table, op, action)`: wrap a Dexie data write and its enqueue
 *   in a single `rw` transaction so both roll back on throw.
 *
 * This module is pure helpers — no timers, no fetch, no scheduler. The engine
 * loop (Plan 06) composes these into the real push/pull lifecycle.
 *
 * Refs:
 * - `.planning/phases/43-sync-engine-core/43-CONTEXT.md` §D-01/D-03/D-04
 * - `.planning/phases/43-sync-engine-core/43-PATTERNS.md` §"src/lib/sync-queue.ts"
 * - Covered by `src/__tests__/sync-queue.test.ts`
 */

import { db } from "@/lib/db";
import type { TableName } from "@/lib/sync-topology";

export type SyncOp = "upsert" | "delete";

/**
 * Internal coalesce helper. Assumes it already runs inside a Dexie `rw`
 * transaction that includes `db._syncQueue` in its scope. Callers are
 * responsible for opening that transaction — this function never opens one
 * itself, which keeps it safe to reuse inside `writeWithSync`'s outer tx
 * without Dexie tripping on nested rw scopes.
 *
 * Coalesce rules (D-04):
 *   none + any           → add new row
 *   upsert + upsert      → update enqueuedAt only
 *   upsert + delete      → switch op to delete, reset attempts (delete wins)
 *   delete + upsert      → switch op to upsert, reset attempts (un-delete)
 *   delete + delete      → update enqueuedAt only
 */
export async function enqueueInsideTx(
  tableName: TableName,
  recordId: string,
  op: SyncOp,
): Promise<void> {
  const now = Date.now();
  const existing = await db._syncQueue
    .where("[tableName+recordId]")
    .equals([tableName, recordId])
    .first();

  if (!existing) {
    await db._syncQueue.add({
      tableName,
      recordId,
      op,
      enqueuedAt: now,
      attempts: 0,
    });
    return;
  }

  if (existing.op === op) {
    // Same op → latest-wins enqueuedAt, keep attempts as-is. (D-04)
    await db._syncQueue.update(existing.id!, { enqueuedAt: now });
    return;
  }

  // Op transitions: upsert↔delete. Reset attempts so the new intent gets a
  // clean retry budget. (D-04: delete supersedes upsert; upsert un-deletes.)
  await db._syncQueue.update(existing.id!, {
    op,
    enqueuedAt: now,
    attempts: 0,
  });
}

/**
 * Append or coalesce an op against the sync queue. Opens its own `rw`
 * transaction over `db._syncQueue` — safe to call from outside any existing
 * transaction. Callers that need to combine a data-table write with enqueue
 * atomically should use `writeWithSync` instead.
 */
export async function enqueue(
  tableName: TableName,
  recordId: string,
  op: SyncOp,
): Promise<void> {
  await db.transaction("rw", db._syncQueue, async () => {
    await enqueueInsideTx(tableName, recordId, op);
  });
}

/** Remove acknowledged queue rows. Idempotent: unknown ids are silently ignored. */
export async function ack(queueIds: number[]): Promise<void> {
  if (queueIds.length === 0) return;
  await db._syncQueue.bulkDelete(queueIds);
}

/** Cheap count of pending ops — for the status UI. */
export async function getQueueDepth(): Promise<number> {
  return db._syncQueue.count();
}

/**
 * Atomic data write + enqueue. `action()` runs inside a single Dexie `rw`
 * transaction scoped to the target data table and `_syncQueue`. If `action()`
 * throws, both the data write and the enqueue roll back together.
 *
 * `action()` MUST return the written record so its `id` can be coalesced into
 * the queue. For deletes that don't produce a fresh record, pass a thin
 * action that fetches-and-returns the soft-deleted row, or use `enqueue()`
 * directly inside your own transaction.
 */
export async function writeWithSync<T extends { id: string }>(
  tableName: TableName,
  op: SyncOp,
  action: () => Promise<T>,
): Promise<T> {
  return db.transaction(
    "rw",
    db.table(tableName),
    db._syncQueue,
    async () => {
      const record = await action();
      await enqueueInsideTx(tableName, record.id, op);
      return record;
    },
  );
}
