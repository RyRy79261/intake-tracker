/**
 * Sync engine — client correctness fixes from the 2026-09 audit.
 *
 * Covers: in-flight edits surviving the ack (sync-engine#0), LWW when applying
 * pulled rows (sync-engine#1), orphaned queue rows (sync-engine#4), pull
 * success reporting (sync-engine#9), rejection vs network retry budgets and
 * dropped-op visibility (sync-engine#13), startup flush (sync-engine#14),
 * pulled-null normalisation (core-duplication#3) and cleared-field push
 * (health-records-inputs#4).
 *
 * Same harness as `sync-engine.test.ts`: vitest `node` environment with a
 * minimal EventTarget DOM, `fetch` stubbed per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { db, type IntakeRecord, type SubstanceRecord, type UserSettings } from "@/lib/db";
import { makeUserSettings } from "@/__tests__/fixtures/db-fixtures";
import { enqueue, writeWithSync } from "@/lib/sync-queue";
import {
  __resetEngineForTests,
  __startEngineForTests,
  MAX_PUSH_ATTEMPTS,
  runPullCycle,
  runPushCycle,
  startEngine,
  waitForSyncIdle,
} from "@/lib/sync-engine";
import { useSyncStatusStore } from "@/stores/sync-status-store";

class FakeWindow extends EventTarget {}
class FakeDocument extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
}

function installDom(opts?: { onLine?: boolean }) {
  const win = new FakeWindow();
  const doc = new FakeDocument();
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", { onLine: opts?.onLine ?? true });
  return { win, doc };
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

function emptyPull(): Response {
  return jsonResponse({ result: {}, serverTime: Date.now() });
}

async function flushRealAsync(turns = 30): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function pushBodies(fetchMock: Mock): Array<{
  ops: Array<{ queueId: number; tableName: string; row: Record<string, unknown> }>;
}> {
  return fetchMock.mock.calls
    .filter((c) => String(c[0]).includes("/api/sync/push"))
    .map((c) => JSON.parse(String((c[1] as RequestInit).body)));
}

describe("sync-engine correctness (audit 2026-09)", () => {
  beforeEach(async () => {
    __resetEngineForTests();
    await db._syncQueue.clear();
    await db._syncMeta.clear();
    await db.intakeRecords.clear();
    await db.substanceRecords.clear();
    await db.weightRecords.clear();
    useSyncStatusStore.setState({
      lastError: null,
      lastErrorSource: null,
      queueDepth: 0,
      droppedOps: [],
    });
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    __resetEngineForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // ─── sync-engine#0 ────────────────────────────────────────────────────

  it("an edit made while the push is in flight stays queued and survives the chained pull", async () => {
    installDom();
    __startEngineForTests();

    await db.intakeRecords.add(makeIntake({ id: "r1", amount: 100, updatedAt: 1000 }));
    await enqueue("intakeRecords", "r1", "upsert");
    const [queued] = await db._syncQueue.toArray();

    let pushCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/sync/push")) {
        pushCalls++;
        if (pushCalls === 1) {
          // The user corrects the record while this request is on the wire.
          await writeWithSync("intakeRecords", "upsert", async () => {
            await db.intakeRecords.update("r1", { amount: 500, updatedAt: 2000 });
            return { id: "r1" };
          });
          return jsonResponse({
            accepted: [{ queueId: queued!.id!, serverUpdatedAt: 1000 }],
          });
        }
        const body = JSON.parse(String(init!.body)) as {
          ops: Array<{ queueId: number; row: { updatedAt: number } }>;
        };
        return jsonResponse({
          accepted: body.ops.map((o) => ({
            queueId: o.queueId,
            serverUpdatedAt: o.row.updatedAt,
          })),
        });
      }
      // The chained pull re-fetches v1, which the first push wrote.
      return jsonResponse({
        result: {
          intakeRecords: {
            rows: [makeIntake({ id: "r1", amount: 100, updatedAt: 1000 })],
            hasMore: false,
          },
        },
        serverTime: Date.now(),
      });
    }) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();

    // The newer edit is still queued for the next cycle...
    const remaining = await db._syncQueue.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.recordId).toBe("r1");

    // ...the chained pull does not write v1 back over it...
    await waitForSyncIdle();
    const local = await db.intakeRecords.get("r1");
    expect(local?.amount).toBe(500);
    expect(local?.updatedAt).toBe(2000);

    // ...and the re-drain pushes it.
    await runPushCycle();
    const pushedRows = pushBodies(fetchMock).flatMap((b) => b.ops.map((o) => o.row));
    expect(pushedRows.at(-1)).toMatchObject({ id: "r1", amount: 500 });
    expect(await db._syncQueue.count()).toBe(0);
  });

  // ─── sync-engine#1 ────────────────────────────────────────────────────

  it("pull does not overwrite a newer pending local edit", async () => {
    installDom();
    await db.intakeRecords.add(makeIntake({ id: "r1", amount: 999, updatedAt: 5000 }));
    await enqueue("intakeRecords", "r1", "upsert");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          result: {
            intakeRecords: {
              rows: [makeIntake({ id: "r1", amount: 250, updatedAt: 3000 })],
              hasMore: false,
            },
          },
          serverTime: 10_000_000,
        }),
      ) as unknown as Mock,
    );

    expect(await runPullCycle()).toBe(true);

    const local = await db.intakeRecords.get("r1");
    expect(local?.amount).toBe(999);
    expect(local?.updatedAt).toBe(5000);
    // The cursor still advances past the skipped row.
    const meta = await db._syncMeta.get("intakeRecords");
    expect(meta?.lastPulledUpdatedAt).toBe(3000);
  });

  it("pull applies a strictly newer server row, and new rows", async () => {
    installDom();
    await db.intakeRecords.add(makeIntake({ id: "r1", amount: 100, updatedAt: 1000 }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          result: {
            intakeRecords: {
              rows: [
                makeIntake({ id: "r1", amount: 300, updatedAt: 2000 }),
                makeIntake({ id: "r2", amount: 50, updatedAt: 2000 }),
              ],
              hasMore: false,
            },
          },
          serverTime: 10_000_000,
        }),
      ) as unknown as Mock,
    );

    await runPullCycle();

    expect((await db.intakeRecords.get("r1"))?.amount).toBe(300);
    expect((await db.intakeRecords.get("r2"))?.amount).toBe(50);
  });

  it("pull applies a server tombstone over a live local row even when older (server rule 1)", async () => {
    installDom();
    await db.intakeRecords.add(makeIntake({ id: "r1", updatedAt: 5000 }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          result: {
            intakeRecords: {
              rows: [makeIntake({ id: "r1", updatedAt: 3000, deletedAt: 3000 })],
              hasMore: false,
            },
          },
          serverTime: 10_000_000,
        }),
      ) as unknown as Mock,
    );

    await runPullCycle();

    expect((await db.intakeRecords.get("r1"))?.deletedAt).toBe(3000);
  });

  it("pull keeps a local tombstone over an older or equal live server row (server rule 2b)", async () => {
    installDom();
    await db.intakeRecords.add(makeIntake({ id: "r1", updatedAt: 3000, deletedAt: 3000 }));
    await db.intakeRecords.add(makeIntake({ id: "r2", updatedAt: 3000, deletedAt: 3000 }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          result: {
            intakeRecords: {
              rows: [
                makeIntake({ id: "r1", updatedAt: 3000 }),
                makeIntake({ id: "r2", updatedAt: 4000 }),
              ],
              hasMore: false,
            },
          },
          serverTime: 10_000_000,
        }),
      ) as unknown as Mock,
    );

    await runPullCycle();

    expect((await db.intakeRecords.get("r1"))?.deletedAt).toBe(3000);
    // A strictly newer live server row wins, as it does on the server.
    expect((await db.intakeRecords.get("r2"))?.deletedAt).toBeNull();
  });

  it("an updatedAt tie goes to the server unless a local edit is queued", async () => {
    installDom();
    await db.intakeRecords.add(makeIntake({ id: "r1", amount: 100, updatedAt: 3000 }));
    await db.intakeRecords.add(makeIntake({ id: "r2", amount: 100, updatedAt: 3000 }));
    await enqueue("intakeRecords", "r2", "upsert");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          result: {
            intakeRecords: {
              rows: [
                makeIntake({ id: "r1", amount: 200, updatedAt: 3000 }),
                makeIntake({ id: "r2", amount: 200, updatedAt: 3000 }),
              ],
              hasMore: false,
            },
          },
          serverTime: 10_000_000,
        }),
      ) as unknown as Mock,
    );

    await runPullCycle();

    expect((await db.intakeRecords.get("r1"))?.amount).toBe(200);
    expect((await db.intakeRecords.get("r2"))?.amount).toBe(100);
  });

  it("ack does not stamp the server's newer updatedAt onto stale local content", async () => {
    // The server kept a newer version (LWW rule 3) and acked with its own
    // updatedAt. Copying that onto the local row would make the stale local
    // content look current, and the pull would then skip the real update.
    installDom();
    await db.intakeRecords.add(makeIntake({ id: "r1", amount: 100, updatedAt: 1000 }));
    await enqueue("intakeRecords", "r1", "upsert");
    const [queued] = await db._syncQueue.toArray();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/sync/push")) {
          return jsonResponse({
            accepted: [{ queueId: queued!.id!, serverUpdatedAt: 2000 }],
          });
        }
        return jsonResponse({
          result: {
            intakeRecords: {
              rows: [makeIntake({ id: "r1", amount: 700, updatedAt: 2000 })],
              hasMore: false,
            },
          },
          serverTime: 10_000_000,
        });
      }) as unknown as Mock,
    );

    await runPushCycle();
    await waitForSyncIdle();

    const local = await db.intakeRecords.get("r1");
    expect(local?.amount).toBe(700);
    expect(local?.updatedAt).toBe(2000);
  });

  it("ack lowers local updatedAt to the server's clamped value when the pushed row is unchanged", async () => {
    installDom();
    const future = Date.now() + 3_600_000;
    await db.intakeRecords.add(makeIntake({ id: "r1", updatedAt: future }));
    await enqueue("intakeRecords", "r1", "upsert");
    const [queued] = await db._syncQueue.toArray();
    const clamped = Date.now() + 60_000;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/sync/push")
          ? jsonResponse({
              accepted: [{ queueId: queued!.id!, serverUpdatedAt: clamped }],
            })
          : emptyPull(),
      ) as unknown as Mock,
    );

    await runPushCycle();

    expect((await db.intakeRecords.get("r1"))?.updatedAt).toBe(clamped);
  });

  // ─── sync-engine#4 ────────────────────────────────────────────────────

  it("upsert rows whose record is gone are dropped, so they cannot wedge the queue", async () => {
    installDom();
    __startEngineForTests();

    // 50 orphans at the head of the queue, then one real record.
    for (let i = 0; i < 50; i++) {
      await enqueue("intakeRecords", `gone-${i}`, "upsert");
    }
    await db.intakeRecords.add(makeIntake({ id: "real" }));
    await enqueue("intakeRecords", "real", "upsert");

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/sync/push")) {
        const body = JSON.parse(String(init!.body)) as {
          ops: Array<{ queueId: number }>;
        };
        return jsonResponse({
          accepted: body.ops.map((o) => ({
            queueId: o.queueId,
            serverUpdatedAt: 1,
          })),
        });
      }
      return emptyPull();
    }) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();

    const pushed = pushBodies(fetchMock).flatMap((b) => b.ops);
    expect(pushed.map((o) => o.row.id)).toEqual(["real"]);
    expect(await db._syncQueue.count()).toBe(0);
    expect(useSyncStatusStore.getState().queueDepth).toBe(0);
  });

  // ─── sync-engine#13 (FK ordering) ─────────────────────────────────────

  it("a queued FK parent outside the oldest batch is pushed with its children", async () => {
    installDom();
    __startEngineForTests();

    // 50 children queued first, their parent re-enqueued last (coalescing
    // moved its enqueuedAt behind them), so the oldest-50 window alone
    // would never carry it and every child would fail its FK check.
    const now = Date.now();
    await db.intakeRecords.add(makeIntake({ id: "parent" }));
    for (let i = 0; i < 50; i++) {
      await db.substanceRecords.add({
        id: `child-${i}`,
        type: "caffeine",
        amountMg: 95,
        description: "Coffee",
        source: "water_intake",
        sourceRecordId: "parent",
        timestamp: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: "d",
        timezone: "UTC",
      } as SubstanceRecord);
      await db._syncQueue.add({
        tableName: "substanceRecords",
        recordId: `child-${i}`,
        op: "upsert",
        enqueuedAt: 1000 + i,
        attempts: 0,
      });
    }
    await db._syncQueue.add({
      tableName: "intakeRecords",
      recordId: "parent",
      op: "upsert",
      enqueuedAt: 5000,
      attempts: 0,
    });

    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("/api/sync/push")
        ? jsonResponse({ accepted: [] })
        : emptyPull(),
    ) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();

    const [body] = pushBodies(fetchMock);
    const ids = body!.ops.map((o) => o.row.id);
    expect(ids[0]).toBe("parent");
    expect(ids).toHaveLength(51);
  });

  // ─── sync-engine#9 ────────────────────────────────────────────────────

  it("runPullCycle reports success only for a complete pull", async () => {
    installDom();
    vi.stubGlobal("fetch", vi.fn(async () => emptyPull()) as unknown as Mock);
    expect(await runPullCycle()).toBe(true);

    __resetEngineForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      }) as unknown as Mock,
    );
    expect(await runPullCycle()).toBe(false);

    __resetEngineForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })) as unknown as Mock,
    );
    expect(await runPullCycle()).toBe(false);
  });

  it("a second runPullCycle joins the in-flight pull and reports its result", async () => {
    installDom();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = vi.fn(async () => {
      await gate;
      return emptyPull();
    }) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    const first = runPullCycle();
    const second = runPullCycle();
    release();

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ─── sync-engine#13 ───────────────────────────────────────────────────

  it("network failures do not spend an op's rejection budget", async () => {
    installDom();
    __startEngineForTests();
    await db.intakeRecords.add(makeIntake({ id: "r1" }));
    await enqueue("intakeRecords", "r1", "upsert");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as Mock,
    );
    for (let i = 0; i < MAX_PUSH_ATTEMPTS + 2; i++) await runPushCycle();

    const [row] = await db._syncQueue.toArray();
    expect(row!.attempts).toBe(0);
    expect(useSyncStatusStore.getState().lastError).toBe("network down");

    // One transient rejection now only bumps it; it is not dropped.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/sync/push")
          ? jsonResponse({
              rejected: [
                { queueId: row!.id!, tableName: "intakeRecords", error: "fk" },
              ],
            })
          : emptyPull(),
      ) as unknown as Mock,
    );
    await runPushCycle();

    const after = await db._syncQueue.toArray();
    expect(after).toHaveLength(1);
    expect(after[0]!.attempts).toBe(1);
  });

  it("a dropped op is recorded in the persisted dropped-ops list", async () => {
    installDom();
    __startEngineForTests();
    await db.intakeRecords.add(makeIntake({ id: "bad" }));
    await enqueue("intakeRecords", "bad", "upsert");
    const [row] = await db._syncQueue.toArray();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/sync/push")
          ? jsonResponse({
              rejected: [
                {
                  queueId: row!.id!,
                  tableName: "intakeRecords",
                  error: "Record failed validation and cannot be synced",
                  code: "invalid",
                },
              ],
            })
          : emptyPull(),
      ) as unknown as Mock,
    );
    await runPushCycle();

    expect(await db._syncQueue.count()).toBe(0);
    const dropped = useSyncStatusStore.getState().droppedOps;
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({
      tableName: "intakeRecords",
      recordId: "bad",
      error: "Record failed validation and cannot be synced",
    });
  });

  it("the chained pull does not clear a push error", async () => {
    installDom();
    __startEngineForTests();
    await db.intakeRecords.add(makeIntake({ id: "bad" }));
    await enqueue("intakeRecords", "bad", "upsert");
    const [row] = await db._syncQueue.toArray();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/sync/push")
          ? jsonResponse({
              rejected: [
                {
                  queueId: row!.id!,
                  tableName: "intakeRecords",
                  error: "invalid",
                  code: "invalid",
                },
              ],
            })
          : emptyPull(),
      ) as unknown as Mock,
    );
    await runPushCycle();
    await waitForSyncIdle();

    expect(useSyncStatusStore.getState().lastError).toContain("intakeRecords");
  });

  // ─── sync-engine#14 ───────────────────────────────────────────────────

  it("startEngine reports the persisted queue depth and pushes before the startup pull", async () => {
    installDom();
    await db.intakeRecords.add(makeIntake({ id: "left-over" }));
    await enqueue("intakeRecords", "left-over", "upsert");

    const order: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/sync/push")) {
        order.push("push");
        const body = JSON.parse(String(init!.body)) as {
          ops: Array<{ queueId: number }>;
        };
        return jsonResponse({
          accepted: body.ops.map((o) => ({ queueId: o.queueId, serverUpdatedAt: 1 })),
        });
      }
      order.push("pull");
      return emptyPull();
    }) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    startEngine();
    await flushRealAsync();
    await waitForSyncIdle();

    expect(order[0]).toBe("push");
    expect(order).toContain("pull");
    expect(await db._syncQueue.count()).toBe(0);
  });

  // ─── core-duplication#3 ───────────────────────────────────────────────

  it("pulled rows lose null optional fields and userId", async () => {
    installDom();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          result: {
            substanceRecords: {
              rows: [
                {
                  id: "s1",
                  userId: "user-1",
                  type: "alcohol",
                  amountStandardDrinks: 1,
                  abvPercent: null,
                  amountMg: null,
                  description: "Beer",
                  source: "standalone",
                  timestamp: 1000,
                  createdAt: 1000,
                  updatedAt: 1000,
                  deletedAt: null,
                  deviceId: "d",
                  timezone: "UTC",
                },
              ],
              hasMore: false,
            },
          },
          serverTime: 10_000_000,
        }),
      ) as unknown as Mock,
    );

    await runPullCycle();

    const stored = (await db.substanceRecords.get("s1")) as SubstanceRecord &
      Record<string, unknown>;
    expect(stored).toBeDefined();
    expect("abvPercent" in stored).toBe(false);
    expect("amountMg" in stored).toBe(false);
    expect("userId" in stored).toBe(false);
    expect(stored.deletedAt).toBeNull();
  });

  // ─── health-records-inputs#4 ──────────────────────────────────────────

  it("push sends an explicit null for a field cleared locally", async () => {
    installDom();
    __startEngineForTests();
    const now = Date.now();
    await db.weightRecords.add({
      id: "w1",
      weight: 72,
      timestamp: now,
      note: "voice",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: "d",
      timezone: "UTC",
    });
    await writeWithSync("weightRecords", "upsert", async () => {
      // What the card's `update(id, { note: undefined })` does: drop the key.
      await db.weightRecords.update("w1", (r) => {
        delete r.note;
        r.updatedAt = now + 1;
      });
      return { id: "w1" };
    });

    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("/api/sync/push")
        ? jsonResponse({ accepted: [] })
        : emptyPull(),
    ) as unknown as Mock;
    vi.stubGlobal("fetch", fetchMock);

    await runPushCycle();

    const [body] = pushBodies(fetchMock);
    expect(body!.ops[0]!.row).toHaveProperty("note", null);
  });
});

// ─── Synced settings: per-setting merge on pull ──────────────────────────

describe("sync-engine pull merges the settings row per setting", () => {
  const STAMPS = { waterLimit: 1_000, saltLimit: 1_000, dayStartHour: 1_000 };

  function settings(overrides: Partial<UserSettings> = {}): UserSettings {
    return makeUserSettings({
      id: "settings-1",
      createdAt: 1_000,
      updatedAt: 1_000,
      fieldUpdatedAt: STAMPS,
      ...overrides,
    });
  }

  function pullReturning(row: UserSettings): Mock {
    return vi.fn(async () =>
      jsonResponse({
        result: { userSettings: { rows: [row], hasMore: false } },
        serverTime: 10_000_000,
      }),
    ) as unknown as Mock;
  }

  beforeEach(async () => {
    __resetEngineForTests();
    await db._syncQueue.clear();
    await db._syncMeta.clear();
    await db.userSettings.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    __resetEngineForTests();
    vi.unstubAllGlobals();
  });

  it("keeps a pending local edit to one setting and takes the server's edit to another", async () => {
    installDom();
    // This device changed the sodium limit offline at 2000 (queued).
    await db.userSettings.add(
      settings({ saltLimit: 1200, updatedAt: 2_000, fieldUpdatedAt: { ...STAMPS, saltLimit: 2_000 } }),
    );
    await enqueue("userSettings", "settings-1", "upsert");
    // Another device changed the water limit at 3000.
    vi.stubGlobal(
      "fetch",
      pullReturning(
        settings({
          waterLimit: 2500,
          updatedAt: 3_000,
          deviceId: "other",
          fieldUpdatedAt: { ...STAMPS, waterLimit: 3_000 },
        }),
      ),
    );

    expect(await runPullCycle()).toBe(true);

    const local = await db.userSettings.get("settings-1");
    expect(local?.waterLimit).toBe(2500);
    expect(local?.saltLimit).toBe(1200);
    expect(local?.fieldUpdatedAt).toMatchObject({ waterLimit: 3_000, saltLimit: 2_000 });
    // Still queued, so the merged row (with this device's edit) is pushed.
    expect(await db._syncQueue.where("tableName").equals("userSettings").count()).toBe(1);
  });

  it("takes a server edit carried by an older row", async () => {
    installDom();
    await db.userSettings.add(
      settings({ saltLimit: 1200, updatedAt: 5_000, fieldUpdatedAt: { ...STAMPS, saltLimit: 5_000 } }),
    );
    vi.stubGlobal(
      "fetch",
      pullReturning(
        settings({ dayStartHour: 4, updatedAt: 4_000, fieldUpdatedAt: { ...STAMPS, dayStartHour: 4_000 } }),
      ),
    );

    await runPullCycle();

    const local = await db.userSettings.get("settings-1");
    expect(local?.dayStartHour).toBe(4);
    expect(local?.saltLimit).toBe(1200);
    // A new version, so the settings mirror applies it.
    expect(local?.updatedAt).toBeGreaterThan(5_000);
    // The local edit the server lacks is queued for push.
    expect(await db._syncQueue.where("tableName").equals("userSettings").count()).toBe(1);
  });

  it("leaves the local row alone when the server has nothing newer", async () => {
    installDom();
    const localRow = settings({
      saltLimit: 1200,
      updatedAt: 2_000,
      fieldUpdatedAt: { ...STAMPS, saltLimit: 2_000 },
    });
    await db.userSettings.add(localRow);
    await enqueue("userSettings", "settings-1", "upsert");
    vi.stubGlobal("fetch", pullReturning(settings({ updatedAt: 1_500 })));

    await runPullCycle();

    expect(await db.userSettings.get("settings-1")).toEqual(localRow);
  });
});
