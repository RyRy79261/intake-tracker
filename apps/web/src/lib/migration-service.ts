import { db } from "@/lib/db";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import { normalizeRowForPush } from "@/lib/sync-column-types";
import { fillClearedFieldsForPush } from "@/lib/sync-nullable-fields";
import { enqueueInsideTx } from "@/lib/sync-queue";
import type { PushOp } from "@intake/db/sync-payload";
import { apiFetch } from "@/lib/api-fetch";
import { useMigrationStore, type TableProgress } from "@/stores/migration-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

const BATCH_SIZE = 100;
const PROGRESS_KEY = "intake-tracker-migration-progress";
const MAX_RETRIES = 3;

/**
 * Cancellation. `cancelMigration` raises the flag, then waits for the running
 * upload to stop at the next batch boundary before it asks the server to
 * clean up, so no batch can land after the cleanup and put rows back (audit
 * sync-engine#7).
 */
class MigrationCancelledError extends Error {
  constructor() {
    super("Migration cancelled");
  }
}
let cancelRequested = false;
let activeRun: Promise<void> | null = null;

function trackRun(run: Promise<void>): Promise<void> {
  activeRun = run;
  return run.finally(() => {
    if (activeRun === run) activeRun = null;
  });
}

interface PersistedProgress {
  tableProgress: Record<string, TableProgress>;
  currentTableIndex: number;
}

function persistProgress(progress: PersistedProgress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function isTableProgressEntry(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<TableProgress>;
  return Number.isFinite(entry.uploaded) && Number.isFinite(entry.lastBatchIndex);
}

function loadProgress(): PersistedProgress | null {
  const raw = localStorage.getItem(PROGRESS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedProgress> | null;
    // A value without a tableProgress map, or with an entry the resume path
    // cannot read, is not a run we can resume: treat it as absent rather than
    // crash the resume path on it.
    const tp = parsed?.tableProgress;
    if (!tp || typeof tp !== "object" || Array.isArray(tp)) return null;
    if (!Object.values(tp).every(isTableProgressEntry)) return null;
    return parsed as PersistedProgress;
  } catch {
    return null;
  }
}

function clearProgress(): void {
  localStorage.removeItem(PROGRESS_KEY);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWithRetry(
  url: string,
  body: unknown,
  retries = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    if (attempt < retries) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[migration] retry ${attempt + 1}/${retries} after ${delay}ms`);
      await sleep(delay);
    } else {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Push failed after ${retries + 1} attempts: ${res.status} ${text}`,
      );
    }
  }
  throw new Error("Unreachable");
}

/**
 * The push route answers 200 even when it rejects some ops: invalid rows and
 * failed writes come back in `rejected`. The migration used to ignore that
 * and report every row as uploaded, while rows it had no queue entry for were
 * never retried (audit sync-engine#12). Each rejected row is queued for the
 * sync engine, which retries it once cloud sync starts and lists it under
 * "unsynced records" if it can never apply. Returns the rejected count.
 */
async function queueRejectedOps(res: Response, ops: PushOp[]): Promise<number> {
  let body: { rejected?: Array<{ queueId: number }> };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return 0;
  }
  const rejected = body?.rejected ?? [];
  if (rejected.length === 0) return 0;

  const opsByQueueId = new Map(ops.map((op) => [op.queueId, op]));
  const toQueue = rejected
    .map((r) => opsByQueueId.get(r.queueId))
    .filter((op): op is PushOp => op != null);
  await db.transaction("rw", db._syncQueue, async () => {
    for (const op of toQueue) {
      await enqueueInsideTx(
        op.tableName,
        op.row.id as string,
        op.row.deletedAt != null ? "delete" : "upsert",
      );
    }
  });
  console.log(`[migration] ${rejected.length} row(s) rejected, queued for retry`);
  return rejected.length;
}

/**
 * Queue every record on this device for the sync engine to upload.
 *
 * Used when the device moves to cloud-sync without the migration wizard
 * (auto-detect found the account already has cloud data). The engine's queue
 * only holds writes made since the queue existed, so without this, history
 * from before it, or restored from a backup, never reached the cloud (audit
 * sync-engine#16). The server's LWW keeps whichever copy is newer.
 */
export async function queueLocalDataForSync(): Promise<number> {
  let queued = 0;
  for (const tableName of TABLE_PUSH_ORDER) {
    const rows = (await db.table(tableName).toArray()) as Array<{
      id: string;
      deletedAt?: number | null;
    }>;
    if (rows.length === 0) continue;
    await db.transaction("rw", db._syncQueue, async () => {
      for (const row of rows) {
        await enqueueInsideTx(
          tableName,
          row.id,
          row.deletedAt != null ? "delete" : "upsert",
        );
      }
    });
    queued += rows.length;
  }
  if (queued > 0) {
    useSyncStatusStore.setState({ queueDepth: await db._syncQueue.count() });
  }
  return queued;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function uploadTable(
  tableName: TableName,
  tableIndex: number,
  startBatch: number,
  queueIdRef: { value: number },
): Promise<void> {
  const store = useMigrationStore.getState();
  store.setCurrentTableIndex(tableIndex);

  const records = await db.table(tableName).toArray();
  const batches = chunkArray(records, BATCH_SIZE);
  const total = records.length;

  if (startBatch === 0) {
    console.log(
      `[migration] uploading table ${tableName}: ${total} records, ${batches.length} batches`,
    );
  } else {
    console.log(
      `[migration] resuming table ${tableName}: batch ${startBatch + 1}/${batches.length}`,
    );
  }

  let rejectedInTable = useMigrationStore.getState().tableProgress[tableName]?.rejected ?? 0;
  for (let batchIdx = startBatch; batchIdx < batches.length; batchIdx++) {
    if (cancelRequested) throw new MigrationCancelledError();
    const batch = batches[batchIdx]!;
    // Same coercion the push loop applies (issue #354): a value Postgres
    // cannot store — a fraction in an `integer` column, a NaN — fails push
    // validation, and the route quarantines that op instead of 400-ing the
    // batch, so the record is silently left behind by the migration.
    const ops: PushOp[] = batch.map((record) => ({
      queueId: queueIdRef.value++,
      tableName,
      op: "upsert" as const,
      row: fillClearedFieldsForPush(
        tableName,
        normalizeRowForPush(tableName, record),
      ),
    }));

    const res = await postWithRetry("/api/sync/push", { ops });
    rejectedInTable += await queueRejectedOps(res, ops);

    const uploaded = Math.min((batchIdx + 1) * BATCH_SIZE, total);
    store.setTableProgress(tableName, {
      total,
      uploaded,
      lastBatchIndex: batchIdx,
      rejected: rejectedInTable,
    });

    persistProgress({
      tableProgress: useMigrationStore.getState().tableProgress,
      currentTableIndex: tableIndex,
    });

    console.log(
      `[migration] uploading table ${tableName}: batch ${batchIdx + 1}/${batches.length}`,
    );
  }

  if (batches.length === 0) {
    store.setTableProgress(tableName, { total: 0, uploaded: 0, lastBatchIndex: -1 });
    persistProgress({
      tableProgress: useMigrationStore.getState().tableProgress,
      currentTableIndex: tableIndex,
    });
  }
}

async function preCountTables(): Promise<void> {
  const store = useMigrationStore.getState();
  for (const tableName of TABLE_PUSH_ORDER) {
    const count = await db.table(tableName).count();
    store.setTableProgress(tableName, { total: count, uploaded: 0, lastBatchIndex: -1 });
  }
}

function failUpload(label: string, error: unknown): void {
  // A cancel stops the loop by throwing; cancelMigration owns the phase then.
  if (error instanceof MigrationCancelledError) {
    console.log(`[migration] ${label} stopped by cancel`);
    return;
  }
  const store = useMigrationStore.getState();
  store.setPhase("error");
  store.setError(error instanceof Error ? error.message : String(error));
  console.log(`[migration] ${label} error:`, error instanceof Error ? error.message : error);
}

export function startMigration(): Promise<void> {
  cancelRequested = false;
  return trackRun(runStartMigration());
}

async function runStartMigration(): Promise<void> {
  const store = useMigrationStore.getState();
  store.setPhase("uploading");
  store.setError(null);

  const queueIdRef = { value: 0 };

  try {
    await preCountTables();

    for (let i = 0; i < TABLE_PUSH_ORDER.length; i++) {
      const tableName = TABLE_PUSH_ORDER[i] as TableName;
      await uploadTable(tableName, i, 0, queueIdRef);
    }

    console.log("[migration] upload complete");
    store.setPhase("complete");
  } catch (error) {
    failUpload("upload", error);
  }
}

/**
 * Cancel a migration: stop the upload loop, then remove what reached the
 * server. The device stays in local mode either way, and that is recorded as
 * the user's explicit choice, so auto-detect does not flip it back to
 * cloud-sync because rows remain on the server (audit sync-engine#7/#16).
 *
 * The cleanup response is checked. A failed cleanup used to report "All
 * uploaded data has been removed" while the rows stayed on the server.
 */
export async function cancelMigration(): Promise<void> {
  const store = useMigrationStore.getState();

  cancelRequested = true;
  // Let the running upload finish its current batch and stop, so no batch can
  // land on the server after the cleanup below.
  await activeRun;

  useSettingsStore.getState().setStorageMode("local");
  useSyncStatusStore.setState({ modeChosenByUser: true });

  try {
    const res = await apiFetch("/api/sync/cleanup", { method: "POST" });
    if (!res.ok) {
      throw new Error(
        `Couldn't remove the uploaded data from the server (HTTP ${res.status}). Your data on this device is unchanged.`,
      );
    }
    clearProgress();
    store.setPhase("cancelled");
    console.log("[migration] cancelled and server data cleaned up");
  } catch (error) {
    store.setPhase("error");
    store.setError(error instanceof Error ? error.message : String(error));
    console.log("[migration] cancel error:", error instanceof Error ? error.message : error);
  } finally {
    cancelRequested = false;
  }
}

export function resumeMigration(): Promise<void> {
  cancelRequested = false;
  return trackRun(runResumeMigration());
}

async function runResumeMigration(): Promise<void> {
  const saved = loadProgress();
  if (!saved) {
    await runStartMigration();
    return;
  }

  const store = useMigrationStore.getState();
  store.setPhase("uploading");
  store.setError(null);

  // Restoring the saved progress runs inside the try as well: a failure there
  // has to reach the error phase, or the dialog stays on "uploading" with no
  // way to close it.
  try {
    await preCountTables();

    for (const [table, progress] of Object.entries(saved.tableProgress)) {
      const current = store.tableProgress[table];
      if (current) {
        store.setTableProgress(table, {
          ...current,
          uploaded: progress.uploaded,
          lastBatchIndex: progress.lastBatchIndex,
          rejected: progress.rejected ?? 0,
        });
      }
    }

    const queueIdRef = {
      value: Object.values(saved.tableProgress).reduce((sum, p) => sum + p.uploaded, 0),
    };

    for (let i = 0; i < TABLE_PUSH_ORDER.length; i++) {
      const tableName = TABLE_PUSH_ORDER[i] as TableName;
      const existingProgress = saved.tableProgress[tableName];

      const records = await db.table(tableName).toArray();
      if (existingProgress && existingProgress.uploaded >= records.length) {
        console.log(`[migration] skipping ${tableName} (already uploaded)`);
        continue;
      }

      const startBatch = existingProgress ? existingProgress.lastBatchIndex + 1 : 0;
      await uploadTable(tableName, i, startBatch, queueIdRef);
    }

    console.log("[migration] resume upload complete");
    store.setPhase("complete");
  } catch (error) {
    failUpload("resume", error);
  }
}

export async function completeMigration(): Promise<void> {
  useSettingsStore.getState().setStorageMode("cloud-sync");
  useSyncStatusStore.setState({ modeChosenByUser: true });
  useSyncStatusStore.getState().markPushed();
  clearProgress();
  useMigrationStore.getState().setPhase("complete");
  console.log("[migration] migration complete, storageMode set to cloud-sync");
}

export function checkInterruptedMigration(): boolean {
  return loadProgress() !== null;
}
