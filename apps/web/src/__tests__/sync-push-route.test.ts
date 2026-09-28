/**
 * Tests for POST /api/sync/push handler — Plan 43-03.
 *
 * Strategy:
 *   - Mock @/lib/auth-middleware so withAuth becomes a pass-through that
 *     injects `auth.userId = "user-test"` into the handler context. This
 *     avoids depending on the real Neon Auth session machinery, which is
 *     already covered by src/__tests__/auth-middleware.test.ts.
 *   - Mock @intake/db/client by intercepting the module and returning a stub
 *     `db` with controllable `select().from().where().limit()` and
 *     `insert().values().onConflictDoUpdate()` behaviour per test.
 *   - Dynamically import the route module AFTER mocks are registered so
 *     module-load side effects pick up the mocks.
 *
 * Reference: 43-03-PLAN.md Task 2, 43-VALIDATION.md rows 8–13.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

// ────────────────────────────────────────────────────────────────────────
// Controllable stubs driving the drizzle mock
// ────────────────────────────────────────────────────────────────────────

let existingRows: Record<string, Record<string, unknown>> = {};
const insertCalls: {
  table: unknown;
  values: Record<string, unknown>;
  set: Record<string, unknown>;
}[] = [];

const updateCalls: { set: Record<string, unknown> }[] = [];
/** Which row the mocked UPDATE's WHERE clause is standing in for. */
let updateTargetId = "";

function resetDbState() {
  existingRows = {};
  insertCalls.length = 0;
  updateCalls.length = 0;
  updateTargetId = "";
}

// Mock the authenticated context — withAuth becomes a pass-through HOF
// that injects a fixed userId. Also export a spy the tests can read to
// inspect calls.
vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (handler: (ctx: {
    request: NextRequest;
    auth: { success: true; userId: string };
  }) => Promise<Response>) => {
    return async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "user-test" },
      });
  },
}));

// Mock the drizzle client. The route issues:
//   drizzleDb.select().from(table).where(...).limit(1)   -> existingRows[op.row.id]
//   drizzleDb.insert(table).values(v).onConflictDoUpdate({ set }) -> captured
vi.mock("@intake/db/client", () => {
  const db = {
    select: () => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => {
          const rows = Object.values(existingRows);
          return Promise.resolve(rows);
        },
      }),
    }),
    update: (_table: unknown) => ({
      set: (v: Record<string, unknown>) => ({
        where: async (_cond: unknown) => {
          // The route scopes every UPDATE by (id, userId); the mock can't read
          // the predicate, so tests drive it via `updateTargetId`.
          updateCalls.push({ set: v });
          const target = existingRows[updateTargetId];
          if (target) Object.assign(target, v);
          return undefined;
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({
          set,
        }: {
          target: unknown;
          set: Record<string, unknown>;
        }) => {
          insertCalls.push({ table, values: v, set });
          existingRows[v.id as string] = { ...v };
          return undefined;
        },
        onConflictDoNothing: async () => undefined,
      }),
    }),
  };
  return { db };
});

// ────────────────────────────────────────────────────────────────────────
// Helpers for building valid ops
// ────────────────────────────────────────────────────────────────────────

function validIntakeRow(overrides: Record<string, unknown> = {}) {
  const now = 1_000_000_000;
  return {
    id: "row-1",
    type: "water",
    amount: 250,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: "dev-A",
    timezone: "UTC",
    ...overrides,
  };
}

function makePushRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/sync/push", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("sync-push-route", () => {
  beforeEach(() => {
    resetDbState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("LWW: newer client updatedAt wins over older server row", async () => {
    existingRows["row-1"] = {
      id: "row-1",
      userId: "user-test",
      updatedAt: 1000,
      deletedAt: null,
    };
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 1,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ updatedAt: 2000 }),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };
    expect(body.accepted).toEqual([{ queueId: 1, serverUpdatedAt: 2000 }]);
    expect(insertCalls).toHaveLength(1);
  });

  it("server wins tie: strict > comparison means equal updatedAt keeps server row", async () => {
    existingRows["row-1"] = {
      id: "row-1",
      userId: "user-test",
      updatedAt: 5000,
      deletedAt: null,
    };
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 2,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ updatedAt: 5000 }),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };
    expect(insertCalls).toHaveLength(0);
    expect(body.accepted).toEqual([{ queueId: 2, serverUpdatedAt: 5000 }]);
  });

  it("deletedAt wins: a stale live edit cannot resurrect a tombstoned row", async () => {
    existingRows["row-1"] = {
      id: "row-1",
      userId: "user-test",
      updatedAt: 1000,
      deletedAt: 999,
    };
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 3,
          tableName: "intakeRecords",
          op: "upsert",
          // Tie with the tombstone still loses — only a strictly newer
          // live write counts as a restore.
          row: validIntakeRow({ updatedAt: 1000, deletedAt: null }),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };
    expect(insertCalls).toHaveLength(0);
    expect(body.accepted).toEqual([{ queueId: 3, serverUpdatedAt: 1000 }]);
  });

  it("undo-delete: a live write newer than the tombstone restores the row", async () => {
    // audit sync-engine#8 — undo after the delete already synced.
    existingRows["row-1"] = {
      id: "row-1",
      userId: "user-test",
      updatedAt: 1000,
      deletedAt: 1000,
    };
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 4,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ updatedAt: 9999, deletedAt: null }),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.set.deletedAt).toBeNull();
    expect(body.accepted).toEqual([{ queueId: 4, serverUpdatedAt: 9999 }]);
  });

  it("tombstone tie-break: incoming tombstone with same updatedAt as live server row wins", async () => {
    // Rule 2b in route.ts: deletion intent beats a concurrent edit
    // when timestamps tie. Counterpart to "deletedAt wins" above,
    // which covers the inverse direction (server tombstone vs
    // incoming upsert). Without this rule, the route silently drops
    // the delete — see sync-conflict.property.test.ts for the
    // property-test discovery.
    existingRows["row-1"] = {
      id: "row-1",
      userId: "user-test",
      updatedAt: 5000,
      deletedAt: null,
    };
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 99,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ updatedAt: 5000, deletedAt: 5000 }),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    // The acked serverUpdatedAt matches the tied clamped value.
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };
    expect(body.accepted).toEqual([{ queueId: 99, serverUpdatedAt: 5000 }]);
  });

  it("tombstone tie-break does NOT fire for stale tombstones (strictly older)", async () => {
    // Defensive: a stale tombstone (incoming.updatedAt < existing)
    // must still lose. Rule 2b requires equality, not just non-null.
    existingRows["row-1"] = {
      id: "row-1",
      userId: "user-test",
      updatedAt: 5000,
      deletedAt: null,
    };
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 100,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ updatedAt: 4000, deletedAt: 4000 }),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(0);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };
    // Stale tombstone is acked with the EXISTING server updatedAt.
    expect(body.accepted).toEqual([{ queueId: 100, serverUpdatedAt: 5000 }]);
  });

  it("clamp future: client updatedAt > serverNow+60s clamps to serverNow+60s", async () => {
    const FROZEN_NOW = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(FROZEN_NOW);

    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 4,
          tableName: "intakeRecords",
          op: "upsert",
          // 2-minute future client timestamp
          row: validIntakeRow({ updatedAt: FROZEN_NOW + 120_000 }),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };
    const expectedClamped = FROZEN_NOW + 60_000;
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.values.updatedAt).toBe(expectedClamped);
    expect(body.accepted).toEqual([
      { queueId: 4, serverUpdatedAt: expectedClamped },
    ]);
  });

  it("rejects client-forged userId", async () => {
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 5,
          tableName: "intakeRecords",
          op: "upsert",
          row: {
            ...validIntakeRow({ updatedAt: 2000 }),
            // Attacker-injected userId. drizzle-zod .omit({userId:true})
            // should strip it from the parsed op.row, and the route must
            // only use auth.userId = "user-test" on the insert.
            userId: "attacker",
          },
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    // The DB insert must always carry the session-derived userId.
    expect(insertCalls[0]!.values.userId).toBe("user-test");
    expect(insertCalls[0]!.values.userId).not.toBe("attacker");
    expect(insertCalls[0]!.set.userId).toBe("user-test");
    expect(insertCalls[0]!.set.userId).not.toBe("attacker");
  });

  it("isolates a malformed op: rejects it but applies the valid ones (no batch-wide 400)", async () => {
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        // Malformed: `amount` must be a number — a NaN serialises to null and
        // a notNull column would 400 the WHOLE batch under atomic validation.
        {
          queueId: 1,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ id: "bad", amount: null }),
        },
        // Valid op behind the bad one must still apply.
        {
          queueId: 2,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ id: "good", updatedAt: 3000 }),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
      rejected: { queueId: number; tableName: string; error: string; code?: string }[];
    };
    expect(body.accepted).toEqual([{ queueId: 2, serverUpdatedAt: 3000 }]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]).toMatchObject({
      queueId: 1,
      tableName: "intakeRecords",
      code: "invalid",
    });
    // The valid op was written; the bad one was not.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.values.id).toBe("good");
  });

  it("accepts fractional (split-pill) inventoryItems.currentStock and inventoryTransactions.amount", async () => {
    // Issue #327: the app supports quarter/half/three-quarter tablet
    // splitting (medication-ui-utils.ts formatPillCount), so currentStock
    // and amount are real-valued on the Dexie/TS side. A row carrying a
    // split-pill value must sync, not get silently and permanently dropped.
    const { POST } = await import("@/app/api/sync/push/route");
    const now = 1_000_000_000;

    const inventoryItemRow = {
      id: "inv-1",
      prescriptionId: "rx-1",
      brandName: "Furosemide",
      currentStock: 0.5,
      strength: 25,
      unit: "mg",
      pillShape: "round",
      pillColor: "#94a3b8",
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: "dev-A",
      timezone: "UTC",
    };

    const inventoryTransactionRow = {
      id: "tx-1",
      inventoryItemId: "inv-1",
      timestamp: now,
      amount: 0.5,
      type: "consumed",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: "dev-A",
      timezone: "UTC",
    };

    const req = makePushRequest({
      ops: [
        {
          queueId: 1,
          tableName: "inventoryItems",
          op: "upsert",
          row: inventoryItemRow,
        },
        {
          queueId: 2,
          tableName: "inventoryTransactions",
          op: "upsert",
          row: inventoryTransactionRow,
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
      rejected: { queueId: number; tableName: string; error: string; code?: string }[];
    };
    expect(body.rejected ?? []).toHaveLength(0);
    expect(body.accepted).toHaveLength(2);
    expect(insertCalls).toHaveLength(2);
    const invItemWrite = insertCalls.find((c) => c.values.id === "inv-1");
    const invTxWrite = insertCalls.find((c) => c.values.id === "tx-1");
    expect(invItemWrite!.values.currentStock).toBe(0.5);
    expect(invTxWrite!.values.amount).toBe(0.5);
  });

  it("rejects oversized batch", async () => {
    const validOp = {
      queueId: 1,
      tableName: "intakeRecords" as const,
      op: "upsert" as const,
      row: validIntakeRow(),
    };
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: Array(501)
        .fill(0)
        .map((_, i) => ({ ...validOp, queueId: i + 1 })),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
    };
    expect(body.error).toBe("Invalid request");
    expect(insertCalls).toHaveLength(0);
  });

  it("nullifies undefined optional fields before DB write", async () => {
    const { POST } = await import("@/app/api/sync/push/route");
    const row = validIntakeRow({ updatedAt: 2000 });
    // Simulate Dexie records where optional fields are present but undefined
    (row as Record<string, unknown>).source = undefined;
    (row as Record<string, unknown>).note = undefined;
    (row as Record<string, unknown>).groupId = undefined;
    (row as Record<string, unknown>).originalInputText = undefined;
    (row as Record<string, unknown>).groupSource = undefined;

    const req = makePushRequest({
      ops: [{ queueId: 100, tableName: "intakeRecords", op: "upsert", row }],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
      rejected: unknown[];
    };
    expect(body.accepted).toHaveLength(1);
    expect(body.rejected ?? []).toHaveLength(0);

    expect(insertCalls).toHaveLength(1);
    const written = insertCalls[0]!.values;
    // After Zod parse + sanitizeRow, no property on the DB write
    // payload should have value `undefined`. Drizzle converts undefined
    // values to the SQL DEFAULT keyword, which Neon HTTP cannot handle.
    // Properties either: exist with a non-undefined value (null is fine),
    // or are absent entirely (Drizzle skips them, DB uses column default).
    for (const [key, value] of Object.entries(written)) {
      expect(value, `property "${key}" must not be undefined`).not.toBe(undefined);
    }
    // Non-optional fields remain as-is
    expect(written.type).toBe("water");
    expect(written.amount).toBe(250);
    expect(written.deviceId).toBe("dev-A");
  });

  it("handles fully omitted optional fields (not present on row)", async () => {
    const { POST } = await import("@/app/api/sync/push/route");
    // Minimal intake row with only required fields
    const now = 1_000_000_000;
    const minimalRow: Record<string, unknown> = {
      id: "row-minimal",
      type: "water",
      amount: 250,
      timestamp: now,
      createdAt: now,
      updatedAt: now + 1000,
      deletedAt: null,
      deviceId: "dev-A",
      timezone: "UTC",
    };

    const req = makePushRequest({
      ops: [
        { queueId: 101, tableName: "intakeRecords", op: "upsert", row: minimalRow },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
      rejected: unknown[];
    };
    expect(body.accepted).toHaveLength(1);
    expect(body.rejected ?? []).toHaveLength(0);
    expect(insertCalls).toHaveLength(1);
  });

  it("processes multi-table batch with mixed optional fields", async () => {
    const { POST } = await import("@/app/api/sync/push/route");
    const now = 1_000_000_000;

    const intakeRow = validIntakeRow({ id: "intake-1", updatedAt: now + 1000 });
    (intakeRow as Record<string, unknown>).source = undefined;

    const eatingRow: Record<string, unknown> = {
      id: "eating-1",
      timestamp: now,
      createdAt: now,
      updatedAt: now + 1000,
      deletedAt: null,
      deviceId: "dev-A",
      timezone: "UTC",
      // grams, note, groupId, originalInputText, groupSource are all optional
    };

    const req = makePushRequest({
      ops: [
        { queueId: 200, tableName: "intakeRecords", op: "upsert", row: intakeRow },
        { queueId: 201, tableName: "eatingRecords", op: "upsert", row: eatingRow },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
      rejected: unknown[];
    };
    expect(body.accepted).toHaveLength(2);
    expect(body.rejected ?? []).toHaveLength(0);

    // Verify both tables were written
    expect(insertCalls).toHaveLength(2);
    // No property on either write should be undefined
    for (const call of insertCalls) {
      for (const [key, value] of Object.entries(call.values)) {
        expect(value, `property "${key}" must not be undefined`).not.toBe(undefined);
      }
    }
  });

  it("returns accepted array with serverUpdatedAt per queueId", async () => {
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 10,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ id: "row-a", updatedAt: 2000 }),
        },
        {
          queueId: 20,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ id: "row-b", updatedAt: 3000 }),
        },
        {
          queueId: 30,
          tableName: "intakeRecords",
          op: "upsert",
          row: validIntakeRow({ id: "row-c", updatedAt: 4000 }),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };
    expect(body.accepted).toHaveLength(3);
    expect(body.accepted.map((a) => a.queueId)).toEqual([10, 20, 30]);
    for (const entry of body.accepted) {
      expect(typeof entry.serverUpdatedAt).toBe("number");
    }
  });
  // ─── Tombstone-only delete ops (issue #354) ────────────────────────────
  // A delete whose local Dexie row is already gone can only carry
  // {id, updatedAt, deletedAt}. That stub cannot satisfy the full-row schema,
  // so it used to be quarantined as "invalid" and dropped by the client — the
  // deletion never landed and the next pull resurrected the row.

  it("tombstone: a stub delete tombstones the live server row via UPDATE, not insert", async () => {
    existingRows["ghost-1"] = {
      id: "ghost-1",
      userId: "user-test",
      updatedAt: 1000,
      deletedAt: null,
    };
    updateTargetId = "ghost-1";

    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 7,
          tableName: "phaseSchedules",
          op: "delete",
          row: { id: "ghost-1", updatedAt: 2000, deletedAt: 2000 },
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
      rejected: unknown[];
    };

    expect(body.rejected ?? []).toHaveLength(0);
    expect(body.accepted).toEqual([{ queueId: 7, serverUpdatedAt: 2000 }]);
    // An insert would need every NOT NULL column the stub does not have.
    expect(insertCalls.filter((c) => c.values.id === "ghost-1")).toHaveLength(0);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.set).toMatchObject({
      deletedAt: 2000,
      updatedAt: 2000,
    });
  });

  // ── Server-assigned pull cursor (audit sync-engine#3) ──
  // Pull pages by `serverUpdatedAt`, so every write path must stamp it from
  // the server clock — never from the client's `updatedAt`.

  it("pull cursor: an upsert stamps serverUpdatedAt from the server clock, in values and set", async () => {
    const { POST } = await import("@/app/api/sync/push/route");
    const before = Date.now();
    const res = await POST(
      makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            // A client-supplied stamp must be ignored.
            row: { ...validIntakeRow({ updatedAt: 2000 }), serverUpdatedAt: 7 },
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    const { values, set } = insertCalls[0]!;
    expect(values.serverUpdatedAt).toBeGreaterThanOrEqual(before);
    expect(set.serverUpdatedAt).toBe(values.serverUpdatedAt);
    // LWW still runs on the client clock.
    expect(values.updatedAt).toBe(2000);
  });

  it("pull cursor: a tombstone stub restamps serverUpdatedAt", async () => {
    existingRows["ghost-2"] = {
      id: "ghost-2",
      userId: "user-test",
      updatedAt: 1000,
      deletedAt: null,
    };
    updateTargetId = "ghost-2";
    const { POST } = await import("@/app/api/sync/push/route");
    const before = Date.now();
    await POST(
      makePushRequest({
        ops: [
          {
            queueId: 9,
            tableName: "phaseSchedules",
            op: "delete",
            row: { id: "ghost-2", updatedAt: 2000, deletedAt: 2000 },
          },
        ],
      }),
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.set.serverUpdatedAt).toBeGreaterThanOrEqual(before);
  });

  it("tombstone: a row that is not on the server acks as a no-op", async () => {
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 8,
          tableName: "phaseSchedules",
          op: "delete",
          row: { id: "never-synced", updatedAt: 2000, deletedAt: 2000 },
        },
      ],
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      accepted: { queueId: number }[];
      rejected: unknown[];
    };

    // Nothing to delete is a satisfied delete — not an error to retry forever.
    expect(body.rejected ?? []).toHaveLength(0);
    expect(body.accepted.map((a) => a.queueId)).toEqual([8]);
    expect(updateCalls).toHaveLength(0);
  });

  it("tombstone: a stale stub loses to a newer server row (LWW)", async () => {
    existingRows["row-1"] = {
      id: "row-1",
      userId: "user-test",
      updatedAt: 9000,
      deletedAt: null,
    };
    updateTargetId = "row-1";

    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 9,
          tableName: "phaseSchedules",
          op: "delete",
          row: { id: "row-1", updatedAt: 1000, deletedAt: 1000 },
        },
      ],
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };

    expect(updateCalls).toHaveLength(0);
    expect(body.accepted).toEqual([{ queueId: 9, serverUpdatedAt: 9000 }]);
  });

  it("tombstone: a tie with the server row still deletes (deletion wins ties)", async () => {
    existingRows["row-1"] = {
      id: "row-1",
      userId: "user-test",
      updatedAt: 5000,
      deletedAt: null,
    };
    updateTargetId = "row-1";

    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 11,
          tableName: "phaseSchedules",
          op: "delete",
          row: { id: "row-1", updatedAt: 5000, deletedAt: 5000 },
        },
      ],
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };

    expect(updateCalls).toHaveLength(1);
    expect(body.accepted).toEqual([{ queueId: 11, serverUpdatedAt: 5000 }]);
  });

  it("tombstone: an already-deleted server row acks idempotently without a second write", async () => {
    existingRows["row-1"] = {
      id: "row-1",
      userId: "user-test",
      updatedAt: 4000,
      deletedAt: 4000,
    };
    updateTargetId = "row-1";

    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        {
          queueId: 12,
          tableName: "phaseSchedules",
          op: "delete",
          row: { id: "row-1", updatedAt: 6000, deletedAt: 6000 },
        },
      ],
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
    };

    expect(updateCalls).toHaveLength(0);
    expect(body.accepted).toEqual([{ queueId: 12, serverUpdatedAt: 4000 }]);
  });

  it("tombstone: the fallback does not widen what else gets through", async () => {
    const { POST } = await import("@/app/api/sync/push/route");
    const req = makePushRequest({
      ops: [
        // An upsert stub is still invalid — only a delete may be row-less.
        {
          queueId: 13,
          tableName: "phaseSchedules",
          op: "upsert",
          row: { id: "row-x", updatedAt: 2000, deletedAt: 2000 },
        },
        // An unknown table is still rejected, delete or not.
        {
          queueId: 14,
          tableName: "notATable",
          op: "delete",
          row: { id: "row-y", updatedAt: 2000, deletedAt: 2000 },
        },
        // A delete with no deletedAt is not a tombstone.
        {
          queueId: 15,
          tableName: "phaseSchedules",
          op: "delete",
          row: { id: "row-z", updatedAt: 2000 },
        },
      ],
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      accepted: unknown[];
      rejected: { queueId: number; code?: string }[];
    };

    expect(body.accepted ?? []).toHaveLength(0);
    expect(body.rejected.map((r) => r.queueId).sort()).toEqual([13, 14, 15]);
    for (const r of body.rejected) expect(r.code).toBe("invalid");
    expect(updateCalls).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// userSettings: per-setting conflict resolution. Two devices that edit
// different settings while offline both keep their edit.
// ────────────────────────────────────────────────────────────────────────

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "settings-1",
    waterLimit: 2000,
    saltLimit: 1500,
    sugarLimit: 50,
    potassiumLimit: 3500,
    waterExtendedBuffer: 500,
    saltExtendedBuffer: 500,
    sugarExtendedBuffer: 10,
    optionalTrackers: { sugar: false, potassium: false },
    dayStartHour: 2,
    weekStartsOn: 1,
    liquidPresets: [],
    primaryRegion: "",
    secondaryRegion: "",
    reminderFollowUpCount: 2,
    reminderFollowUpInterval: 10,
    homeTimezone: null,
    homeTimezoneConfirmedAt: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    deletedAt: null,
    deviceId: "dev-A",
    ...overrides,
  };
}

const BASE_STAMPS = {
  waterLimit: 1_000,
  saltLimit: 1_000,
  sugarLimit: 1_000,
  potassiumLimit: 1_000,
  waterExtendedBuffer: 1_000,
  saltExtendedBuffer: 1_000,
  sugarExtendedBuffer: 1_000,
  optionalTrackers: 1_000,
  dayStartHour: 1_000,
  weekStartsOn: 1_000,
  liquidPresets: 1_000,
  primaryRegion: 1_000,
  secondaryRegion: 1_000,
  reminderFollowUpCount: 1_000,
  reminderFollowUpInterval: 1_000,
  homeTimezone: 1_000,
  homeTimezoneConfirmedAt: 1_000,
};

describe("sync-push-route: userSettings merges per setting", () => {
  beforeEach(() => {
    resetDbState();
  });

  async function push(row: Record<string, unknown>, queueId = 1) {
    const { POST } = await import("@/app/api/sync/push/route");
    const res = await POST(
      makePushRequest({ ops: [{ queueId, tableName: "userSettings", op: "upsert", row }] }),
    );
    expect(res.status).toBe(200);
    return (await res.json()) as {
      accepted: { queueId: number; serverUpdatedAt: number }[];
      rejected: unknown[];
    };
  }

  it("an older row's newer edit to a different setting is merged in, not dropped", async () => {
    // Device A (online) changed the water limit at 3000.
    existingRows["settings-1"] = {
      ...settingsRow({
        waterLimit: 2500,
        updatedAt: 3_000,
        fieldUpdatedAt: { ...BASE_STAMPS, waterLimit: 3_000 },
      }),
      userId: "user-test",
    };
    // Device B changed the sodium limit offline at 2000 and pushes late.
    const body = await push(
      settingsRow({
        saltLimit: 1_200,
        updatedAt: 2_000,
        deviceId: "dev-B",
        fieldUpdatedAt: { ...BASE_STAMPS, saltLimit: 2_000 },
      }),
    );

    expect(body.rejected).toEqual([]);
    expect(insertCalls).toHaveLength(1);
    const written = insertCalls[0]!.values;
    expect(written.waterLimit).toBe(2500);
    expect(written.saltLimit).toBe(1200);
    expect(written.fieldUpdatedAt).toMatchObject({ waterLimit: 3_000, saltLimit: 2_000 });
    // Newer than both rows, so both devices pull the merged row.
    expect(written.updatedAt as number).toBeGreaterThan(3_000);
    expect(body.accepted).toEqual([{ queueId: 1, serverUpdatedAt: written.updatedAt }]);
  });

  it("merges a week-start edit from one device with a limit edit from another", async () => {
    existingRows["settings-1"] = {
      ...settingsRow({
        waterLimit: 2500,
        updatedAt: 3_000,
        fieldUpdatedAt: { ...BASE_STAMPS, waterLimit: 3_000 },
      }),
      userId: "user-test",
    };
    await push(
      settingsRow({
        weekStartsOn: 0,
        updatedAt: 2_000,
        deviceId: "dev-B",
        fieldUpdatedAt: { ...BASE_STAMPS, weekStartsOn: 2_000 },
      }),
    );

    expect(insertCalls).toHaveLength(1);
    const written = insertCalls[0]!.values;
    expect(written.weekStartsOn).toBe(0);
    expect(written.waterLimit).toBe(2500);
    expect(written.fieldUpdatedAt).toMatchObject({ weekStartsOn: 2_000, waterLimit: 3_000 });
  });

  it("keeps the server's week start when an older client pushes a row without one", async () => {
    existingRows["settings-1"] = {
      ...settingsRow({ weekStartsOn: 6, fieldUpdatedAt: BASE_STAMPS }),
      userId: "user-test",
    };
    const { weekStartsOn: _drop, ...legacy } = settingsRow({ saltLimit: 1200, updatedAt: 5_000 });
    void _drop;
    await push(legacy);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.values.weekStartsOn).toBe(6);
    expect(insertCalls[0]!.values.saltLimit).toBe(1200);
  });

  it("a push whose settings are all older than the server's writes nothing", async () => {
    existingRows["settings-1"] = {
      ...settingsRow({
        waterLimit: 2500,
        updatedAt: 3_000,
        fieldUpdatedAt: { ...BASE_STAMPS, waterLimit: 3_000 },
      }),
      userId: "user-test",
    };
    const body = await push(
      settingsRow({ waterLimit: 1800, updatedAt: 2_000, fieldUpdatedAt: { ...BASE_STAMPS, waterLimit: 2_000 } }),
    );
    expect(insertCalls).toHaveLength(0);
    expect(body.accepted).toEqual([{ queueId: 1, serverUpdatedAt: 3_000 }]);
  });

  it("a newer push that only carries its own edits is written as sent", async () => {
    existingRows["settings-1"] = {
      ...settingsRow({ fieldUpdatedAt: BASE_STAMPS }),
      userId: "user-test",
    };
    const body = await push(
      settingsRow({ dayStartHour: 4, updatedAt: 5_000, fieldUpdatedAt: { ...BASE_STAMPS, dayStartHour: 5_000 } }),
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.values.dayStartHour).toBe(4);
    expect(insertCalls[0]!.values.updatedAt).toBe(5_000);
    expect(body.accepted).toEqual([{ queueId: 1, serverUpdatedAt: 5_000 }]);
  });

  it("a server row without stamps (pre-migration) resolves like whole-row LWW", async () => {
    existingRows["settings-1"] = {
      ...settingsRow({ waterLimit: 2500, updatedAt: 3_000, fieldUpdatedAt: null }),
      userId: "user-test",
    };
    await push(
      settingsRow({ saltLimit: 1200, updatedAt: 2_000, fieldUpdatedAt: { ...BASE_STAMPS, saltLimit: 2_000 } }),
    );
    // The server row's every setting counts as changed at 3000: it wins.
    expect(insertCalls).toHaveLength(0);
  });
});
