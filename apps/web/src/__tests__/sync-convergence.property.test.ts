/**
 * Two devices, one server: after any sequence of edits, deletes, restores
 * and syncs on either device, a final round of syncs leaves both devices and
 * the server agreeing on every record.
 *
 * Both devices run the real sync engine and the real services, each on its
 * own IndexedDB (the active database is swapped between them), against an
 * in-memory server that applies the same conflict rules as the push route
 * (lib/sync-protocol.ts) through the engine's transport port.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  db,
  createPreviewDatabase,
  resetActiveDatabase,
  setActiveDatabase,
  type AppDatabase,
} from "@/lib/db";
import {
  __resetEngineForTests,
  runPullCycle,
  runPushCycle,
  setSyncTransport,
  waitForSyncIdle,
} from "@/lib/sync-engine";
import { addIntakeRecord, deleteIntakeRecord, updateIntakeRecord } from "@/lib/intake-service";
import { syncedWrite } from "@/lib/synced-write";
import { createInMemorySyncServer } from "@/__tests__/helpers/in-memory-sync-server";

type Device = "A" | "B";
type Action =
  | { device: Device; kind: "add"; slot: number; amount: number }
  | { device: Device; kind: "edit"; slot: number; amount: number }
  | { device: Device; kind: "delete"; slot: number }
  | { device: Device; kind: "restore"; slot: number }
  | { device: Device; kind: "sync" };

const SLOTS = 3;

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.record({
    device: fc.constantFrom<Device>("A", "B"),
    kind: fc.constant("add" as const),
    slot: fc.nat(SLOTS - 1),
    amount: fc.integer({ min: 1, max: 1000 }),
  }),
  fc.record({
    device: fc.constantFrom<Device>("A", "B"),
    kind: fc.constant("edit" as const),
    slot: fc.nat(SLOTS - 1),
    amount: fc.integer({ min: 1, max: 1000 }),
  }),
  fc.record({
    device: fc.constantFrom<Device>("A", "B"),
    kind: fc.constant("delete" as const),
    slot: fc.nat(SLOTS - 1),
  }),
  fc.record({
    device: fc.constantFrom<Device>("A", "B"),
    kind: fc.constant("restore" as const),
    slot: fc.nat(SLOTS - 1),
  }),
  fc.record({ device: fc.constantFrom<Device>("A", "B"), kind: fc.constant("sync" as const) }),
);

let deviceB: AppDatabase;
const realDb = db;

beforeEach(() => {
  __resetEngineForTests();
  deviceB = createPreviewDatabase();
});

afterEach(async () => {
  setSyncTransport(null);
  resetActiveDatabase();
  deviceB.close();
  await deviceB.delete();
  __resetEngineForTests();
});

/** Run `fn` as one device: its database is the active one meanwhile. */
async function as<T>(device: Device, fn: () => Promise<T>): Promise<T> {
  if (device === "B") setActiveDatabase(deviceB);
  else resetActiveDatabase();
  try {
    const result = await fn();
    await waitForSyncIdle();
    return result;
  } finally {
    resetActiveDatabase();
  }
}

async function sync(): Promise<void> {
  await runPushCycle();
  await waitForSyncIdle();
  await runPullCycle();
  await waitForSyncIdle();
}

type Snapshot = Record<string, { amount: number; deleted: boolean }>;

async function snapshot(): Promise<Snapshot> {
  const rows = await db.intakeRecords.toArray();
  return Object.fromEntries(
    rows.map((r) => [r.id, { amount: r.amount, deleted: r.deletedAt != null }]),
  );
}

/** Each slot is one record, created on whichever device adds it first. */
async function apply(action: Action, ids: (string | undefined)[]): Promise<void> {
  if (action.kind === "sync") return sync();
  const id = ids[action.slot];
  switch (action.kind) {
    case "add": {
      if (id) return;
      const res = await addIntakeRecord("water", action.amount);
      if (res.success) ids[action.slot] = res.data.id;
      return;
    }
    case "edit":
      if (id && (await db.intakeRecords.get(id))) {
        await updateIntakeRecord(id, { amount: action.amount });
      }
      return;
    case "delete":
      if (id && (await db.intakeRecords.get(id))) await deleteIntakeRecord(id);
      return;
    case "restore":
      if (id) await syncedWrite(["intakeRecords"], (w) => w.restore("intakeRecords", id));
      return;
  }
}

describe("sync convergence: two devices, one server", () => {
  it("both devices and the server agree after a final round of syncs", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 14 }), async (actions) => {
        // Fresh devices and server for every run.
        await realDb.intakeRecords.clear();
        await realDb._syncQueue.clear();
        await realDb._syncMeta.clear();
        await deviceB.intakeRecords.clear();
        await deviceB._syncQueue.clear();
        await deviceB._syncMeta.clear();
        const server = createInMemorySyncServer();
        setSyncTransport(server.transport);

        const ids: (string | undefined)[] = [];
        for (const action of actions) await as(action.device, () => apply(action, ids));

        // Final round: each pushes what it holds, then both pull everything.
        await as("A", sync);
        await as("B", sync);
        await as("A", sync);

        const a = await as("A", snapshot);
        const b = await as("B", snapshot);
        expect(b).toEqual(a);
        const onServer = Object.fromEntries(
          server
            .rows("intakeRecords")
            .map((r) => [r.id, { amount: r.amount as number, deleted: r.deletedAt != null }]),
        );
        expect(onServer).toEqual(a);
        // Nothing is left waiting to sync.
        expect(await as("A", () => db._syncQueue.count())).toBe(0);
        expect(await as("B", () => db._syncQueue.count())).toBe(0);
      }),
      { numRuns: 40 },
    );
  }, 120_000);

  it("a delete on one device reaches the other, and an older edit does not undo it", async () => {
    const server = createInMemorySyncServer();
    setSyncTransport(server.transport);

    const id = await as("A", async () => {
      const res = await addIntakeRecord("water", 250);
      if (!res.success) throw new Error(res.error);
      await sync();
      return res.data.id;
    });
    await as("B", sync);

    // B edits while A deletes; A syncs first, then B (its edit is older than
    // the delete only if it happened first, so make it so).
    await as("B", () => updateIntakeRecord(id, { amount: 300 }));
    await new Promise((r) => setTimeout(r, 5));
    await as("A", () => deleteIntakeRecord(id));
    await as("A", sync);
    await as("B", sync);
    await as("A", sync);

    expect((await as("A", snapshot))[id]).toEqual({ amount: 250, deleted: true });
    expect((await as("B", snapshot))[id]?.deleted).toBe(true);
    expect(server.rows("intakeRecords")[0]?.deletedAt).not.toBeNull();
  });
});
