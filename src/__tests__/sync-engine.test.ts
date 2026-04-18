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
  attachLifecycleListeners,
  runPullCycle,
  runPushCycle,
  schedulePush,
  SKEW_MARGIN_MS,
} from "@/lib/sync-engine";

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

    // min(maxRowUpdatedAt=1000, serverTime - 30s = 4_970_000) = 1000
    const meta = await db._syncMeta.get("intakeRecords");
    expect(meta?.lastPulledUpdatedAt).toBe(1000);

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
});
