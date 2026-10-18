/**
 * The synced-write module, tested at its interface: what a write leaves in
 * the table and in the sync queue.
 *
 * The property test stands in for the per-service "enqueues an upsert"
 * asserts: whatever sequence of writes a service makes, every row it touched
 * is queued exactly once, with the op its stored state calls for, stamped
 * newer than before, and a tombstone never says "active".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { db } from "@/lib/db";

vi.mock("@/lib/sync-engine", () => ({ schedulePush: vi.fn() }));

import { schedulePush } from "@/lib/sync-engine";
import {
  syncedWrite,
  retireChanges,
  syncOpFor,
  type SyncedTable,
} from "@/lib/synced-write";
import {
  makeIntakeRecord,
  makeMedicationPhase,
  makePrescription,
  makeTitrationPlan,
} from "@/__tests__/fixtures/db-fixtures";

const BASE_TS = 1_700_000_000_000;

async function queued(): Promise<Array<[string, string, string]>> {
  return (await db._syncQueue.toArray()).map((q) => [q.tableName, q.recordId, q.op]);
}

beforeEach(() => {
  vi.mocked(schedulePush).mockClear();
});

describe("syncedWrite", () => {
  it("insert stores the row as given and queues an upsert", async () => {
    const row = makeIntakeRecord({ id: "w1" });
    await syncedWrite(["intakeRecords"], (w) => w.insert("intakeRecords", row));

    expect(await db.intakeRecords.get("w1")).toEqual(row);
    expect(await queued()).toEqual([["intakeRecords", "w1", "upsert"]]);
    expect(schedulePush).toHaveBeenCalledTimes(1);
  });

  it("patch stamps updatedAt with the write's now and clears undefined fields", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "w1", note: "old" }));

    const written = await syncedWrite(
      ["intakeRecords"],
      (w) => w.patch("intakeRecords", "w1", { amount: 300, note: undefined }),
      { now: BASE_TS + 10 },
    );

    const row = (await db.intakeRecords.get("w1"))!;
    expect(row.amount).toBe(300);
    expect(row.updatedAt).toBe(BASE_TS + 10);
    expect("note" in row).toBe(false);
    expect(written).toEqual(row);
    expect(await queued()).toEqual([["intakeRecords", "w1", "upsert"]]);
  });

  it("patch of a missing row writes and queues nothing", async () => {
    const written = await syncedWrite(["intakeRecords"], (w) =>
      w.patch("intakeRecords", "nope", { amount: 1 }),
    );
    expect(written).toBeUndefined();
    expect(await queued()).toEqual([]);
    expect(schedulePush).not.toHaveBeenCalled();
  });

  it("tombstone queues a delete and retires the lifecycle flag", async () => {
    await db.prescriptions.add(makePrescription({ id: "rx" }));

    const done = await syncedWrite(["prescriptions"], (w) => w.tombstone("prescriptions", "rx"), {
      now: BASE_TS + 5,
    });

    expect(done).toBe(true);
    expect(await db.prescriptions.get("rx")).toMatchObject({
      deletedAt: BASE_TS + 5,
      updatedAt: BASE_TS + 5,
      isActive: false,
    });
    expect(await queued()).toEqual([["prescriptions", "rx", "delete"]]);
  });

  it("tombstone leaves a missing row or an existing tombstone alone", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "gone", deletedAt: BASE_TS }));

    const results = await syncedWrite(["intakeRecords"], async (w) => [
      await w.tombstone("intakeRecords", "gone"),
      await w.tombstone("intakeRecords", "never"),
    ]);

    expect(results).toEqual([false, false]);
    expect((await db.intakeRecords.get("gone"))!.updatedAt).toBe(BASE_TS);
    expect(await queued()).toEqual([]);
  });

  it("restore brings a tombstone back as an upsert", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "w1", deletedAt: BASE_TS }));

    expect(await syncedWrite(["intakeRecords"], (w) => w.restore("intakeRecords", "w1"))).toBe(true);

    expect((await db.intakeRecords.get("w1"))!.deletedAt).toBeNull();
    expect(await queued()).toEqual([["intakeRecords", "w1", "upsert"]]);
  });

  it("a patch that sets deletedAt is a tombstone: delete op, flag retired", async () => {
    await db.medicationPhases.add(makeMedicationPhase("rx", { id: "ph", status: "active" }));

    await syncedWrite(["medicationPhases"], (w) =>
      w.patch("medicationPhases", "ph", { deletedAt: BASE_TS }),
    );

    expect((await db.medicationPhases.get("ph"))!.status).toBe("cancelled");
    expect(await queued()).toEqual([["medicationPhases", "ph", "delete"]]);
  });

  it("put retires a tombstone and can store a row without queueing it", async () => {
    await syncedWrite(["prescriptions"], async (w) => {
      await w.put("prescriptions", makePrescription({ id: "a", deletedAt: BASE_TS }));
      await w.put("prescriptions", makePrescription({ id: "b", deletedAt: BASE_TS }), {
        queue: false,
      });
    });

    expect((await db.prescriptions.get("a"))!.isActive).toBe(false);
    expect((await db.prescriptions.get("b"))!.isActive).toBe(false);
    expect(await queued()).toEqual([["prescriptions", "a", "delete"]]);
  });

  it("audit writes a synced audit row inside any write", async () => {
    const entry = await syncedWrite(["intakeRecords"], (w) =>
      w.audit("data_import", { count: 3 }),
    );

    expect(await db.auditLogs.get(entry.id)).toMatchObject({
      action: "data_import",
      details: JSON.stringify({ count: 3 }),
      deletedAt: null,
    });
    expect(await queued()).toEqual([["auditLogs", entry.id, "upsert"]]);
  });

  it("requeue queues a stored row as it stands", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "t", deletedAt: BASE_TS }));
    await syncedWrite(["intakeRecords"], async (w) => {
      expect(await w.requeue("intakeRecords", "t")).toBe(true);
      expect(await w.requeue("intakeRecords", "missing")).toBe(false);
    });
    expect(await queued()).toEqual([["intakeRecords", "t", "delete"]]);
    expect((await db.intakeRecords.get("t"))!.updatedAt).toBe(BASE_TS);
  });

  it("rolls back every row and queue entry when the body throws", async () => {
    await expect(
      syncedWrite(["intakeRecords"], async (w) => {
        await w.insert("intakeRecords", makeIntakeRecord({ id: "w1" }));
        await w.audit("data_import");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await db.intakeRecords.count()).toBe(0);
    expect(await db.auditLogs.count()).toBe(0);
    expect(await queued()).toEqual([]);
    expect(schedulePush).not.toHaveBeenCalled();
  });

  it("joins a transaction that is already open, and commits with it", async () => {
    await expect(
      db.transaction("rw", [db.intakeRecords, db._syncQueue], async () => {
        await syncedWrite(["intakeRecords"], (w) =>
          w.insert("intakeRecords", makeIntakeRecord({ id: "inner" })),
        );
        throw new Error("outer fails");
      }),
    ).rejects.toThrow("outer fails");

    expect(await db.intakeRecords.get("inner")).toBeUndefined();
    expect(await queued()).toEqual([]);
  });

  it("does not schedule a push when nothing was queued", async () => {
    await syncedWrite(["intakeRecords"], async () => undefined);
    expect(schedulePush).not.toHaveBeenCalled();
  });

  it("queues without scheduling a push when schedule is false", async () => {
    await db.intakeRecords.add(makeIntakeRecord({ id: "m1" }));
    await syncedWrite(["intakeRecords"], (w) => w.requeue("intakeRecords", "m1"), {
      schedule: false,
    });
    expect(await queued()).toEqual([["intakeRecords", "m1", "upsert"]]);
    expect(schedulePush).not.toHaveBeenCalled();
  });
});

describe("retireChanges", () => {
  it("switches each lifecycle flag off and keeps finished history", () => {
    expect(retireChanges("prescriptions", { isActive: true })).toEqual({ isActive: false });
    expect(retireChanges("inventoryItems", { isActive: true })).toEqual({ isActive: false });
    expect(retireChanges("phaseSchedules", { enabled: true })).toEqual({ enabled: false });
    expect(retireChanges("medicationPhases", { status: "pending" })).toEqual({ status: "cancelled" });
    expect(retireChanges("medicationPhases", { status: "completed" })).toEqual({});
    expect(retireChanges("titrationPlans", { status: "draft" })).toEqual({ status: "cancelled" });
    expect(retireChanges("titrationPlans", { status: "completed" })).toEqual({});
    expect(retireChanges("intakeRecords", { amount: 1 })).toEqual({});
  });
});

// ─── Property: every write leaves a consistent queue ────────────────────

const IDS = ["a", "b", "c"] as const;
type Table3 = "intakeRecords" | "prescriptions" | "titrationPlans";
const TABLES: readonly Table3[] = ["intakeRecords", "prescriptions", "titrationPlans"];

type Cmd =
  | { kind: "insert"; table: Table3; id: string }
  | { kind: "patch"; table: Table3; id: string; value: number }
  | { kind: "tombstone"; table: Table3; id: string }
  | { kind: "restore"; table: Table3; id: string };

const cmdArb: fc.Arbitrary<Cmd> = fc.record({
  kind: fc.constantFrom("insert", "patch", "tombstone", "restore"),
  table: fc.constantFrom(...TABLES),
  id: fc.constantFrom(...IDS),
  value: fc.integer({ min: 1, max: 5000 }),
}) as fc.Arbitrary<Cmd>;

function freshRow(table: Table3, id: string) {
  if (table === "intakeRecords") return makeIntakeRecord({ id });
  if (table === "prescriptions") return makePrescription({ id });
  return makeTitrationPlan({ id, status: "active" });
}

function patchFor(table: Table3, value: number): Record<string, unknown> {
  if (table === "intakeRecords") return { amount: value };
  if (table === "prescriptions") return { notes: `n${value}`, isActive: true };
  return { title: `t${value}`, status: "active" };
}

async function apply(cmd: Cmd, now: number): Promise<boolean> {
  const t = cmd.table as SyncedTable;
  return syncedWrite([t], async (w) => {
    switch (cmd.kind) {
      case "insert":
        if (await db.table(t).get(cmd.id)) return false;
        await w.insert(t, freshRow(cmd.table, cmd.id) as never);
        return true;
      case "patch":
        return (await w.patch(t, cmd.id, patchFor(cmd.table, (cmd as { value: number }).value) as never)) !== undefined;
      case "tombstone":
        return w.tombstone(t, cmd.id);
      case "restore":
        return w.restore(t, cmd.id);
    }
  }, { now });
}

describe("property: the queue always matches the rows", () => {
  it("every touched row is queued once, with its op, stamped, and retired when deleted", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmdArb, { minLength: 1, maxLength: 25 }), async (cmds) => {
        await Promise.all([db._syncQueue.clear(), ...TABLES.map((t) => db.table(t).clear())]);
        const touched = new Map<string, number>();
        let now = BASE_TS + 1;
        for (const cmd of cmds) {
          now += 1;
          if (await apply(cmd, now)) touched.set(`${cmd.table}:${cmd.id}`, now);
        }

        const queue = await db._syncQueue.toArray();
        const keys = queue.map((q) => `${q.tableName}:${q.recordId}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(new Set(keys)).toEqual(new Set(touched.keys()));

        for (const q of queue) {
          const row = (await db.table(q.tableName).get(q.recordId)) as Record<string, unknown> & {
            deletedAt: number | null;
            updatedAt: number;
          };
          expect(q.op).toBe(syncOpFor(row));
          const stamped = touched.get(`${q.tableName}:${q.recordId}`)!;
          // An insert keeps its own stamp; every later write stamps `now`.
          expect([BASE_TS, stamped]).toContain(row.updatedAt);
          if (row.deletedAt != null) {
            expect(retireChanges(q.tableName as SyncedTable, row)).toEqual({});
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});
