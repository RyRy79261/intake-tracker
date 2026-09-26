/**
 * Sync engine — push/pull loops, exponential backoff with jitter, server-
 * authoritative ack, and lifecycle triggers (Phase 43 Plan 06).
 *
 * Responsibilities:
 * - `nextBackoff(attempts)`: pure function returning 2s·2^attempts capped at
 *   60s, with ±20% jitter (D-11).
 * - `schedulePush(delayMs?)`: debounced push (3s default). Collapses rapid
 *   writes into one flush.
 * - `runPushCycle()`: collects queue rows in TABLE_PUSH_ORDER, POSTs to
 *   /api/sync/push (≤50 ops/cycle, plus their queued FK parents), acks
 *   accepted ops whose queue row did not change while the request was in
 *   flight, lowers a clamped server updatedAt onto a still-unchanged local
 *   row (D-12 rule 4 + Pitfall 3), schedules a pull. A per-op rejection bumps that op's `attempts`; a whole-batch
 *   network/HTTP failure only backs the loop off (audit sync-engine#13).
 * - `schedulePull(delayMs?)`: pull kick — immediate (microtask) by default,
 *   or delayed for a retry. A failed pull reschedules itself through
 *   nextBackoff(), indefinitely: nothing else would, and giving up leaves the
 *   client reading stale data until the tab reloads (issue #354).
 * - `runPullCycle()`: per-table cursor pagination, atomic apply+cursor
 *   transaction (a pulled row only replaces a local one it beats under the
 *   server's LWW rules — audit sync-engine#1), advances cursor to
 *   `min(maxRowUpdatedAt, serverTime - 30s)` (Pattern 7 skew margin),
 *   re-calls while any table reports hasMore. Resolves `true` only for a
 *   complete pull. Invalidates React Query caches on completion.
 * - `startEngine()`: idempotent one-time startup — sets isOnline and the
 *   persisted queue depth, flushes the queue, then pulls (audit
 *   sync-engine#14), attaches the dev-only `window.__syncEngine` hook
 *   (T-43-06-01 mitigation: NODE_ENV !== 'production' guard).
 * - `waitForSyncIdle()`: resolves once no push or pull is in flight.
 * - `attachLifecycleListeners()` / `detachLifecycleListeners()`: plain-DOM
 *   helpers the lifecycle hook composes; exported so test code can drive
 *   them without rendering React.
 *
 * Refs:
 * - `.planning/phases/43-sync-engine-core/43-CONTEXT.md` §D-09..D-12
 * - `.planning/phases/43-sync-engine-core/43-RESEARCH.md` Patterns 3 + 7,
 *   Pitfalls 3 + 6 + 7
 * - `.planning/phases/43-sync-engine-core/43-PATTERNS.md` §"src/lib/sync-engine.ts"
 * - Covered by `src/__tests__/sync-engine.test.ts` + `sync-backoff.test.ts`
 */

import { db, type SyncQueueRow } from "@/lib/db";
import { ackIfUnchanged, getQueueDepth } from "@/lib/sync-queue";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import { normalizeRowForPush } from "@/lib/sync-column-types";
import {
  fillClearedFieldsForPush,
  normalizePulledRow,
} from "@/lib/sync-nullable-fields";
import { apiFetch } from "@/lib/api-fetch";
import { isOnline, initNetworkListener } from "@/lib/network-status";
import {
  useSyncStatusStore,
  type DroppedSyncOp,
} from "@/stores/sync-status-store";
import { queryClient } from "@/lib/query-client";

// ─────────────────────────────────────────────────────────────────────────
// Module constants
// ─────────────────────────────────────────────────────────────────────────

/** Debounce window for after-write push (D-09: 2-5s range, picked 3s). */
export const DEBOUNCE_MS = 3000;
/** Max ops per /api/sync/push call (Pitfall 6 — block Vercel timeouts). */
export const PUSH_BATCH_CAP = 50;
/** Backoff base (D-11: 2s). */
export const BACKOFF_BASE_MS = 2000;
/** Backoff cap (D-11: 60s). */
export const BACKOFF_CAP_MS = 60_000;
/** Jitter ratio (D-11: ±20%). */
export const JITTER_RATIO = 0.2;
/** Cursor clock-skew margin (Pattern 7: 30s). */
export const SKEW_MARGIN_MS = 30_000;
/**
 * Max attempts before a *server-rejected* op is dropped from the queue.
 *
 * A rejection without `code: "invalid"` is treated as transient (a DB write
 * failure that might clear next time). But some are permanent — a CHECK
 * violation, or a column the deployed Postgres table is missing (schema
 * drift). A permanent one that is only bumped, never dropped, keeps
 * `queueDepth > 0` forever, so the engine reports "Syncing…" indefinitely and
 * no save ever appears to settle. After this many failed attempts we give up
 * on the op (its local Dexie row is untouched) so the queue can reach empty.
 *
 * Only applies to per-op server rejections — whole-batch network/HTTP failures
 * retry forever (an outage must never silently discard the user's writes) and
 * do not count against this budget (audit sync-engine#13): they back off on
 * the engine's own `pushFailures` counter instead.
 */
export const MAX_PUSH_ATTEMPTS = 8;

// ─────────────────────────────────────────────────────────────────────────
// Module-local mutable state (NOT exported — keeps the engine a singleton
// inside the client bundle). Tests reset via `__resetEngineForTests()`.
// ─────────────────────────────────────────────────────────────────────────

let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** The running push cycle, if any — `waitForSyncIdle` awaits it. */
let pushInFlight: Promise<void> | null = null;
/** Consecutive whole-batch push failures — drives the push loop's backoff. */
let pushFailures = 0;
let pullTimer: ReturnType<typeof setTimeout> | null = null;
/** The running pull cycle, if any — later callers join it. */
let pullInFlight: Promise<boolean> | null = null;
/** Consecutive failed pull cycles — drives the pull's own backoff. */
let pullAttempts = 0;
let engineStarted = false;
let engineSuspended = false;
let listenersAttached = false;

// Cached handler references so detach removes the exact functions we added.
let networkCleanup: (() => void) | null = null;
let onVisibleHandler: (() => void) | null = null;

// ─────────────────────────────────────────────────────────────────────────
// Backoff
// ─────────────────────────────────────────────────────────────────────────

/**
 * Exponential backoff with ±20% jitter, capped at 60s (D-11). Pure function.
 *
 * @param attempts - Number of previous failed attempts (0-indexed: a fresh
 *                   op that has never been pushed uses `attempts=0`).
 */
export function nextBackoff(attempts: number): number {
  const base = Math.min(
    BACKOFF_BASE_MS * Math.pow(2, attempts),
    BACKOFF_CAP_MS,
  );
  const jitter = 1 - JITTER_RATIO + Math.random() * (2 * JITTER_RATIO);
  return Math.round(base * jitter);
}

// ─────────────────────────────────────────────────────────────────────────
// Push scheduling + cycle
// ─────────────────────────────────────────────────────────────────────────

/**
 * Debounce a push cycle. Repeated calls within `delayMs` collapse into a
 * single flush that fires `delayMs` after the *last* call (D-09).
 */
export function schedulePush(delayMs: number = DEBOUNCE_MS): void {
  if (!engineStarted || engineSuspended) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void runPushCycle();
  }, delayMs);
}

type PushOpPayload = {
  queueId: number;
  tableName: TableName;
  op: "upsert" | "delete";
  row: Record<string, unknown>;
};

/** Record a push-side error. A successful pull leaves it standing. */
function setPushError(lastError: string): void {
  useSyncStatusStore.setState({ lastError, lastErrorSource: "push" });
}

/** Record a pull-side error. */
function setPullError(lastError: string): void {
  useSyncStatusStore.setState({ lastError, lastErrorSource: "pull" });
}

/**
 * FK columns per child table and the table each one points at — the FK graph
 * documented in `sync-topology.ts`, as column names.
 */
const FK_PARENTS: Partial<
  Record<TableName, ReadonlyArray<readonly [string, TableName]>>
> = {
  medicationPhases: [
    ["prescriptionId", "prescriptions"],
    ["titrationPlanId", "titrationPlans"],
  ],
  phaseSchedules: [["phaseId", "medicationPhases"]],
  inventoryItems: [["prescriptionId", "prescriptions"]],
  doseLogs: [
    ["prescriptionId", "prescriptions"],
    ["phaseId", "medicationPhases"],
    ["scheduleId", "phaseSchedules"],
    ["inventoryItemId", "inventoryItems"],
  ],
  inventoryTransactions: [
    ["inventoryItemId", "inventoryItems"],
    ["doseLogId", "doseLogs"],
  ],
  dailyNotes: [
    ["prescriptionId", "prescriptions"],
    ["doseLogId", "doseLogs"],
  ],
  substanceRecords: [["sourceRecordId", "intakeRecords"]],
};

/**
 * Add the still-queued FK parents of every row in the batch (transitively,
 * at most PUSH_BATCH_CAP extra rows).
 *
 * Coalescing moves a record's `enqueuedAt` to its latest edit, so a parent
 * edited after its children — an inventory item re-enqueued by every dose —
 * can sit behind them, outside the oldest-first window. Its children then
 * failed the server's FK check cycle after cycle until their retry budget ran
 * out and they were dropped (audit sync-engine#13). Pulled in here, the
 * parent lands in the same request, ahead of them by TABLE_PUSH_ORDER.
 *
 * Returns the live rows read along the way, keyed `table:id`, for reuse.
 */
async function withQueuedParents(pending: SyncQueueRow[]): Promise<{
  rows: SyncQueueRow[];
  liveRows: Map<string, Record<string, unknown> | undefined>;
}> {
  const rows = [...pending];
  const liveRows = new Map<string, Record<string, unknown> | undefined>();
  const inBatch = new Set(pending.map((q) => `${q.tableName}:${q.recordId}`));
  const work = [...pending];
  let added = 0;
  while (work.length > 0 && added < PUSH_BATCH_CAP) {
    const q = work.pop()!;
    const tableName = q.tableName as TableName;
    const key = `${tableName}:${q.recordId}`;
    const fks = FK_PARENTS[tableName];
    if (!fks) continue;
    const live = (await db.table(tableName).get(q.recordId)) as
      | Record<string, unknown>
      | undefined;
    liveRows.set(key, live);
    if (!live) continue;
    for (const [column, parentTable] of fks) {
      const parentId = live[column];
      if (typeof parentId !== "string" || parentId === "") continue;
      const parentKey = `${parentTable}:${parentId}`;
      if (inBatch.has(parentKey)) continue;
      inBatch.add(parentKey);
      const parentQ = await db._syncQueue
        .where("[tableName+recordId]")
        .equals([parentTable, parentId])
        .first();
      if (!parentQ || added >= PUSH_BATCH_CAP) continue;
      rows.push(parentQ);
      work.push(parentQ);
      added++;
    }
  }
  return { rows, liveRows };
}

/**
 * Internal — collect up to PUSH_BATCH_CAP queue rows (plus their queued FK
 * parents) ordered by topology.
 *
 * `sentUpdatedAt` maps each op's queueId to the local `updatedAt` it carried,
 * so the ack can tell whether the local row moved on while it was in flight.
 */
async function collectAndOrderQueuedOps(): Promise<{
  queueRows: SyncQueueRow[];
  ops: PushOpPayload[];
  sentUpdatedAt: Map<number, number | undefined>;
  orphansDropped: number;
}> {
  const oldest = await db._syncQueue
    .orderBy("enqueuedAt")
    .limit(PUSH_BATCH_CAP)
    .toArray();
  const { rows: pending, liveRows } = await withQueuedParents(oldest);
  if (pending.length === 0) {
    return {
      queueRows: [],
      ops: [],
      sentUpdatedAt: new Map(),
      orphansDropped: 0,
    };
  }

  // Group by table in TABLE_PUSH_ORDER (parent-before-child). Preserve FIFO
  // within each table (enqueuedAt ASC).
  const byTable = new Map<TableName, SyncQueueRow[]>();
  for (const row of pending) {
    const tn = row.tableName as TableName;
    if (!TABLE_PUSH_ORDER.includes(tn)) continue; // unknown tables skipped
    const bucket = byTable.get(tn) ?? [];
    bucket.push(row);
    byTable.set(tn, bucket);
  }

  const ordered: SyncQueueRow[] = [];
  for (const tn of TABLE_PUSH_ORDER) {
    const bucket = byTable.get(tn);
    if (bucket) ordered.push(...bucket);
  }

  const ops: PushOpPayload[] = [];
  const sentUpdatedAt = new Map<number, number | undefined>();
  const queueRows: SyncQueueRow[] = [];
  const orphans: SyncQueueRow[] = [];
  for (const qRow of ordered) {
    const tableName = qRow.tableName as TableName;
    const cacheKey = `${tableName}:${qRow.recordId}`;
    const liveRow = liveRows.has(cacheKey)
      ? liveRows.get(cacheKey)
      : ((await db.table(tableName).get(qRow.recordId)) as
          | Record<string, unknown>
          | undefined);

    if (qRow.op === "delete") {
      // Delete op: carry the tombstone row (soft-delete) if it still exists,
      // otherwise synthesize a minimal stub so the server still sees the id.
      // The push route accepts that stub via its tombstone schema and applies
      // it as an UPDATE — a full row is only needed for an upsert. The stub is
      // never null-filled: as an UPDATE, those nulls would clear columns.
      const row = liveRow
        ? fillClearedFieldsForPush(
            tableName,
            normalizeRowForPush(tableName, liveRow),
          )
        : normalizeRowForPush(tableName, {
            id: qRow.recordId,
            deletedAt: qRow.enqueuedAt,
            updatedAt: qRow.enqueuedAt,
          });
      queueRows.push(qRow);
      ops.push({ queueId: qRow.id!, tableName, op: "delete", row });
      sentUpdatedAt.set(qRow.id!, liveRow?.updatedAt as number | undefined);
    } else {
      // Upsert op: read current Dexie row at flush time (D-04 latest-wins).
      // A record that has disappeared (hard-deleted by a cascade, or cleared
      // by a backup restore) has nothing to push. Its queue row is dropped
      // now: left in place it was never acked, kept queueDepth above 0 for
      // good, and 50 of them at the head of the queue wedged every later
      // push (audit sync-engine#4).
      if (!liveRow) {
        orphans.push(qRow);
        continue;
      }
      queueRows.push(qRow);
      // Every nullable column the row leaves unset goes out as an explicit
      // null, so clearing a field locally clears it on the server too (audit
      // health-records-inputs#4).
      ops.push({
        queueId: qRow.id!,
        tableName,
        op: "upsert",
        row: fillClearedFieldsForPush(
          tableName,
          normalizeRowForPush(tableName, liveRow),
        ),
      });
      sentUpdatedAt.set(qRow.id!, liveRow.updatedAt as number | undefined);
    }
  }

  // Only drop an orphan whose queue row is untouched: a record re-created in
  // the meantime has re-enqueued onto the same row.
  const orphansDropped =
    orphans.length > 0 ? (await ackIfUnchanged(orphans)).length : 0;

  return { queueRows, ops, sentUpdatedAt, orphansDropped };
}

/**
 * Internal — reconcile the local row with the server's ack.
 *
 * The server acks with the `updatedAt` it now holds. Two cases need care:
 *   - The user edited the record while the push was in flight. The local row
 *     is no longer the one that was sent, so it is left alone; its queue row
 *     moved too, so the next cycle pushes it (audit sync-engine#0).
 *   - The server kept a *newer* version (LWW rule 3). Stamping that
 *     updatedAt onto the stale local content would make it look current, and
 *     the pull would then skip the real update. The pull applies the
 *     server's row instead.
 * Only a server value *below* the one sent (the clock-skew clamp, or a server
 * tombstone that won by rule 1) is copied onto the unchanged row (Pitfall 3).
 */
async function applyServerAck(
  accepted: Array<{ queueId: number; serverUpdatedAt: number }>,
  queueRowsById: Map<number, SyncQueueRow>,
  sentUpdatedAt: Map<number, number | undefined>,
): Promise<void> {
  for (const entry of accepted) {
    const origin = queueRowsById.get(entry.queueId);
    if (!origin) continue;
    const sent = sentUpdatedAt.get(entry.queueId);
    if (sent == null || entry.serverUpdatedAt >= sent) continue;
    const tableName = origin.tableName as TableName;
    await db.transaction("rw", db.table(tableName), async () => {
      const local = (await db
        .table(tableName)
        .get(origin.recordId)) as { updatedAt?: number } | undefined;
      if (!local || local.updatedAt !== sent) return;
      await db
        .table(tableName)
        .update(origin.recordId, { updatedAt: entry.serverUpdatedAt });
    });
  }
}

/**
 * Push cycle. Idempotent — a call while a cycle is already in flight joins
 * it; a call while the device is offline is a no-op.
 */
export function runPushCycle(): Promise<void> {
  if (pushInFlight) return pushInFlight;
  if (engineSuspended) return Promise.resolve();
  if (!isOnline()) return Promise.resolve();

  const cycle = pushCycle().finally(() => {
    if (pushInFlight === cycle) pushInFlight = null;
    useSyncStatusStore.setState({ isSyncing: false });
  });
  pushInFlight = cycle;
  return cycle;
}

async function pushCycle(): Promise<void> {
  useSyncStatusStore.setState({ isSyncing: true });

  let collected = await collectAndOrderQueuedOps();
  let orphansDropped = collected.orphansDropped;
  // A batch made only of orphans still made progress: collect the next one.
  while (collected.ops.length === 0 && collected.orphansDropped > 0) {
    collected = await collectAndOrderQueuedOps();
    orphansDropped += collected.orphansDropped;
  }
  const { queueRows, ops, sentUpdatedAt } = collected;
  if (ops.length === 0) {
    useSyncStatusStore.setState({ queueDepth: await getQueueDepth() });
    return;
  }

  let res: Response;
  try {
    res = await apiFetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ ops }),
    });
  } catch (err) {
    // Network error — back the loop off and retry.
    await rescheduleAfterBatchFailure(
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  if (!res.ok) {
    if (res.status === 401) {
      useSyncStatusStore.setState({ lastError: null, lastErrorSource: null });
      return;
    }
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as {
        error?: string;
        detail?: string;
      };
      if (body?.detail) detail = body.detail;
      else if (body?.error) detail = body.error;
    } catch {
      // non-JSON body, keep the status-code detail
    }
    await rescheduleAfterBatchFailure(detail);
    return;
  }
  pushFailures = 0;

  const body = (await res.json()) as {
    accepted?: Array<{ queueId: number; serverUpdatedAt: number }>;
    rejected?: Array<{
      queueId: number;
      tableName: string;
      error: string;
      code?: string;
    }>;
  };
  const accepted = body.accepted ?? [];
  const rejected = body.rejected ?? [];
  const queueRowsById = new Map<number, SyncQueueRow>();
  for (const q of queueRows) {
    if (q.id != null) queueRowsById.set(q.id, q);
  }

  await applyServerAck(accepted, queueRowsById, sentUpdatedAt);
  // Ack by snapshot, not by id: an edit made while this request was in
  // flight coalesced onto the same queue row, and deleting it would lose
  // that edit (audit sync-engine#0). Such a row stays for the next cycle.
  await ackIfUnchanged(
    accepted
      .map((a) => queueRowsById.get(a.queueId))
      .filter((q): q is SyncQueueRow => q != null),
  );

  let droppedCount = 0;
  if (rejected.length > 0) {
    const firstErr = rejected[0]!;
    const detail = `${firstErr.tableName}: ${firstErr.error}`;
    console.error(
      `[sync] ${rejected.length} op(s) rejected:`,
      rejected.map((r) => `${r.tableName}: ${r.error}`),
    );
    // An op is DROPPED (acked out of the queue; its local Dexie row stays) when
    // it can never succeed and would otherwise wedge the queue forever:
    //   1. `code: "invalid"` — failed server-side schema validation. The
    //      schema won't change, so it can never apply.
    //   2. A non-"invalid" rejection (a real DB write failure) that has now
    //      failed MAX_PUSH_ATTEMPTS times. These look transient but, when
    //      permanent (a CHECK violation or schema drift), an un-dropped op
    //      keeps queueDepth > 0 so the engine shows "Syncing…" forever and no
    //      save ever settles. Once the retry budget is spent we give up.
    // Everything else gets an attempts bump so exponential backoff applies.
    //
    // A dropped op is recorded in the persisted `droppedOps` list so the
    // user can see which records never reached the server (audit
    // sync-engine#13). A queue row an in-flight edit moved is not dropped:
    // it now stands for a newer version that deserves its own attempt.
    const drops: Array<{ q: SyncQueueRow; error: string }> = [];
    let bumpedCount = 0;
    let maxBumpedAttempts = 0;
    for (const r of rejected) {
      const q = queueRowsById.get(r.queueId);
      if (q?.id == null) continue;
      const nextAttempts = (q.attempts ?? 0) + 1;
      if (r.code === "invalid" || nextAttempts >= MAX_PUSH_ATTEMPTS) {
        if (r.code !== "invalid") {
          console.error(
            `[sync] giving up on op after ${nextAttempts} attempts: ${r.tableName} queueId=${r.queueId} — ${r.error}`,
          );
        }
        drops.push({ q, error: r.error });
      } else {
        await db._syncQueue.update(q.id, { attempts: nextAttempts });
        bumpedCount++;
        if (nextAttempts > maxBumpedAttempts) maxBumpedAttempts = nextAttempts;
      }
    }
    if (drops.length > 0) {
      const droppedIds = new Set(await ackIfUnchanged(drops.map((d) => d.q)));
      const now = Date.now();
      const recorded: DroppedSyncOp[] = drops
        .filter((d) => droppedIds.has(d.q.id!))
        .map((d) => ({
          tableName: d.q.tableName,
          recordId: d.q.recordId,
          error: d.error,
          droppedAt: now,
        }));
      if (recorded.length > 0) {
        useSyncStatusStore.getState().recordDroppedOps(recorded);
      }
      droppedCount = droppedIds.size;
    }
    setPushError(`${rejected.length} record(s) failed: ${detail}`);
    useSyncStatusStore.setState({
      lastPushedAt: Date.now(),
      queueDepth: await getQueueDepth(),
    });

    // Ops we bumped (not dropped) are still pending. Schedule a backoff retry
    // so they keep trying autonomously until they apply or exhaust the retry
    // budget. Without this a rejected op sits untouched until the next manual
    // write happens to flush it, leaving the indicator stuck on "Syncing…".
    if (bumpedCount > 0) {
      schedulePush(nextBackoff(maxBumpedAttempts));
    }
  } else {
    useSyncStatusStore.setState({
      lastPushedAt: Date.now(),
      lastError: null,
      lastErrorSource: null,
      queueDepth: await getQueueDepth(),
    });
  }

  // Chain a pull so the client sees server-authoritative state for any
  // records other devices may have written (D-10).
  schedulePull();

  // Re-drain: if new records arrived while the push was in flight, flush
  // them immediately. Re-drain whenever this cycle made forward progress —
  // either it acked items, or it dropped un-syncable ops (a batch of only
  // un-syncable ops that wedged the queue must keep draining). Without
  // progress we must NOT re-drain, or the same un-acked ops loop forever.
  if (accepted.length > 0 || droppedCount > 0 || orphansDropped > 0) {
    const remaining = await getQueueDepth();
    if (remaining > 0) {
      schedulePush(0);
    }
  }
}

/**
 * A whole batch failed (network error or non-OK status): nothing reached the
 * server, so no op's `attempts` is touched — that budget is for per-op
 * rejections only. Sharing it let a short server outage spend an op's budget,
 * after which one transient rejection dropped it (audit sync-engine#13). The
 * loop backs off on its own consecutive-failure count and retries forever.
 */
async function rescheduleAfterBatchFailure(lastError: string): Promise<void> {
  pushFailures++;
  setPushError(lastError);
  useSyncStatusStore.setState({ queueDepth: await getQueueDepth() });
  schedulePush(nextBackoff(pushFailures));
}

// ─────────────────────────────────────────────────────────────────────────
// Pull scheduling + cycle
// ─────────────────────────────────────────────────────────────────────────

/**
 * Schedule a pull. With no delay it runs on the microtask queue (avoids
 * synchronous recursion when called from inside runPushCycle); with a delay
 * it goes through a timer that later calls collapse into, so a burst of
 * retries cannot stack up.
 */
export function schedulePull(delayMs = 0): void {
  if (engineSuspended) return;
  if (pullTimer) {
    clearTimeout(pullTimer);
    pullTimer = null;
  }
  if (delayMs > 0) {
    pullTimer = setTimeout(() => {
      pullTimer = null;
      void runPullCycle();
    }, delayMs);
    return;
  }
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => {
      void runPullCycle();
    });
  } else {
    // Fallback — setTimeout 0 behaves identically for scheduling purposes.
    setTimeout(() => void runPullCycle(), 0);
  }
}

/**
 * Retry a failed pull, with the same exponential backoff the push side uses.
 *
 * Nothing else will do it. `schedulePull()` is otherwise only reached from a
 * *successful* push, the `online` transition, and engine startup — and the
 * visibility handler only kicks a push, which returns before the network when
 * the queue is empty. So a single transient "Failed to fetch" used to leave
 * the client reading stale data until the tab was reloaded or an unrelated
 * local write happened to flush a push that chained a new pull (issue #354).
 *
 * Unlike a push op there is no give-up point: a push can drop a poisoned op,
 * but abandoning the pull just restores the stale-forever bug. So this retries
 * indefinitely, at `nextBackoff`'s 60s ceiling.
 */
function scheduleFailedPullRetry(lastError: string): void {
  pullAttempts++;
  setPullError(lastError);
  schedulePull(nextBackoff(pullAttempts - 1));
}

type PulledRow = Record<string, unknown> & {
  id: string;
  updatedAt?: number;
  deletedAt?: number | null;
};

/**
 * Should a pulled server row replace the local copy? Mirrors the push route's
 * LWW rules, so the device converges on what the server will keep instead of
 * blindly overwriting (audit sync-engine#1):
 *   - A server tombstone beats a live local row (rule 1: a delete is never
 *     resurrected by an edit).
 *   - A server live row beats a local tombstone only when strictly newer
 *     (rule 2b: the tombstone wins ties).
 *   - Otherwise the strictly newer `updatedAt` wins. A tie goes to the server
 *     (rule 3) unless a local edit is still queued.
 *
 * A pending queue entry alone does not block a strictly newer server row: the
 * server rejects the older local edit anyway, and skipping the row while the
 * cursor moves past it would leave this device stale for good.
 */
function pulledRowWins(
  pulled: PulledRow,
  local: PulledRow | undefined,
  hasPendingOp: boolean,
): boolean {
  if (!local) return true;
  const pulledDeleted = pulled.deletedAt != null;
  const localDeleted = local.deletedAt != null;
  if (pulledDeleted && !localDeleted) return true;
  const pulledAt = pulled.updatedAt ?? 0;
  const localAt = local.updatedAt ?? 0;
  if (pulledAt !== localAt) return pulledAt > localAt;
  if (localDeleted && !pulledDeleted) return false;
  return !hasPendingOp;
}

/**
 * Apply one table's pulled page and advance its cursor, atomically. Returns
 * the number of rows written.
 */
async function applyPulledRows(
  tn: TableName,
  rawRows: Record<string, unknown>[],
  cursor: { updatedAt: number; id: string },
): Promise<number> {
  // Pulled rows arrive as raw Postgres rows: every unset optional column is
  // null, plus the server's userId. Shape them like a locally written row
  // (audit core-duplication#3).
  const rows = rawRows.map((r) => normalizePulledRow(r) as PulledRow);
  return db.transaction(
    "rw",
    [db.table(tn), db._syncMeta, db._syncQueue],
    async () => {
      const ids = rows.map((r) => r.id);
      const locals = (await db.table(tn).bulkGet(ids)) as Array<
        PulledRow | undefined
      >;
      const pending = await db._syncQueue
        .where("[tableName+recordId]")
        .anyOf(ids.map((id) => [tn, id]))
        .toArray();
      const pendingIds = new Set(pending.map((q) => q.recordId));
      const winners = rows.filter((row, i) =>
        pulledRowWins(row, locals[i], pendingIds.has(row.id)),
      );
      if (winners.length > 0) await db.table(tn).bulkPut(winners);
      await db._syncMeta.put({
        tableName: tn,
        lastPulledUpdatedAt: cursor.updatedAt,
        lastPulledId: cursor.id,
      });
      return winners.length;
    },
  );
}

/**
 * Pull cycle. Iterates every table (TABLE_PUSH_ORDER for consistency, order
 * doesn't matter for pull), reads per-table cursor from `_syncMeta`, POSTs
 * to /api/sync/pull, applies each table's rows in an atomic transaction,
 * advances the cursor with the SKEW_MARGIN_MS clamp, and re-calls until
 * every table reports `hasMore: false`.
 *
 * Resolves `true` only when every table drained, i.e. IndexedDB now holds a
 * complete copy of the cloud dataset; `false` on any skip or failure (audit
 * sync-engine#9). A call while a pull is in flight joins it and reports its
 * result, so a caller that needs a complete pull never proceeds on a no-op.
 */
export function runPullCycle(): Promise<boolean> {
  if (pullInFlight) return pullInFlight;
  if (engineSuspended) return Promise.resolve(false);
  if (!isOnline()) return Promise.resolve(false);

  const cycle = pullCycle().finally(() => {
    if (pullInFlight === cycle) pullInFlight = null;
    useSyncStatusStore.setState({ isSyncing: false });
  });
  pullInFlight = cycle;
  return cycle;
}

async function pullCycle(): Promise<boolean> {
  useSyncStatusStore.setState({ isSyncing: true });

  // Tracks whether this cycle actually wrote any rows to Dexie. Used to avoid a
  // blanket React Query invalidation on no-op pulls — every push chains a pull,
  // so during a burst of writes (e.g. a multi-item voice log) we'd otherwise
  // refetch every query repeatedly even when the server returned nothing new,
  // making expensive views (analytics/insights) thrash.
  let appliedAnyRows = false;

  while (true) {
    const cursors: Record<string, { updatedAt: number; id: string }> = {};
    for (const tn of TABLE_PUSH_ORDER) {
      const meta = await db._syncMeta.get(tn);
      cursors[tn] = {
        updatedAt: meta?.lastPulledUpdatedAt ?? 0,
        id: meta?.lastPulledId ?? "",
      };
    }

    let res: Response;
    try {
      res = await apiFetch("/api/sync/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        // Opt into the server-stamp keyset; without it the route pages by
        // `updatedAt` for older clients (audit sync-engine#3).
        body: JSON.stringify({ cursors, cursorKind: "server" }),
      });
    } catch (err) {
      scheduleFailedPullRetry(
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }

    if (!res.ok) {
      if (res.status === 401) {
        // Auth is handled elsewhere (the session is re-established, which
        // fires its own pull). Retrying here would just spin on 401s.
        pullAttempts = 0;
        useSyncStatusStore.setState({ lastError: null, lastErrorSource: null });
        return false;
      }
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) detail = body.error;
      } catch {
        // keep status-code detail
      }
      scheduleFailedPullRetry(detail);
      return false;
    }

    const body = (await res.json()) as {
      result: Record<
        string,
        {
          rows: Record<string, unknown>[];
          hasMore: boolean;
          cursor?: { updatedAt: number; id: string };
        }
      >;
      serverTime: number;
    };

    let anyHasMore = false;

    for (const tn of TABLE_PUSH_ORDER) {
      const slice = body.result?.[tn];
      if (!slice) continue;
      const rows = slice.rows ?? [];
      if (slice.hasMore) anyHasMore = true;

      if (rows.length === 0) continue;

      // The server returns the keyset position of the last row as an
      // opaque `cursor` — its `updatedAt` is the server-assigned write
      // stamp, NOT the row's own `updatedAt`, so a record pushed late by
      // another device still lands past this cursor (audit sync-engine#3).
      // Fall back to the last row only for a server that predates it.
      const lastRow = rows[rows.length - 1] as {
        updatedAt?: number;
        id?: string;
      };
      const lastUpdatedAt = slice.cursor?.updatedAt ?? lastRow.updatedAt ?? 0;
      const lastId = slice.cursor?.id ?? lastRow.id ?? "";

      let nextUpdatedAt: number;
      let nextId: string;
      if (slice.hasMore) {
        // More rows queued — advance to the exact `(updatedAt, id)` seen.
        // No skew clamp here: clamping while `hasMore` is true would
        // re-fetch this same page forever. Forward progress by the keyset
        // tuple is what lets a duplicate-`updatedAt` run paginate at all.
        nextUpdatedAt = lastUpdatedAt;
        nextId = lastId;
      } else if (lastUpdatedAt > body.serverTime - SKEW_MARGIN_MS) {
        // Table drained, but the newest rows sit inside the clock-skew
        // window. Clamp the persisted cursor back (id reset to "") so the
        // next pull cycle re-scans that window for rows written concurrently
        // with this query (Pattern 7). The current loop still terminates —
        // `hasMore` is false.
        nextUpdatedAt = body.serverTime - SKEW_MARGIN_MS;
        nextId = "";
      } else {
        nextUpdatedAt = lastUpdatedAt;
        nextId = lastId;
      }

      const written = await applyPulledRows(tn, rows, {
        updatedAt: nextUpdatedAt,
        id: nextId,
      });
      if (written > 0) appliedAnyRows = true;
    }

    if (!anyHasMore) break;
  }

  // Reaching here means the while-loop drained every table (no `hasMore`),
  // so IndexedDB now holds a complete copy of the cloud dataset. Early
  // returns on network/HTTP errors skip this block, so the flag only
  // flips once a full pull has genuinely succeeded.
  //
  // Only a pull-side error is cleared: every push chains a pull, and wiping
  // the push's error here hid it from the user within a tick (audit
  // sync-engine#13).
  const clearsError = useSyncStatusStore.getState().lastErrorSource !== "push";
  useSyncStatusStore.setState({
    lastPulledAt: Date.now(),
    initialSyncComplete: true,
    ...(clearsError ? { lastError: null, lastErrorSource: null } : {}),
  });
  pullAttempts = 0;

  // Invalidate React Query caches so every hook re-fetches the freshly
  // pulled rows (D-10 downstream effect) — but only when this cycle actually
  // applied rows. A no-op pull (no new server data) has nothing to surface,
  // so skipping the invalidation avoids a needless refetch storm during
  // write-heavy bursts (Dexie's own useLiveQuery hooks still react to writes).
  if (appliedAnyRows) {
    queryClient.invalidateQueries();
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Lifecycle wiring
// ─────────────────────────────────────────────────────────────────────────

/**
 * Attach window/document listeners that drive the engine's triggers
 * (D-09 + D-10). Idempotent — repeat calls are no-ops.
 *
 * Exported as a plain-DOM helper so unit tests can drive the listener
 * behavior via `window.dispatchEvent(new Event('online'))` without needing
 * to render a React component.
 */
export function attachLifecycleListeners(): void {
  if (listenersAttached) return;
  if (typeof window === "undefined") return;
  listenersAttached = true;

  networkCleanup = initNetworkListener((online) => {
    useSyncStatusStore.setState({ isOnline: online });
    if (online) void flushThenPull();
  });

  onVisibleHandler = () => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      isOnline()
    ) {
      schedulePush(0);
    }
  };

  document.addEventListener("visibilitychange", onVisibleHandler);
}

/** Detach lifecycle listeners. Called on unmount by useSyncLifecycle(). */
export function detachLifecycleListeners(): void {
  if (!listenersAttached) return;
  listenersAttached = false;
  if (typeof window === "undefined") return;

  networkCleanup?.();
  networkCleanup = null;

  if (onVisibleHandler)
    document.removeEventListener("visibilitychange", onVisibleHandler);
  onVisibleHandler = null;
}

/**
 * Stop the engine so it can be restarted (e.g. on logout → login transition).
 * Cancels any pending push timer and resets the started flag. Callers should
 * also call `detachLifecycleListeners()` to clean up DOM listeners.
 */
export function stopEngine(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  if (pullTimer) clearTimeout(pullTimer);
  pullTimer = null;
  engineStarted = false;
  useSyncStatusStore.setState({
    lastError: null,
    lastErrorSource: null,
    isSyncing: false,
  });
}

/**
 * Suspend push/pull while an in-app component preview is active. The preview
 * swaps the active database (see `setActiveDatabase`); suspending guarantees
 * the engine never pushes that throwaway data to the cloud. Pending push
 * timers are cancelled. Pair with `resumeEngine`.
 */
export function suspendEngine(): void {
  engineSuspended = true;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
}

/** Lift the suspension applied by `suspendEngine` once a preview is closed. */
export function resumeEngine(): void {
  engineSuspended = false;
}

/**
 * Push whatever is queued, then pull — used on startup and on reconnect.
 *
 * Ops can be left in the queue by an earlier session (the app closed inside
 * the debounce, or writes made offline). Pushing them first means the pull
 * that follows sees the server with those edits applied; and `queueDepth`,
 * which is not persisted, is refreshed so the indicator does not read
 * "synced" while ops are pending (audit sync-engine#14).
 */
async function flushThenPull(): Promise<void> {
  if (!engineStarted || engineSuspended) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  useSyncStatusStore.setState({ queueDepth: await getQueueDepth() });
  await runPushCycle();
  schedulePull();
}

/**
 * Resolve once no push or pull cycle is in flight. Cycles started while
 * waiting (a push chains a pull) are waited for too. Pending timers are not.
 */
export async function waitForSyncIdle(): Promise<void> {
  for (;;) {
    const running = [pushInFlight, pullInFlight].filter(
      (p): p is Promise<void> | Promise<boolean> => p != null,
    );
    if (running.length === 0) {
      // A chained pull is scheduled on the microtask queue; let it start.
      await Promise.resolve();
      if (!pushInFlight && !pullInFlight) return;
      continue;
    }
    await Promise.allSettled(running);
  }
}

/**
 * Idempotent engine start. Called once by the lifecycle hook after listeners
 * are attached. Sets initial online state, flushes the queue and then pulls
 * (D-10, audit sync-engine#14), and attaches the dev-only window.__syncEngine
 * hook under a NODE_ENV guard (T-43-06-01 mitigation — the string MUST NOT
 * appear in the production bundle; Plan 07 asserts this at build time).
 */
export function startEngine(): void {
  if (engineStarted) return;
  engineStarted = true;

  attachLifecycleListeners();

  useSyncStatusStore.setState({ isOnline: isOnline() });

  // Startup push, then pull (D-10).
  void flushThenPull();

  if (process.env.NODE_ENV !== "production") {
    if (typeof window !== "undefined") {
      (
        window as Window & {
          __syncEngine?: {
            pushNow: () => Promise<void>;
            pullNow: () => Promise<boolean>;
            getQueueDepth: typeof getQueueDepth;
          };
        }
      ).__syncEngine = {
        pushNow: () => runPushCycle(),
        pullNow: () => runPullCycle(),
        getQueueDepth,
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Test-only helper
// ─────────────────────────────────────────────────────────────────────────

/**
 * Reset all module-local state. Exported purely for unit tests — production
 * code never calls this. Also clears the push timer to avoid fake-timer leaks
 * between tests.
 */
export function __resetEngineForTests(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  pushInFlight = null;
  pushFailures = 0;
  if (pullTimer) clearTimeout(pullTimer);
  pullTimer = null;
  pullAttempts = 0;
  pullInFlight = null;
  engineStarted = false;
  engineSuspended = false;
  detachLifecycleListeners();
}

export function __startEngineForTests(): void {
  engineStarted = true;
}
