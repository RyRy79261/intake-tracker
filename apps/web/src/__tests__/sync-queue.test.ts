import { describe, it, expect, beforeEach, vi } from "vitest";
import { db, type IntakeRecord } from "@/lib/db";
import {
  enqueue,
  enqueueInsideTx,
  ack,
  getQueueDepth,
  writeWithSync,
} from "@/lib/sync-queue";

function makeIntake(overrides: Partial<IntakeRecord> = {}): IntakeRecord {
  const now = Date.now();
  return {
    id: "r1",
    type: "water",
    amount: 250,
    timestamp: now,
    source: "manual",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: "test-device",
    timezone: "UTC",
    ...overrides,
  };
}

describe("sync-queue", () => {
  beforeEach(async () => {
    // Global setup already re-opens a fresh db; ensure tables are empty.
    await db._syncQueue.clear();
    await db.intakeRecords.clear();
  });

  it("atomic write and enqueue rolls back both tables on throw", async () => {
    const record = makeIntake({ id: "rollback-1" });

    await expect(
      writeWithSync("intakeRecords", "upsert", async () => {
        await db.intakeRecords.add(record);
        throw new Error("simulated failure");
      }),
    ).rejects.toThrow("simulated failure");

    const intakeCount = await db.intakeRecords.count();
    const queueCount = await db._syncQueue.count();
    expect(intakeCount).toBe(0);
    expect(queueCount).toBe(0);
  });

  it("coalesce upsert+upsert updates enqueuedAt without duplicating", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1000);
    await enqueue("intakeRecords", "r1", "upsert");

    vi.spyOn(Date, "now").mockReturnValueOnce(2000);
    await enqueue("intakeRecords", "r1", "upsert");

    const rows = await db._syncQueue.toArray();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toBeDefined();
    expect(row!.op).toBe("upsert");
    expect(row!.enqueuedAt).toBe(2000);
  });

  it("coalesce delete supersedes queued upsert for same recordId", async () => {
    await enqueue("intakeRecords", "r1", "upsert");
    await enqueue("intakeRecords", "r1", "delete");

    const rows = await db._syncQueue.toArray();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toBeDefined();
    expect(row!.op).toBe("delete");
    expect(row!.attempts).toBe(0);
  });

  it("coalesce upsert after delete replaces delete (un-delete path)", async () => {
    await enqueue("intakeRecords", "r1", "delete");
    await enqueue("intakeRecords", "r1", "upsert");

    const rows = await db._syncQueue.toArray();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toBeDefined();
    expect(row!.op).toBe("upsert");
    expect(row!.attempts).toBe(0);
  });

  it("enqueueInsideTx coalesces inside an externally-opened transaction", async () => {
    await db.transaction("rw", db._syncQueue, async () => {
      await enqueueInsideTx("intakeRecords", "tx-1", "upsert");
      await enqueueInsideTx("intakeRecords", "tx-1", "delete");
    });

    const rows = await db._syncQueue.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.op).toBe("delete");
    expect(rows[0]!.attempts).toBe(0);
  });

  it("coalesce upsert+upsert preserves attempts (D-04: keep attempts as-is)", async () => {
    // Regression guard for Stryker mutants at src/lib/sync-queue.ts:62.
    // Emptying the `if (existing.op === op)` body — or replacing the
    // condition with `false` — silently falls through to the op-
    // transition path, which RESETS attempts to 0. The upsert+upsert
    // test above asserts on op and enqueuedAt but not attempts, so it
    // would pass with either mutant in place. This test pins the
    // documented invariant: same-op coalesce must leave attempts alone.
    await enqueue("intakeRecords", "r1", "upsert");

    // Bump attempts to simulate a partial retry already in flight.
    const initial = await db._syncQueue.toArray();
    expect(initial).toHaveLength(1);
    await db._syncQueue.update(initial[0]!.id!, { attempts: 3 });

    // Re-enqueue the same op — attempts must NOT be reset.
    await enqueue("intakeRecords", "r1", "upsert");

    const rows = await db._syncQueue.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attempts).toBe(3);
    expect(rows[0]!.op).toBe("upsert");
  });

  it("coalesce delete+delete preserves attempts (mirror of upsert+upsert)", async () => {
    // Same invariant for the delete branch — both arms of the
    // `if (existing.op === op)` check must hold the docstring.
    await enqueue("intakeRecords", "r1", "delete");
    const initial = await db._syncQueue.toArray();
    await db._syncQueue.update(initial[0]!.id!, { attempts: 5 });

    await enqueue("intakeRecords", "r1", "delete");

    const rows = await db._syncQueue.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attempts).toBe(5);
    expect(rows[0]!.op).toBe("delete");
  });

  it("ack with an empty queueIds array is a true no-op (never touches Dexie)", async () => {
    // Regression guard for Stryker mutant at src/lib/sync-queue.ts:95.
    // Replacing `if (queueIds.length === 0) return;` with
    // `if (false) return;` calls bulkDelete([]) — a no-op at Dexie's
    // level, so any test that only checks queue contents passes either
    // way. We pin the behaviour by spying on bulkDelete and asserting
    // it's NEVER invoked on the early-return path.
    const spy = vi.spyOn(db._syncQueue, "bulkDelete");
    try {
      await ack([]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("ack deletes only specified queueIds and leaves others untouched", async () => {
    await enqueue("intakeRecords", "r1", "upsert");
    await enqueue("intakeRecords", "r2", "upsert");
    await enqueue("intakeRecords", "r3", "upsert");

    const rows = await db._syncQueue.toArray();
    expect(rows).toHaveLength(3);

    // Ack r1 and r2 only
    const toAck = rows
      .filter((r) => r.recordId === "r1" || r.recordId === "r2")
      .map((r) => r.id!);
    await ack(toAck);

    expect(await getQueueDepth()).toBe(1);
    const remaining = await db._syncQueue.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.recordId).toBe("r3");
  });
});
