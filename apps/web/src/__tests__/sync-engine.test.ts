/**
 * Sync engine — push/pull/ack/cursor/backoff loop wiring (Phase 43 Plan 06
 * Task 2).
 *
 * Covers SYNC-01 (local write under offline), SYNC-02 (debounced push),
 * SYNC-03 (pull cursor + skew margin), SYNC-04 (server-authoritative ack +
 * Pitfall 3 race), SYNC-05 (online + visibility triggers).
 *
 * Strategy: vitest runs under `environment: "node"` so `window`/`document`
 * are not provided. We install lightweight polyfills via `EventTarget` that
 * satisfy the engine's addEventListener/dispatchEvent needs. `fetch` is
 * stubbed per-test via `vi.stubGlobal("fetch", ...)`.
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
import { db, type IntakeRecord } from "@/lib/db";
import { enqueue, writeWithSync } from "@/lib/sync-queue";
import {
  __resetEngineForTests,
  __startEngineForTests,
  attachLifecycleListeners,
  MAX_PUSH_ATTEMPTS,
  runPullCycle,
  runPushCycle,
  schedulePush,
  SKEW_MARGIN_MS,
} from "@/lib/sync-engine";
import { useSyncStatusStore } from "@/stores/sync-status-store";

// ─────────────────────────────────────────────────────────────────────────
// DOM polyfills — enough surface for addEventListener/dispatchEvent to work
// under vitest's `node` environment.
// ─────────────────────────────────────────────────────────────────────────

class FakeWindow extends EventTarget {}
class FakeDocument extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

function installDom(opts?: {
  onLine?: boolean;
  visibilityState?: "visible" | "hidden";
}) {
  const win = new FakeWindow();
  const doc = new FakeDocument();
  doc.visibilityState = opts?.visibilityState ?? "visible";
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", { onLine: opts?.onLine ?? true });
  return { win, doc };
}

function uninstallDom() {
  vi.unstubAllGlobals();
}

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────

describe("sync-engine", () => {
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
    vi.useRealTimers();
    uninstallDom();
  });

  it("writes locally without network", async () => {
    // SYNC-01: local write completes regardless of fetch availability.
    installDom();
    const fetchMock = vi.fn(() => {
      throw new Error("network unreachable");
    });
    vi.stubGlobal("fetch", fetchMock);

    const record = makeIntake({ id: "local-only" });
    await writeWithSync("intakeRecords", "upsert", async () => {
      await db.intakeRecords.add(record);
      return record;
    });

    // Write landed in Dexie; queue row exists; no fetch attempted.
    const stored = await db.intakeRecords.get("local-only");
    expect(stored).toBeDefined();
    expect(stored?.id).toBe("local-only");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("debounced push fires ~3s after last write when online", async () => {
    installDom();
    __startEngineForTests();

    const record = makeIntake({ id: "debounce-1" });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "debounce-1", "upsert");

    const fetchMock = vi.fn(async () =>
      jsonResponse({ accepted: [] }),
    ) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();

    // Three rapid schedulePush calls — the LAST one wins debounce.
    schedulePush();
    vi.advanceTimersByTime(1000);
    schedulePush();
    vi.advanceTimersByTime(1000);
    schedulePush();

    // At t=2s after the last call: timer should not have fired yet.
    vi.advanceTimersByTime(2000);
    expect(fetchMock).not.toHaveBeenCalled();

    // At t=3s after the last call: timer fires, runPushCycle starts.
    await vi.advanceTimersByTimeAsync(1500);

    const pushCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/sync/push"),
    );
    expect(pushCalls.length).toBe(1);
  });

  it("online triggers push", async () => {
    const { win } = installDom({ onLine: true });
    __startEngineForTests();
    const record = makeIntake({ id: "online-1" });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "online-1", "upsert");

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/sync/push")) {
        return jsonResponse({ accepted: [] });
      }
      return jsonResponse({
        result: {},
        serverTime: Date.now(),
      });
    }) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    attachLifecycleListeners();

    win.dispatchEvent(new Event("online"));
    // online handler calls schedulePush(0) → setTimeout(0) fires on next tick
    await new Promise((r) => setTimeout(r, 50));

    const pushCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/sync/push"),
    );
    expect(pushCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("visibility triggers push", async () => {
    const { doc } = installDom({ onLine: true, visibilityState: "visible" });
    __startEngineForTests();
    const record = makeIntake({ id: "vis-1" });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "vis-1", "upsert");

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/sync/push")) {
        return jsonResponse({ accepted: [] });
      }
      return jsonResponse({ result: {}, serverTime: Date.now() });
    }) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    attachLifecycleListeners();

    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10);
    await vi.runAllTimersAsync();

    const pushCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/sync/push"),
    );
    expect(pushCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("pull startup advances cursor correctly", async () => {
    installDom({ onLine: true });

    const row = {
      ...makeIntake({ id: "pulled-1" }),
      updatedAt: 1000,
    };

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        result: {
          intakeRecords: { rows: [row], hasMore: false },
        },
        serverTime: 5_000_000,
      }),
    ) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPullCycle();

    // Table drained, row's updatedAt (1000) is far below serverTime - 30s
    // (4_970_000) so no skew clamp — cursor parks on the row's tuple.
    const meta = await db._syncMeta.get("intakeRecords");
    expect(meta?.lastPulledUpdatedAt).toBe(1000);
    expect(meta?.lastPulledId).toBe("pulled-1");

    // Row actually landed in Dexie.
    const stored = await db.intakeRecords.get("pulled-1");
    expect(stored).toBeDefined();
    expect(stored?.updatedAt).toBe(1000);
  });

  it("cursor skew margin clamps advance to serverTime - 30s", async () => {
    installDom({ onLine: true });

    const row = {
      ...makeIntake({ id: "skew-1" }),
      updatedAt: 5_000_000,
    };
    const serverTime = 5_000_000;

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        result: {
          intakeRecords: { rows: [row], hasMore: false },
        },
        serverTime,
      }),
    ) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPullCycle();

    // min(5_000_000, 5_000_000 - 30_000) = 4_970_000 — skew clamp wins.
    const meta = await db._syncMeta.get("intakeRecords");
    expect(meta?.lastPulledUpdatedAt).toBe(serverTime - SKEW_MARGIN_MS);
    expect(meta?.lastPulledUpdatedAt).toBe(4_970_000);
    // Clamp resets the id half of the cursor so the next cycle re-scans the
    // whole skew window.
    expect(meta?.lastPulledId).toBe("");
  });

  it("keyset cursor paginates a run of rows sharing one updatedAt", async () => {
    installDom({ onLine: true });

    // 1200 rows all stamped with one updatedAt — the exact shape the v11
    // migration produced. A plain `updatedAt > cursor` query strands every
    // row past the first 500-row page; the (updatedAt, id) keyset cursor
    // must page through all of them.
    const SHARED_UPDATED_AT = 1000;
    const TOTAL = 1200;
    const cluster = Array.from({ length: TOTAL }, (_, i) => ({
      ...makeIntake({ id: `id-${String(i).padStart(4, "0")}` }),
      updatedAt: SHARED_UPDATED_AT,
    }));

    // fetchMock emulates the real keyset-paginated pull route.
    const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
      const reqBody = JSON.parse(String(init?.body ?? "{}")) as {
        cursors?: Record<string, { updatedAt: number; id: string }>;
      };
      const c = reqBody.cursors?.intakeRecords ?? { updatedAt: 0, id: "" };
      const after = cluster
        .filter(
          (r) =>
            r.updatedAt > c.updatedAt ||
            (r.updatedAt === c.updatedAt && r.id > c.id),
        )
        .sort((a, b) =>
          a.updatedAt !== b.updatedAt
            ? a.updatedAt - b.updatedAt
            : a.id < b.id
              ? -1
              : a.id > b.id
                ? 1
                : 0,
        );
      const page = after.slice(0, 500);
      return jsonResponse({
        result: {
          intakeRecords: { rows: page, hasMore: after.length > 500 },
        },
        serverTime: 5_000_000,
      });
    }) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPullCycle();

    // Every row in the cluster landed in Dexie — nothing stranded.
    expect(await db.intakeRecords.count()).toBe(TOTAL);
    expect(await db.intakeRecords.get("id-0499")).toBeDefined(); // first page boundary
    expect(await db.intakeRecords.get("id-0500")).toBeDefined(); // stranded by the old query
    expect(await db.intakeRecords.get("id-1199")).toBeDefined(); // last row

    // Three pages: 500 + 500 + 200.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Cursor parked on the last (updatedAt, id) tuple of the cluster.
    const meta = await db._syncMeta.get("intakeRecords");
    expect(meta?.lastPulledUpdatedAt).toBe(SHARED_UPDATED_AT);
    expect(meta?.lastPulledId).toBe("id-1199");
  });

  it("ack overwrites local updatedAt when local <= server", async () => {
    installDom({ onLine: true });

    const record = makeIntake({ id: "ack-1", updatedAt: 1000 });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "ack-1", "upsert");

    const queued = await db._syncQueue.toArray();
    const queueId = queued[0]!.id!;

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/sync/push")) {
        return jsonResponse({
          accepted: [{ queueId, serverUpdatedAt: 2000 }],
        });
      }
      // Pull triggered after successful push — return empty.
      return jsonResponse({ result: {}, serverTime: Date.now() });
    }) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();
    // Let the microtask-scheduled pull settle.
    await new Promise((r) => setTimeout(r, 0));

    const updated = await db.intakeRecords.get("ack-1");
    expect(updated?.updatedAt).toBe(2000);

    // Queue row was acked (deleted).
    const remaining = await db._syncQueue.toArray();
    expect(remaining.length).toBe(0);
  });

  it("ack does NOT overwrite local updatedAt when a newer local edit exists", async () => {
    installDom({ onLine: true });

    const record = makeIntake({ id: "ack-race", updatedAt: 5000 });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "ack-race", "upsert");

    const queued = await db._syncQueue.toArray();
    const queueId = queued[0]!.id!;

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/sync/push")) {
        return jsonResponse({
          // Server wrote back an older serverUpdatedAt — simulates the race
          // where the user made a NEWER local edit (updatedAt=5000) between
          // push start and ack receipt. applyServerAck must NOT overwrite.
          accepted: [{ queueId, serverUpdatedAt: 2000 }],
        });
      }
      return jsonResponse({ result: {}, serverTime: Date.now() });
    }) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();
    await new Promise((r) => setTimeout(r, 0));

    const preserved = await db.intakeRecords.get("ack-race");
    expect(preserved?.updatedAt).toBe(5000);
  });

  // ─── Failure-path coverage (Stryker mutant-killing) ───────────────────
  // The mutation baseline in commit 6684a1f found ~99 no-coverage mutants
  // on the error-handling paths below: network catch, 401 short-circuit,
  // non-OK status parsing, server-rejected ops. The happy-path tests
  // above never exercise these branches. The tests below pin the
  // documented behaviour of each so the next mutation pass catches a
  // regression that empties any of them.

  it("push: network error increments attempts on every queue row and sets lastError", async () => {
    installDom();
    __startEngineForTests();

    const record = makeIntake({ id: "neterr-1" });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "neterr-1", "upsert");

    // Reset the status store so we're asserting on a clean slate.
    useSyncStatusStore.setState({ lastError: null, queueDepth: 0 });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as Mock,
    );

    await runPushCycle();

    // Every queue row touched in this cycle had its attempts bumped.
    const rows = await db._syncQueue.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attempts).toBe(1);

    // lastError carries the underlying message so the UI can surface it.
    expect(useSyncStatusStore.getState().lastError).toBe("network down");
  });

  it("push: 401 from server clears lastError and skips retry (auth handled elsewhere)", async () => {
    installDom();
    __startEngineForTests();

    const record = makeIntake({ id: "auth-1" });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "auth-1", "upsert");

    // Pre-seed an error so we can prove the 401 path explicitly CLEARS it.
    useSyncStatusStore.setState({ lastError: "stale error", queueDepth: 0 });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })) as unknown as Mock,
    );

    await runPushCycle();

    // No retry: attempts NOT incremented (the row is left alone for the
    // next push cycle once auth recovers).
    const rows = await db._syncQueue.toArray();
    expect(rows[0]!.attempts ?? 0).toBe(0);

    // The 401 branch explicitly resets lastError to null.
    expect(useSyncStatusStore.getState().lastError).toBeNull();
  });

  it("push: non-OK status (500) bumps attempts and surfaces the body's detail field", async () => {
    installDom();
    __startEngineForTests();

    const record = makeIntake({ id: "5xx-1" });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "5xx-1", "upsert");

    useSyncStatusStore.setState({ lastError: null });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "db connection lost" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
      ) as unknown as Mock,
    );

    await runPushCycle();

    const rows = await db._syncQueue.toArray();
    expect(rows[0]!.attempts).toBe(1);

    // The error parser walks body.detail first, then body.error. This
    // pins the precedence — a mutant that swaps the order would fail.
    expect(useSyncStatusStore.getState().lastError).toBe("db connection lost");
  });

  it("push: non-OK status falls back to body.error when body.detail is absent", async () => {
    installDom();
    __startEngineForTests();

    const record = makeIntake({ id: "5xx-2" });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "5xx-2", "upsert");

    useSyncStatusStore.setState({ lastError: null });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "validation failed" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
      ) as unknown as Mock,
    );

    await runPushCycle();

    expect(useSyncStatusStore.getState().lastError).toBe("validation failed");
  });

  it("push: non-OK status with non-JSON body falls back to HTTP <status>", async () => {
    installDom();
    __startEngineForTests();

    const record = makeIntake({ id: "5xx-3" });
    await db.intakeRecords.add(record);
    await enqueue("intakeRecords", "5xx-3", "upsert");

    useSyncStatusStore.setState({ lastError: null });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<!doctype html><html>...</html>", { status: 502 }),
      ) as unknown as Mock,
    );

    await runPushCycle();

    expect(useSyncStatusStore.getState().lastError).toBe("HTTP 502");
  });

  it("push: server-rejected ops bump attempts only on the rejected ids", async () => {
    installDom();
    __startEngineForTests();

    // Two queued ops; the server accepts one and rejects the other.
    const a = makeIntake({ id: "rej-a" });
    const b = makeIntake({ id: "rej-b" });
    await db.intakeRecords.bulkAdd([a, b]);
    await enqueue("intakeRecords", "rej-a", "upsert");
    await enqueue("intakeRecords", "rej-b", "upsert");

    const queueBefore = await db._syncQueue.toArray();
    expect(queueBefore).toHaveLength(2);
    const acceptedQueueId = queueBefore.find((q) => q.recordId === "rej-a")!.id!;
    const rejectedQueueId = queueBefore.find((q) => q.recordId === "rej-b")!.id!;

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          jsonResponse({
            accepted: [{ queueId: acceptedQueueId, serverUpdatedAt: 10_000 }],
            rejected: [
              {
                queueId: rejectedQueueId,
                tableName: "intakeRecords",
                error: "schema mismatch",
              },
            ],
          }),
      ) as unknown as Mock,
    );

    await runPushCycle();

    // Accepted op: ack removed it.
    // Rejected op: still queued, attempts bumped to 1.
    const after = await db._syncQueue.toArray();
    expect(after).toHaveLength(1);
    expect(after[0]!.recordId).toBe("rej-b");
    expect(after[0]!.attempts).toBe(1);

    // lastError surfaces the table + reason from the first rejected entry.
    const err = useSyncStatusStore.getState().lastError ?? "";
    expect(err).toContain("intakeRecords");
    expect(err).toContain("schema mismatch");
  });

  it("push: validation-rejected ops (code 'invalid') are dropped from the queue, not retried", async () => {
    installDom();
    __startEngineForTests();

    // One permanently-invalid op. Before the fix it would 400 the batch and
    // loop forever; now the server returns it in `rejected` with code
    // "invalid" and the client drops it so the queue can drain.
    const bad = makeIntake({ id: "bad-1" });
    await db.intakeRecords.bulkAdd([bad]);
    await enqueue("intakeRecords", "bad-1", "upsert");

    const queueBefore = await db._syncQueue.toArray();
    const badQueueId = queueBefore.find((q) => q.recordId === "bad-1")!.id!;

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          jsonResponse({
            accepted: [],
            rejected: [
              {
                queueId: badQueueId,
                tableName: "intakeRecords",
                error: "Record failed validation and cannot be synced",
                code: "invalid",
              },
            ],
          }),
      ) as unknown as Mock,
    );

    await runPushCycle();

    // The invalid op was removed from the queue (dropped, not retried).
    const after = await db._syncQueue.toArray();
    expect(after).toHaveLength(0);
    // The local Dexie row is untouched — only the sync queue entry is dropped.
    expect(await db.intakeRecords.get("bad-1")).toBeTruthy();
  });

  it("push: a non-'invalid' rejection is dropped once it exhausts MAX_PUSH_ATTEMPTS, so it can't wedge the queue forever", async () => {
    installDom();
    __startEngineForTests();

    // A record the server keeps rejecting with a *real DB write failure* (no
    // `code: "invalid"`) — e.g. a CHECK violation or a column missing from the
    // deployed table. Without a retry cap it would sit in the queue forever,
    // pinning queueDepth > 0 so the engine reports "Syncing…" indefinitely.
    const stuck = makeIntake({ id: "stuck-1" });
    await db.intakeRecords.bulkAdd([stuck]);
    await enqueue("intakeRecords", "stuck-1", "upsert");

    const queueBefore = await db._syncQueue.toArray();
    const stuckQueueId = queueBefore.find((q) => q.recordId === "stuck-1")!.id!;
    // Simulate having already failed up to one attempt below the cap, so this
    // cycle's bump reaches MAX_PUSH_ATTEMPTS and trips the drop.
    await db._syncQueue.update(stuckQueueId, {
      attempts: MAX_PUSH_ATTEMPTS - 1,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          jsonResponse({
            accepted: [],
            rejected: [
              {
                queueId: stuckQueueId,
                tableName: "intakeRecords",
                error: "Server rejected the write",
              },
            ],
          }),
      ) as unknown as Mock,
    );

    await runPushCycle();

    // The op exhausted its retry budget → dropped so the queue can reach empty.
    const after = await db._syncQueue.toArray();
    expect(after).toHaveLength(0);
    // The local Dexie row is preserved — only the queue entry is dropped.
    expect(await db.intakeRecords.get("stuck-1")).toBeTruthy();
    // queueDepth reflects the now-empty queue so the indicator can settle.
    expect(useSyncStatusStore.getState().queueDepth).toBe(0);
  });

  it("push: a non-'invalid' rejection below the retry cap is kept and bumped (not dropped)", async () => {
    installDom();
    __startEngineForTests();

    const pending = makeIntake({ id: "pending-1" });
    await db.intakeRecords.bulkAdd([pending]);
    await enqueue("intakeRecords", "pending-1", "upsert");

    const queueBefore = await db._syncQueue.toArray();
    const pendingQueueId = queueBefore.find(
      (q) => q.recordId === "pending-1",
    )!.id!;

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          jsonResponse({
            accepted: [],
            rejected: [
              {
                queueId: pendingQueueId,
                tableName: "intakeRecords",
                error: "Server rejected the write",
              },
            ],
          }),
      ) as unknown as Mock,
    );

    await runPushCycle();

    // Still queued (transient failures keep retrying), attempts bumped to 1.
    const after = await db._syncQueue.toArray();
    expect(after).toHaveLength(1);
    expect(after[0]!.attempts).toBe(1);
  });

  it("pull: network error sets lastError without throwing or stalling", async () => {
    installDom();
    __startEngineForTests();

    useSyncStatusStore.setState({ lastError: null });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("dns failure");
      }) as unknown as Mock,
    );

    // Must NOT throw — failure is observable via the store, not the call.
    await expect(runPullCycle()).resolves.toBeUndefined();

    expect(useSyncStatusStore.getState().lastError).toBe("dns failure");
  });

  it("pull: 401 clears lastError and exits cleanly (auth handled elsewhere)", async () => {
    installDom();
    __startEngineForTests();

    useSyncStatusStore.setState({ lastError: "stale" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })) as unknown as Mock,
    );

    await runPullCycle();

    expect(useSyncStatusStore.getState().lastError).toBeNull();
  });

  it("pull: non-OK status surfaces error from response body", async () => {
    installDom();
    __startEngineForTests();

    useSyncStatusStore.setState({ lastError: null });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "rate limited" }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          }),
      ) as unknown as Mock,
    );

    await runPullCycle();

    expect(useSyncStatusStore.getState().lastError).toBe("rate limited");
  });

  // ─── Targeted mutant-killing tests (round 2) ──────────────────────────
  // After the failure-path round in this file, ~127 mutants survived on
  // sync-engine.ts. The block below targets the seven concrete branches
  // Stryker flagged at lines 105, 126, 135, 152, 159, 176, and 202 —
  // each one represents a specific edge case the happy-path tests
  // never exercise.

  it("push: empty queue → fetch is never called (early-return on no pending ops)", async () => {
    // Mutant: `if (pending.length === 0) return;` → `if (false) return;`
    // — would proceed to fetch with an empty body. Asserting the fetch
    // mock was NEVER called distinguishes the two paths.
    installDom();
    __startEngineForTests();

    const fetchMock = vi.fn() as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("push: queue rows with an unknown tableName are silently skipped", async () => {
    // Mutant: `if (!TABLE_PUSH_ORDER.includes(tn)) continue;` →
    // `if (false) continue;` — would attempt to push rows for unknown
    // tables. We sneak a row into the queue with a tableName that's
    // not in TABLE_PUSH_ORDER and assert the resulting push body has
    // empty ops (i.e. fetch is never called because the FILTERED list
    // is empty).
    installDom();
    __startEngineForTests();

    // Bypass enqueue() (which would route through enqueueInsideTx and
    // succeed regardless of table validity) by writing the queue row
    // directly. tableName "unknown-table" isn't in TABLE_PUSH_ORDER.
    await db._syncQueue.add({
      tableName: "unknown-table",
      recordId: "x",
      op: "upsert",
      enqueuedAt: Date.now(),
      attempts: 0,
    });

    const fetchMock = vi.fn() as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();

    // The unknown-table row was filtered out, so ops was empty, so
    // the early-return on line 126 fired. Fetch never called.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("push: an upsert op whose live row disappeared is silently skipped", async () => {
    // Mutant: `if (!liveRow) continue;` → `if (false) continue;` —
    // would push a synthesised undefined row to the server. We enqueue
    // an upsert, delete the underlying record, then push — the op
    // must be dropped, not sent.
    installDom();
    __startEngineForTests();

    await db.intakeRecords.add(makeIntake({ id: "vanished-1" }));
    await enqueue("intakeRecords", "vanished-1", "upsert");

    // Now delete the underlying row — the queue still has the upsert
    // pointer but liveRow lookup will return undefined.
    await db.intakeRecords.delete("vanished-1");

    const fetchMock = vi.fn(async () =>
      jsonResponse({ accepted: [] }),
    ) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();

    // The vanished upsert was filtered out, so ops was empty, so we
    // never hit the network at all.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("push: delete op carries through even without a live row (synthesised stub)", async () => {
    // Mutant: `if (qRow.op === "delete")` → `if (true)` or `if (false)`.
    // Either mutant would mishandle the upsert/delete split. The
    // delete-without-live-row path synthesises a {id, deletedAt,
    // updatedAt} stub — this test verifies the path actually fires.
    installDom();
    __startEngineForTests();

    // Enqueue a delete for a record that no longer exists locally.
    // (The legitimate path: user delete commits row+enqueue tx, then
    // the Dexie delete strips the live row.)
    await enqueue("intakeRecords", "ghost-1", "delete");

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        accepted: [],
      }),
    ) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();

    // Unlike the vanished-upsert case above, this one DOES hit the
    // network — the delete op carries a synthesised stub row even
    // when nothing exists locally.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as {
      ops: { op: string; row: { id: string; deletedAt: number | null } }[];
    };
    expect(body.ops).toHaveLength(1);
    expect(body.ops[0]!.op).toBe("delete");
    expect(body.ops[0]!.row.id).toBe("ghost-1");
    expect(body.ops[0]!.row.deletedAt).not.toBeNull();
  });

  it("push: body.ops length matches queue length exactly (no junk array element)", async () => {
    // Mutant: `}> = [];` → `}> = ["Stryker was here"];` — would prepend
    // a junk string to the ops array. Tests that only check the
    // accepted set wouldn't notice, but a strict length check does.
    installDom();
    __startEngineForTests();

    await db.intakeRecords.add(makeIntake({ id: "exact-1" }));
    await db.intakeRecords.add(makeIntake({ id: "exact-2" }));
    await enqueue("intakeRecords", "exact-1", "upsert");
    await enqueue("intakeRecords", "exact-2", "upsert");

    const fetchMock = vi.fn(async () =>
      jsonResponse({ accepted: [] }),
    ) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    ) as { ops: { tableName: string; row: { id: string } }[] };
    // Exactly 2 ops, both intakeRecords. No junk strings.
    expect(body.ops).toHaveLength(2);
    for (const op of body.ops) {
      expect(typeof op).toBe("object");
      expect(op.tableName).toBe("intakeRecords");
      expect(typeof op.row).toBe("object");
    }
  });

  it("applyServerAck: ack for an unknown queueId is silently skipped (no crash)", async () => {
    // Mutant: `if (!origin) continue;` → `if (false) continue;` —
    // would crash dereferencing `origin.tableName`. The server can
    // legitimately return ack ids the client never sent (in a stale
    // retry scenario), so the client must tolerate this.
    installDom();
    __startEngineForTests();

    await db.intakeRecords.add(makeIntake({ id: "ack-unknown-1" }));
    await enqueue("intakeRecords", "ack-unknown-1", "upsert");

    const queueRows = await db._syncQueue.toArray();
    const realQueueId = queueRows[0]!.id!;

    // Server response includes a bogus queueId we never sent (99999)
    // alongside the real one. The bogus one must be silently dropped
    // without throwing.
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        accepted: [
          { queueId: realQueueId, serverUpdatedAt: 10_000 },
          { queueId: 99_999, serverUpdatedAt: 20_000 },
        ],
      }),
    ) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    // No throw — the bogus ack is just dropped.
    await expect(runPushCycle()).resolves.toBeUndefined();

    // The legitimate ack was applied (queue is now empty).
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("schedulePush: calling before any timer exists doesn't throw (null-check on clearTimeout)", async () => {
    // Mutant: `if (pushTimer) clearTimeout(pushTimer);` → `if (true)
    // clearTimeout(pushTimer);` — would call clearTimeout(null) on the
    // first call. clearTimeout(null) is technically a no-op in modern
    // runtimes, but a regression that swapped the guard for a real
    // .clear() on a wrapped object would crash. Pin the behaviour.
    installDom();
    __startEngineForTests();
    vi.useFakeTimers();

    // Right after __startEngineForTests pushTimer is null. The first
    // schedulePush() must not throw.
    expect(() => schedulePush()).not.toThrow();

    // A second call (now with a timer) must also not throw and must
    // collapse onto the same flush.
    expect(() => schedulePush()).not.toThrow();

    vi.useRealTimers();
  });
});
