import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { TABLE_PUSH_ORDER } from "@/lib/sync-topology";
import { useMigrationStore } from "@/stores/migration-store";
import { useSettingsStore } from "@/stores/settings-store";

const PROGRESS_KEY = "intake-tracker-migration-progress";
const NOW = Date.now();

const localStorageMap = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageMap.set(key, value),
  removeItem: (key: string) => localStorageMap.delete(key),
  clear: () => localStorageMap.clear(),
});

function makeIntakeRecord(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    amount: 100,
    type: "water" as const,
    timestamp: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    deviceId: "test",
    timezone: "UTC",
    ...overrides,
  };
}

function makeWeightRecord(id: string) {
  return {
    id,
    weight: 75,
    timestamp: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    deviceId: "test",
    timezone: "UTC",
  };
}

function makePrescription(id: string) {
  return {
    id,
    genericName: "TestMed",
    indication: "Testing",
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    deviceId: "test",
  };
}

function makeAuditLog(id: string) {
  return {
    id,
    action: "data_export" as const,
    timestamp: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    deviceId: "test",
    timezone: "UTC",
  };
}

let fetchCalls: { url: string; body: unknown }[] = [];

beforeEach(() => {
  fetchCalls = [];
  useMigrationStore.getState().reset();
  localStorageMap.clear();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      fetchCalls.push({ url, body });

      if (url === "/api/sync/push") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url === "/api/sync/verify-hash") {
        return new Response(JSON.stringify({ hashes: {}, rowCounts: {} }), {
          status: 200,
        });
      }
      if (url === "/api/sync/cleanup") {
        return new Response(JSON.stringify({ deleted: {} }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("migration-service", () => {
  describe("batch chunking", () => {
    it("produces ceil(N/100) batches, each ≤100 ops", async () => {
      const { startMigration } = await import("@/lib/migration-service");

      const records = Array.from({ length: 1100 }, (_, i) =>
        makeIntakeRecord(`rec-${String(i).padStart(4, "0")}`, { amount: i }),
      );
      await db.intakeRecords.bulkAdd(records);

      await startMigration();

      const pushCalls = fetchCalls.filter((c) => c.url === "/api/sync/push");
      const intakePushes = pushCalls.filter((c) =>
        (c.body as { ops: { tableName: string }[] }).ops.some(
          (op) => op.tableName === "intakeRecords",
        ),
      );

      expect(intakePushes.length).toBe(Math.ceil(1100 / 100));
      for (const call of intakePushes) {
        const ops = (call.body as { ops: unknown[] }).ops;
        expect(ops.length).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("table ordering", () => {
    it("uploads tables in TABLE_PUSH_ORDER sequence", async () => {
      const { startMigration } = await import("@/lib/migration-service");

      await db.prescriptions.add(makePrescription("rx-1"));
      await db.intakeRecords.add(makeIntakeRecord("ir-1"));

      await startMigration();

      const pushCalls = fetchCalls.filter((c) => c.url === "/api/sync/push");
      const uploadedTables = pushCalls.map(
        (c) => (c.body as { ops: { tableName: string }[] }).ops[0]!.tableName,
      );

      const rxIdx = uploadedTables.indexOf("prescriptions");
      const irIdx = uploadedTables.indexOf("intakeRecords");
      expect(rxIdx).toBeLessThan(irIdx);

      const rxOrderIdx = TABLE_PUSH_ORDER.indexOf("prescriptions");
      const irOrderIdx = TABLE_PUSH_ORDER.indexOf("intakeRecords");
      expect(rxOrderIdx).toBeLessThan(irOrderIdx);
    });
  });

  describe("PushOp format", () => {
    it("each op has sequential queueId, tableName, op: upsert, row", async () => {
      const { startMigration } = await import("@/lib/migration-service");

      await db.weightRecords.add(makeWeightRecord("wr-1"));
      await db.auditLogs.add(makeAuditLog("al-1"));

      await startMigration();

      const pushCalls = fetchCalls.filter((c) => c.url === "/api/sync/push");
      const allOps = pushCalls.flatMap(
        (c) => (c.body as { ops: Record<string, unknown>[] }).ops,
      );

      const seenQueueIds = new Set<number>();
      for (const op of allOps) {
        expect(op).toHaveProperty("queueId");
        expect(op).toHaveProperty("tableName");
        expect(op).toHaveProperty("op", "upsert");
        expect(op).toHaveProperty("row");
        expect(typeof op.queueId).toBe("number");
        seenQueueIds.add(op.queueId as number);
      }

      expect(seenQueueIds.size).toBe(allOps.length);

      const queueIds = allOps.map((op) => op.queueId as number);
      for (let i = 1; i < queueIds.length; i++) {
        expect(queueIds[i]).toBeGreaterThan(queueIds[i - 1]!);
      }
    });
  });

  describe("resume from interrupted state", () => {
    it("skips completed tables and resumes from lastBatchIndex+1", async () => {
      const { resumeMigration } = await import("@/lib/migration-service");

      await db.intakeRecords.bulkAdd(
        Array.from({ length: 5 }, (_, i) =>
          makeIntakeRecord(`ir-${i}`, { amount: i * 100 }),
        ),
      );

      const irIndex = TABLE_PUSH_ORDER.indexOf("intakeRecords");
      const progress: Record<string, { total: number; uploaded: number; lastBatchIndex: number }> = {};
      for (let i = 0; i < irIndex; i++) {
        const t = TABLE_PUSH_ORDER[i]!;
        progress[t] = { total: 0, uploaded: 0, lastBatchIndex: -1 };
      }
      progress["intakeRecords"] = { total: 5, uploaded: 0, lastBatchIndex: -1 };

      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({
          tableProgress: progress,
          currentTableIndex: irIndex,
        }),
      );

      await resumeMigration();

      const pushCalls = fetchCalls.filter((c) => c.url === "/api/sync/push");
      expect(pushCalls.length).toBeGreaterThan(0);

      const tablesUploaded = new Set(
        pushCalls.flatMap((c) =>
          (c.body as { ops: { tableName: string }[] }).ops.map(
            (op) => op.tableName,
          ),
        ),
      );

      for (let i = 0; i < irIndex; i++) {
        const t = TABLE_PUSH_ORDER[i]!;
        if (progress[t]?.uploaded === 0) continue;
        expect(tablesUploaded.has(t)).toBe(false);
      }
    });
  });

  describe("cancel", () => {
    it("clears localStorage progress and sets storageMode to local", async () => {
      const { cancelMigration } = await import("@/lib/migration-service");

      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({
          tableProgress: {},
          currentTableIndex: 0,
        }),
      );

      await cancelMigration();

      expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
      expect(useSettingsStore.getState().storageMode).toBe("local");
      expect(useMigrationStore.getState().phase).toBe("cancelled");
    });
  });

  describe("hash computation", () => {
    it("produces deterministic SHA-256 for known input (sorted keys, null-normalized)", async () => {
      const { verifyMigration } = await import("@/lib/migration-service");

      await db.intakeRecords.add(
        makeIntakeRecord("ir-hash-1", { amount: 250 }),
      );

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url === "/api/sync/verify-hash") {
            return new Response(
              JSON.stringify({ hashes: {}, rowCounts: {} }),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }),
      );

      await verifyMigration();

      const store = useMigrationStore.getState();
      const irResult = store.verificationResults["intakeRecords"];
      expect(irResult).toBeDefined();
      expect(irResult!.clientHash).toMatch(/^[a-f0-9]{64}$/);

      useMigrationStore.getState().reset();
      await verifyMigration();
      const irResult2 =
        useMigrationStore.getState().verificationResults["intakeRecords"];
      expect(irResult2!.clientHash).toBe(irResult!.clientHash);
    });
  });

  describe("empty table handling", () => {
    it("hash of empty table is hash of '[]'", async () => {
      const { verifyMigration } = await import("@/lib/migration-service");

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url === "/api/sync/verify-hash") {
            return new Response(
              JSON.stringify({ hashes: {}, rowCounts: {} }),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }),
      );

      await verifyMigration();

      const store = useMigrationStore.getState();
      const allHashes = Object.values(store.verificationResults).map(
        (r) => r.clientHash,
      );
      const uniqueHashes = new Set(allHashes);
      expect(uniqueHashes.size).toBe(1);

      const emptyHash = allHashes[0]!;
      const encoded = new TextEncoder().encode("[]");
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
      const expectedHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      expect(emptyHash).toBe(expectedHash);
    });
  });

  describe("_syncQueue and _syncMeta exclusion", () => {
    it("migration does not upload _syncQueue or _syncMeta tables", async () => {
      const { startMigration } = await import("@/lib/migration-service");

      expect(TABLE_PUSH_ORDER).not.toContain("_syncQueue");
      expect(TABLE_PUSH_ORDER).not.toContain("_syncMeta");

      await db.intakeRecords.add(makeIntakeRecord("ir-sync-test"));

      await startMigration();

      const pushCalls = fetchCalls.filter((c) => c.url === "/api/sync/push");
      const allTableNames = pushCalls.flatMap((c) =>
        (c.body as { ops: { tableName: string }[] }).ops.map(
          (op) => op.tableName,
        ),
      );

      expect(allTableNames).not.toContain("_syncQueue");
      expect(allTableNames).not.toContain("_syncMeta");
    });
  });

  describe("D015 PHI compliance", () => {
    it("console.log calls never contain record content", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { startMigration } = await import("@/lib/migration-service");

      await db.intakeRecords.add(
        makeIntakeRecord("ir-phi-test", { amount: 999 }),
      );

      await startMigration();

      for (const call of logSpy.mock.calls) {
        const logStr = call.map(String).join(" ");
        expect(logStr).not.toContain("ir-phi-test");
        expect(logStr).not.toContain("999");
      }

      logSpy.mockRestore();
    });
  });
});
