import { db } from "@/lib/db";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import type { PushOp } from "@/lib/sync-payload";
import { useMigrationStore } from "@/stores/migration-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

const BATCH_SIZE = 100;
const PROGRESS_KEY = "intake-tracker-migration-progress";
const MAX_RETRIES = 3;

interface PersistedProgress {
  tableProgress: Record<string, { total: number; uploaded: number; lastBatchIndex: number }>;
  currentTableIndex: number;
}

function persistProgress(progress: PersistedProgress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function loadProgress(): PersistedProgress | null {
  const raw = localStorage.getItem(PROGRESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedProgress;
  } catch {
    return null;
  }
}

function clearProgress(): void {
  localStorage.removeItem(PROGRESS_KEY);
}

function deterministicJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, (_, value) =>
    value === undefined
      ? null
      : value && typeof value === "object" && !Array.isArray(value)
        ? Object.keys(value)
            .sort()
            .reduce<Record<string, unknown>>((acc, k) => {
              acc[k] = (value as Record<string, unknown>)[k];
              return acc;
            }, {})
        : value,
  );
}

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const res = await fetch(url, {
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

  for (let batchIdx = startBatch; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]!;
    const ops: PushOp[] = batch.map((record) => ({
      queueId: queueIdRef.value++,
      tableName,
      op: "upsert" as const,
      row: record,
    }));

    await postWithRetry("/api/sync/push", { ops });

    const uploaded = Math.min((batchIdx + 1) * BATCH_SIZE, total);
    store.setTableProgress(tableName, { total, uploaded, lastBatchIndex: batchIdx });

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

export async function startMigration(): Promise<void> {
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
    store.setPhase("error");
    store.setError(error instanceof Error ? error.message : String(error));
    console.log("[migration] upload error:", error instanceof Error ? error.message : error);
  }
}

export async function verifyMigration(): Promise<boolean> {
  const store = useMigrationStore.getState();

  try {
    const res = await fetch("/api/sync/verify-hash", { method: "POST" });
    if (!res.ok) {
      throw new Error(`Verify-hash request failed: ${res.status}`);
    }

    const { hashes: serverHashes } = (await res.json()) as {
      hashes: Record<string, string>;
      rowCounts: Record<string, number>;
    };

    let allMatch = true;

    for (const tableName of TABLE_PUSH_ORDER) {
      const records = await db.table(tableName).toArray();
      const sorted = records
        .slice()
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          String(a.id ?? "").localeCompare(String(b.id ?? "")),
        );

      const json = deterministicJson(sorted);
      const clientHash = await sha256Hex(json);
      const serverHash = serverHashes[tableName] ?? "";
      const match = clientHash === serverHash;

      if (!match) allMatch = false;

      store.setVerificationResult(tableName, { clientHash, serverHash, match });
      console.log(
        `[migration] verify ${tableName}: ${match ? "match" : "MISMATCH"}`,
      );
    }

    return allMatch;
  } catch (error) {
    store.setPhase("error");
    store.setError(error instanceof Error ? error.message : String(error));
    console.log("[migration] verification error:", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function cancelMigration(): Promise<void> {
  const store = useMigrationStore.getState();

  try {
    await fetch("/api/sync/cleanup", { method: "POST" });
    clearProgress();
    useSettingsStore.getState().setStorageMode("local");
    store.setPhase("cancelled");
    console.log("[migration] cancelled and server data cleaned up");
  } catch (error) {
    store.setPhase("error");
    store.setError(error instanceof Error ? error.message : String(error));
    console.log("[migration] cancel error:", error instanceof Error ? error.message : error);
  }
}

export async function resumeMigration(): Promise<void> {
  const saved = loadProgress();
  if (!saved) {
    await startMigration();
    return;
  }

  const store = useMigrationStore.getState();
  store.setPhase("uploading");
  store.setError(null);

  await preCountTables();

  for (const [table, progress] of Object.entries(saved.tableProgress)) {
    const current = store.tableProgress[table];
    if (current) {
      store.setTableProgress(table, { ...current, uploaded: progress.uploaded, lastBatchIndex: progress.lastBatchIndex });
    }
  }

  const queueIdRef = {
    value: Object.values(saved.tableProgress).reduce((sum, p) => sum + p.uploaded, 0),
  };

  try {
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
    store.setPhase("error");
    store.setError(error instanceof Error ? error.message : String(error));
    console.log("[migration] resume error:", error instanceof Error ? error.message : error);
  }
}

export async function completeMigration(): Promise<void> {
  useSettingsStore.getState().setStorageMode("cloud-sync");
  useSyncStatusStore.getState().markPushed();
  clearProgress();
  useMigrationStore.getState().setPhase("complete");
  console.log("[migration] migration complete, storageMode set to cloud-sync");
}

export function checkInterruptedMigration(): boolean {
  return loadProgress() !== null;
}
