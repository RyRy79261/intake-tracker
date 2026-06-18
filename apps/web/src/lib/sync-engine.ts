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
 *   /api/sync/push (≤200 ops/cycle), acks on success, applies server
 *   updatedAt only when `local.updatedAt <= server` (D-12 rule 4 + Pitfall 3),
 *   schedules a pull. On failure, increments attempts and reschedules via
 *   nextBackoff().
 * - `schedulePull()`: microtask-scheduled pull kick.
 * - `runPullCycle()`: per-table cursor pagination, atomic bulkPut+cursor
 *   transaction, advances cursor to `min(maxRowUpdatedAt, serverTime - 30s)`
 *   (Pattern 7 skew margin), re-calls while any table reports hasMore.
 *   Invalidates React Query caches on completion.
 * - `startEngine()`: idempotent one-time startup — sets isOnline, kicks a
 *   startup pull, attaches the dev-only `window.__syncEngine` hook
 *   (T-43-06-01 mitigation: NODE_ENV !== 'production' guard).
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
import { ack, getQueueDepth } from "@/lib/sync-queue";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import { apiFetch } from "@/lib/api-fetch";
import { isOnline, initNetworkListener } from "@/lib/network-status";
import { useSyncStatusStore } from "@/stores/sync-status-store";
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

// ─────────────────────────────────────────────────────────────────────────
// Module-local mutable state (NOT exported — keeps the engine a singleton
// inside the client bundle). Tests reset via `__resetEngineForTests()`.
// ─────────────────────────────────────────────────────────────────────────

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;
let pullInFlight = false;
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

/** Internal — collect up to PUSH_BATCH_CAP queue rows ordered by topology. */
async function collectAndOrderQueuedOps(): Promise<{
  queueRows: SyncQueueRow[];
  ops: Array<{
    queueId: number;
    tableName: TableName;
    op: "upsert" | "delete";
    row: Record<string, unknown>;
  }>;
}> {
  const pending = await db._syncQueue
    .orderBy("enqueuedAt")
    .limit(PUSH_BATCH_CAP)
    .toArray();
  if (pending.length === 0) {
    return { queueRows: [], ops: [] };
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

  const ops: Array<{
    queueId: number;
    tableName: TableName;
    op: "upsert" | "delete";
    row: Record<string, unknown>;
  }> = [];
  for (const qRow of ordered) {
    const tableName = qRow.tableName as TableName;
    const liveRow = (await db
      .table(tableName)
      .get(qRow.recordId)) as Record<string, unknown> | undefined;

    if (qRow.op === "delete") {
      // Delete op: carry the tombstone row (soft-delete) if it still exists,
      // otherwise synthesize a minimal stub so the server still sees the id.
      const row = liveRow ?? {
        id: qRow.recordId,
        deletedAt: qRow.enqueuedAt,
        updatedAt: qRow.enqueuedAt,
      };
      ops.push({
        queueId: qRow.id!,
        tableName,
        op: "delete",
        row,
      });
    } else {
      // Upsert op: read current Dexie row at flush time (D-04 latest-wins).
      // If the local row has disappeared, skip (nothing to push).
      if (!liveRow) continue;
      ops.push({
        queueId: qRow.id!,
        tableName,
        op: "upsert",
        row: liveRow,
      });
    }
  }

  return { queueRows: ordered, ops };
}

/**
 * Internal — per Pitfall 3, server ack is only applied when the local row's
 * updatedAt has NOT moved past the server's. Race window: the user edits
 * the same record locally while the push is in flight; that newer local
 * edit is already re-enqueued (coalesce), so overwriting with the ack's
 * older serverUpdatedAt would clobber it.
 */
async function applyServerAck(
  accepted: Array<{ queueId: number; serverUpdatedAt: number }>,
  queueRowsById: Map<number, SyncQueueRow>,
): Promise<void> {
  for (const entry of accepted) {
    const origin = queueRowsById.get(entry.queueId);
    if (!origin) continue;
    const tableName = origin.tableName as TableName;
    const local = (await db
      .table(tableName)
      .get(origin.recordId)) as { updatedAt?: number } | undefined;
    if (!local) continue;
    if ((local.updatedAt ?? 0) <= entry.serverUpdatedAt) {
      await db
        .table(tableName)
        .update(origin.recordId, { updatedAt: entry.serverUpdatedAt });
    }
  }
}

/**
 * Push cycle. Idempotent — repeat calls while a cycle is already in flight
 * or the device is offline are no-ops.
 */
export async function runPushCycle(): Promise<void> {
  if (pushInFlight) return;
  if (engineSuspended) return;
  if (!isOnline()) return;

  pushInFlight = true;
  useSyncStatusStore.setState({ isSyncing: true });

  try {
    const { queueRows, ops } = await collectAndOrderQueuedOps();
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
      // Network error — treat as failure, backoff on max attempt in batch.
      await incrementAttemptsAndReschedule(
        queueRows,
        err instanceof Error ? err.message : String(err),
      );
      return;
    }

    if (!res.ok) {
      if (res.status === 401) {
        useSyncStatusStore.setState({ lastError: null });
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
      await incrementAttemptsAndReschedule(queueRows, detail);
      return;
    }

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

    await applyServerAck(accepted, queueRowsById);
    await ack(accepted.map((a) => a.queueId));

    let droppedInvalid = 0;
    if (rejected.length > 0) {
      const firstErr = rejected[0]!;
      const detail = `${firstErr.tableName}: ${firstErr.error}`;
      console.error(
        `[sync] ${rejected.length} op(s) rejected:`,
        rejected.map((r) => `${r.tableName}: ${r.error}`),
      );
      // `code: "invalid"` means the row failed server-side schema validation.
      // It can never succeed (the schema won't change), so retrying it forever
      // just keeps the error banner up and re-sends it in every batch. Drop it
      // from the queue (the local Dexie row is untouched). Other rejections —
      // transient DB write failures — get an attempts bump so backoff applies.
      const dropIds: number[] = [];
      for (const r of rejected) {
        const q = queueRowsById.get(r.queueId);
        if (q?.id == null) continue;
        if (r.code === "invalid") {
          dropIds.push(q.id);
        } else {
          await db._syncQueue.update(q.id, {
            attempts: (q.attempts ?? 0) + 1,
          });
        }
      }
      if (dropIds.length > 0) await ack(dropIds);
      droppedInvalid = dropIds.length;
      useSyncStatusStore.setState({
        lastError: `${rejected.length} record(s) failed: ${detail}`,
        lastPushedAt: Date.now(),
        queueDepth: await getQueueDepth(),
      });
    } else {
      useSyncStatusStore.setState({
        lastPushedAt: Date.now(),
        lastError: null,
        queueDepth: await getQueueDepth(),
      });
    }

    // Chain a pull so the client sees server-authoritative state for any
    // records other devices may have written (D-10).
    schedulePull();

    // Re-drain: if new records arrived while the push was in flight, flush
    // them immediately. Re-drain whenever this cycle made forward progress —
    // either it acked items, or it dropped permanently-invalid ops (a batch
    // of only-invalid ops that wedged the queue must keep draining). Without
    // progress we must NOT re-drain, or the same un-acked ops loop forever.
    if (accepted.length > 0 || droppedInvalid > 0) {
      const remaining = await getQueueDepth();
      if (remaining > 0) {
        schedulePush(0);
      }
    }
  } finally {
    pushInFlight = false;
    useSyncStatusStore.setState({ isSyncing: false });
  }
}

async function incrementAttemptsAndReschedule(
  queueRows: SyncQueueRow[],
  lastError: string,
): Promise<void> {
  let maxAttempts = 0;
  for (const q of queueRows) {
    if (q.id == null) continue;
    const newAttempts = (q.attempts ?? 0) + 1;
    if (newAttempts > maxAttempts) maxAttempts = newAttempts;
    await db._syncQueue.update(q.id, { attempts: newAttempts });
  }
  useSyncStatusStore.setState({
    lastError,
    queueDepth: await getQueueDepth(),
  });
  schedulePush(nextBackoff(maxAttempts));
}

// ─────────────────────────────────────────────────────────────────────────
// Pull scheduling + cycle
// ─────────────────────────────────────────────────────────────────────────

/**
 * Schedule a pull on the microtask queue (avoids synchronous recursion when
 * called from inside runPushCycle).
 */
export function schedulePull(): void {
  if (engineSuspended) return;
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
 * Pull cycle. Iterates every table (TABLE_PUSH_ORDER for consistency, order
 * doesn't matter for pull), reads per-table cursor from `_syncMeta`, POSTs
 * to /api/sync/pull, applies each table's rows in an atomic transaction,
 * advances the cursor with the SKEW_MARGIN_MS clamp, and re-calls until
 * every table reports `hasMore: false`.
 */
export async function runPullCycle(): Promise<void> {
  if (pullInFlight) return;
  if (engineSuspended) return;
  if (!isOnline()) return;

  pullInFlight = true;
  useSyncStatusStore.setState({ isSyncing: true });

  try {
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
          body: JSON.stringify({ cursors }),
        });
      } catch (err) {
        useSyncStatusStore.setState({
          lastError: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      if (!res.ok) {
        if (res.status === 401) {
          useSyncStatusStore.setState({ lastError: null });
          return;
        }
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) detail = body.error;
        } catch {
          // keep status-code detail
        }
        useSyncStatusStore.setState({ lastError: detail });
        return;
      }

      const body = (await res.json()) as {
        result: Record<
          string,
          { rows: Record<string, unknown>[]; hasMore: boolean }
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

        // Rows arrive ordered by `(updatedAt, id)` ASC, so the last row is
        // the max tuple — the keyset cursor for the next page.
        const lastRow = rows[rows.length - 1] as {
          updatedAt?: number;
          id?: string;
        };
        const lastUpdatedAt = lastRow.updatedAt ?? 0;
        const lastId = lastRow.id ?? "";

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

        await db.transaction("rw", [db.table(tn), db._syncMeta], async () => {
          await db.table(tn).bulkPut(rows);
          await db._syncMeta.put({
            tableName: tn,
            lastPulledUpdatedAt: nextUpdatedAt,
            lastPulledId: nextId,
          });
        });
      }

      if (!anyHasMore) break;
    }

    // Reaching here means the while-loop drained every table (no `hasMore`),
    // so IndexedDB now holds a complete copy of the cloud dataset. Early
    // returns on network/HTTP errors skip this block, so the flag only
    // flips once a full pull has genuinely succeeded.
    useSyncStatusStore.setState({
      lastPulledAt: Date.now(),
      lastError: null,
      initialSyncComplete: true,
    });

    // Invalidate React Query caches so every hook re-fetches the freshly
    // pulled rows (D-10 downstream effect).
    queryClient.invalidateQueries();
  } finally {
    pullInFlight = false;
    useSyncStatusStore.setState({ isSyncing: false });
  }
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
    if (online) {
      schedulePush(0);
      schedulePull();
    }
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
  engineStarted = false;
  useSyncStatusStore.setState({ lastError: null, isSyncing: false });
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
 * Idempotent engine start. Called once by the lifecycle hook after listeners
 * are attached. Sets initial online state, kicks a startup pull (D-10), and
 * attaches the dev-only window.__syncEngine hook under a NODE_ENV guard
 * (T-43-06-01 mitigation — the string MUST NOT appear in the production
 * bundle; Plan 07 asserts this at build time).
 */
export function startEngine(): void {
  if (engineStarted) return;
  engineStarted = true;

  attachLifecycleListeners();

  useSyncStatusStore.setState({ isOnline: isOnline() });

  // Startup pull (D-10).
  schedulePull();

  if (process.env.NODE_ENV !== "production") {
    if (typeof window !== "undefined") {
      (
        window as Window & {
          __syncEngine?: {
            pushNow: () => Promise<void>;
            pullNow: () => Promise<void>;
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
  pushInFlight = false;
  pullInFlight = false;
  engineStarted = false;
  engineSuspended = false;
  detachLifecycleListeners();
}

export function __startEngineForTests(): void {
  engineStarted = true;
}
