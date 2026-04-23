/**
 * Tests for POST /api/sync/push handler — Plan 43-03.
 *
 * Strategy:
 *   - Mock @/lib/auth-middleware so withAuth becomes a pass-through that
 *     injects `auth.userId = "user-test"` into the handler context. This
 *     avoids depending on the real Neon Auth session machinery, which is
 *     already covered by src/__tests__/auth-middleware.test.ts.
 *   - Mock @/lib/drizzle by intercepting the module and returning a stub
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

type ServerRow = {
  id: string;
  userId: string;
  updatedAt: number;
  deletedAt: number | null;
} | undefined;

let existingRows: Record<string, any> = {};
const insertCalls: { table: unknown; values: any; set: any }[] = [];

function resetDbState() {
  existingRows = {};
  insertCalls.length = 0;
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
vi.mock("@/lib/drizzle", () => {
  const db = {
    select: () => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => {
          const rows = Object.values(existingRows);
          return Promise.resolve(rows);
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: any) => ({
        onConflictDoUpdate: async ({ set }: { target: unknown; set: any }) => {
          insertCalls.push({ table, values: v, set });
          existingRows[v.id] = { ...v };
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

  it("deletedAt wins: non-null deletedAt on either side prevents resurrection", async () => {
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
          row: validIntakeRow({ updatedAt: 9999, deletedAt: null }),
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
      details?: unknown;
    };
    expect(body.error).toBe("Invalid request");
    // Parse error should mention the 500-cap
    expect(JSON.stringify(body.details)).toContain("500");
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
});
