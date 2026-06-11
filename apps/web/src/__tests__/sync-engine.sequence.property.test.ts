/**
 * Sequence-property tests for the sync-engine — the paradigm flagged
 * in docs/TESTING_STRATEGY.md §2.5 ("state-machine property tests for
 * sync engine") that the example-based tests in sync-engine.test.ts
 * can't cover.
 *
 * The existing tests pin specific scenarios (debounced push, online
 * trigger, ack race, etc.). A sequence test instead generates an
 * arbitrary sequence of operations (enqueue, push, ack-or-fail) and
 * asserts invariants over the resulting state. This catches the
 * "any-order works" bug class — operations that pass when run in
 * the expected order but break under a different interleaving.
 *
 * Why this matters: the sync engine is the single highest-risk module
 * in the codebase. A sequence-level regression — e.g., "after a
 * partial push failure followed by an enqueue, the next push misses
 * the enqueued row" — would be invisible to single-action tests.
 *
 * We use plain fc.asyncProperty over an array of commands rather than
 * fc.commands(), which is overkill for this codebase: the engine is
 * a module-level singleton so the system-under-test isn't easily
 * cloneable. The simpler array form gives us the same property-test
 * benefit (random sequences, shrinking on failure) without the
 * machinery.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import fc from "fast-check";
import { db, type IntakeRecord } from "@/lib/db";
import { enqueue } from "@/lib/sync-queue";
import {
  __resetEngineForTests,
  __startEngineForTests,
  runPushCycle,
} from "@/lib/sync-engine";
import { useSyncStatusStore } from "@/stores/sync-status-store";

class FakeWindow extends EventTarget {}
class FakeDocument extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

function installDom() {
  vi.stubGlobal("window", new FakeWindow());
  vi.stubGlobal("document", new FakeDocument());
  vi.stubGlobal("navigator", { onLine: true });
}

function makeIntake(id: string): IntakeRecord {
  const now = Date.now();
  return {
    id,
    type: "water",
    amount: 250,
    timestamp: now,
    source: "manual",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: "test-device",
    timezone: "UTC",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Command type — each element of the generated sequence is one of these.
// ─────────────────────────────────────────────────────────────────────────

type Command =
  | { kind: "enqueueUpsert"; id: string }
  | { kind: "enqueueDelete"; id: string }
  | { kind: "push"; serverAcceptsAll: boolean };

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  fc.record({
    kind: fc.constant("enqueueUpsert" as const),
    id: fc.constantFrom("r1", "r2", "r3", "r4", "r5"),
  }),
  fc.record({
    kind: fc.constant("enqueueDelete" as const),
    id: fc.constantFrom("r1", "r2", "r3", "r4", "r5"),
  }),
  fc.record({
    kind: fc.constant("push" as const),
    serverAcceptsAll: fc.boolean(),
  }),
);

// Sequence: 5–20 commands. Long enough to exercise interesting
// interleavings; short enough that test runtime stays bounded.
const sequenceArb = fc.array(commandArb, { minLength: 5, maxLength: 20 });

// ─────────────────────────────────────────────────────────────────────────

describe("sync-engine — sequence-property invariants", () => {
  beforeEach(async () => {
    __resetEngineForTests();
    await db._syncQueue.clear();
    await db._syncMeta.clear();
    await db.intakeRecords.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    __resetEngineForTests();
    vi.unstubAllGlobals();
  });

  it("after any command sequence, queue depth equals number of unacked enqueues", async () => {
    // Invariant: count of queue rows after all commands have run must
    // equal the count of enqueues that did NOT get acked by a
    // server-accepts-all push.
    await fc.assert(
      fc.asyncProperty(sequenceArb, async (commands) => {
        // Reset for each sequence — fast-check runs many.
        __resetEngineForTests();
        await db._syncQueue.clear();
        await db.intakeRecords.clear();

        installDom();
        __startEngineForTests();

        let modelExpectedDepth = 0;
        // Track per-id which ops are queued in the model.
        const queuedIds = new Set<string>();

        for (const cmd of commands) {
          if (cmd.kind === "enqueueUpsert" || cmd.kind === "enqueueDelete") {
            // For upserts we need an underlying intakeRecords row.
            if (cmd.kind === "enqueueUpsert") {
              const exists = await db.intakeRecords.get(cmd.id);
              if (!exists) await db.intakeRecords.add(makeIntake(cmd.id));
            }
            await enqueue(
              "intakeRecords",
              cmd.id,
              cmd.kind === "enqueueUpsert" ? "upsert" : "delete",
            );
            // Model: each (tableName, recordId) pair has at most one
            // queue row per the coalesce rules. So depth = unique ids.
            queuedIds.add(cmd.id);
            modelExpectedDepth = queuedIds.size;
          } else {
            // Push cycle. If server accepts all, the queue drains.
            const fetchMock = vi.fn(async () => {
              const rows = await db._syncQueue.toArray();
              if (cmd.serverAcceptsAll) {
                return jsonResponse({
                  accepted: rows.map((r) => ({
                    queueId: r.id!,
                    serverUpdatedAt: Date.now(),
                  })),
                });
              }
              return jsonResponse({}, 500); // server failure
            }) as unknown as Mock;
            vi.stubGlobal("fetch", fetchMock);

            await runPushCycle();
            vi.unstubAllGlobals();
            installDom();

            if (cmd.serverAcceptsAll) {
              queuedIds.clear();
              modelExpectedDepth = 0;
            }
            // On server failure, the queue stays the same — attempts
            // get bumped but no rows are removed.
          }
        }

        // Invariant check at the END of the sequence.
        const actualDepth = await db._syncQueue.count();
        expect(actualDepth).toBe(modelExpectedDepth);
      }),
      { numRuns: 15 },
    );
  }, 60_000);

  it("a successful push always leaves queueDepth=0 in the status store when it drains the queue", async () => {
    // Invariant: useSyncStatusStore.queueDepth tracks the actual
    // queue depth after a successful push that acks everything.
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom("r1", "r2", "r3", "r4", "r5"),
          { minLength: 1, maxLength: 10 },
        ),
        async (ids) => {
          __resetEngineForTests();
          await db._syncQueue.clear();
          await db.intakeRecords.clear();
          useSyncStatusStore.setState({ queueDepth: 999 }); // poison value

          installDom();
          __startEngineForTests();

          for (const id of ids) {
            const exists = await db.intakeRecords.get(id);
            if (!exists) await db.intakeRecords.add(makeIntake(id));
            await enqueue("intakeRecords", id, "upsert");
          }

          const fetchMock = vi.fn(async () => {
            const rows = await db._syncQueue.toArray();
            return jsonResponse({
              accepted: rows.map((r) => ({
                queueId: r.id!,
                serverUpdatedAt: Date.now(),
              })),
            });
          }) as unknown as Mock;
          vi.stubGlobal("fetch", fetchMock);

          await runPushCycle();

          // Successful drain: both the actual queue AND the status
          // store's tracked depth must be zero.
          expect(await db._syncQueue.count()).toBe(0);
          expect(useSyncStatusStore.getState().queueDepth).toBe(0);
        },
      ),
      { numRuns: 10 },
    );
  }, 30_000);

  it("after a failed push, every queue row's attempts is bumped exactly once", async () => {
    // Invariant: a single failed push increments attempts by 1 on
    // EVERY row that was in the batch. Catches off-by-one bugs in
    // incrementAttemptsAndReschedule.
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom("r1", "r2", "r3"),
          { minLength: 1, maxLength: 5 },
        ),
        async (ids) => {
          __resetEngineForTests();
          await db._syncQueue.clear();
          await db.intakeRecords.clear();

          installDom();
          __startEngineForTests();

          for (const id of ids) {
            const exists = await db.intakeRecords.get(id);
            if (!exists) await db.intakeRecords.add(makeIntake(id));
            await enqueue("intakeRecords", id, "upsert");
          }

          const beforeRows = await db._syncQueue.toArray();
          const beforeAttempts = new Map(
            beforeRows.map((r) => [r.id!, r.attempts ?? 0]),
          );

          vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
              throw new Error("simulated network failure");
            }) as unknown as Mock,
          );

          await runPushCycle();

          const afterRows = await db._syncQueue.toArray();
          // No rows removed — failure path doesn't ack anything.
          expect(afterRows).toHaveLength(beforeRows.length);
          for (const row of afterRows) {
            const before = beforeAttempts.get(row.id!) ?? 0;
            expect(row.attempts).toBe(before + 1);
          }
        },
      ),
      { numRuns: 10 },
    );
  }, 30_000);
});
