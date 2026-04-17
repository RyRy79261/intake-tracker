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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let existingRows: Record<string, any> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      from: (table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: async (_n: number) => {
            // The WHERE condition is an `and(eq(id, ?), eq(userId, ?))` object
            // built by drizzle-orm. We can't easily introspect it here, so
            // tests stash a single "currently-expected" row by id in
            // `existingRows[id]`. The route fetches by id+userId, so for
            // unit purposes we return whatever the test pre-seeded.
            const rows = Object.values(existingRows);
            return rows.length > 0 ? [rows[0]] : [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      values: (v: any) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onConflictDoUpdate: async ({ set }: { target: unknown; set: any }) => {
          insertCalls.push({ table, values: v, set });
          // Simulate write: stash for subsequent selects in the same op loop.
          existingRows[v.id] = { ...v };
          return undefined;
        },
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
