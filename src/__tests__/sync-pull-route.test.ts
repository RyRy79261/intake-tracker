/**
 * Tests for POST /api/sync/pull handler — Plan 43-04.
 *
 * Strategy:
 *   - Mock @/lib/auth-middleware so withAuth becomes a pass-through that
 *     injects `auth.userId = "user-test"` into the handler context. This
 *     matches the sync-push-route.test.ts pattern and keeps these tests
 *     independent of the real Neon Auth session machinery (already covered
 *     by src/__tests__/auth-middleware.test.ts).
 *   - Mock @/lib/drizzle by intercepting the module and returning a stub
 *     `db.select().from(table).where(cond).orderBy(_).limit(n)` chain that
 *     records every `where` condition so tests can assert user_id scoping.
 *   - Dynamically import the route module AFTER mocks are registered so
 *     module-load side effects pick up the mocks.
 *
 * Reference: 43-04-PLAN.md Task 2, 43-VALIDATION.md row for SYNC-03
 * "Pull route scopes every query by eq(table.userId, auth.userId!)".
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

type StubRow = Record<string, unknown>;

// Per-table row map keyed by tableName; tests populate this before calling
// POST. The stub .from(table) looks up the table by reference identity.
let rowsByTableRef = new Map<unknown, StubRow[]>();

// Every WHERE call gets recorded here for assertion. The condition object is
// drizzle-orm's opaque SQL AST; tests assert on its stringified form (which
// contains the quoted column references from the table definitions).
const whereCalls: { table: unknown; condition: unknown }[] = [];

function resetDbState() {
  rowsByTableRef = new Map();
  whereCalls.length = 0;
}

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "user-test" },
      });
  },
}));

vi.mock("@/lib/drizzle", () => {
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          whereCalls.push({ table, condition });
          return {
            orderBy: (_ord: unknown) => ({
              limit: async (_n: number) => {
                return rowsByTableRef.get(table) ?? [];
              },
            }),
          };
        },
      }),
    }),
  };
  return { db };
});

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function makePullRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/sync/pull", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("sync-pull-route", () => {
  beforeEach(() => {
    resetDbState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("user_id scoped: every Drizzle SELECT includes eq(table.userId, auth.userId!)", async () => {
    const { POST } = await import("@/app/api/sync/pull/route");
    const { schemaByTableName } = await import("@/lib/sync-payload");

    const res = await POST(makePullRequest({ cursors: {} }));
    expect(res.status).toBe(200);

    // One WHERE call per table (16 tables).
    const tableCount = Object.keys(schemaByTableName).length;
    expect(whereCalls).toHaveLength(tableCount);

    // Each recorded condition is a drizzle SQL AST node (an `SQL` instance
    // from `and(eq(), eq())`). Walk it recursively collecting column `.name`
    // strings and parameter `.value` strings; assert both "user_id" (column)
    // and "user-test" (session userId param) appear in every WHERE.
    //
    // Using a visited-set guard avoids drizzle's circular
    // column.table → table.columns.<col> → column reference.
    function collect(
      node: unknown,
      out: Set<string>,
      seen: WeakSet<object>,
    ): void {
      if (node === null || node === undefined) return;
      if (typeof node === "string") {
        out.add(node);
        return;
      }
      if (typeof node === "number" || typeof node === "boolean") {
        out.add(String(node));
        return;
      }
      if (typeof node !== "object") return;
      if (seen.has(node as object)) return;
      seen.add(node as object);

      // Skip PgTable handles — they have a `columns` object with circular
      // refs back to the table. The column name we care about is already
      // carried on the individual `PgColumn` nodes inside queryChunks.
      if ("columns" in (node as object) && "schema" in (node as object)) {
        return;
      }

      if (Array.isArray(node)) {
        for (const child of node) collect(child, out, seen);
        return;
      }
      for (const [key, value] of Object.entries(node as object)) {
        // Column reference: `.name` is the physical column name (e.g. "user_id").
        if (key === "name" && typeof value === "string") out.add(value);
        // Parameter value: drizzle wraps literals in `{ value: X, encoder: ... }`.
        if (key === "value") collect(value, out, seen);
        if (key === "queryChunks" || key === "chunks") collect(value, out, seen);
      }
    }

    for (const { condition } of whereCalls) {
      const tokens = new Set<string>();
      collect(condition, tokens, new WeakSet());
      expect(Array.from(tokens)).toContain("user_id");
      expect(Array.from(tokens)).toContain("user-test");
    }
  });

  it("returns rows with updated_at > cursor, ordered ASC", async () => {
    const { POST } = await import("@/app/api/sync/pull/route");
    const { schemaByTableName } = await import("@/lib/sync-payload");

    // Seed intakeRecords with rows already sorted ASC by updatedAt — the
    // route must return them in the same order (the stub honours what the
    // test provided, and the route does NOT re-sort).
    const intakeRows: StubRow[] = [
      { id: "a", updatedAt: 1001, deletedAt: null },
      { id: "b", updatedAt: 1002, deletedAt: null },
      { id: "c", updatedAt: 1003, deletedAt: null },
    ];
    rowsByTableRef.set(schemaByTableName.intakeRecords, intakeRows);

    const res = await POST(
      makePullRequest({ cursors: { intakeRecords: 1000 } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: Record<string, { rows: StubRow[]; hasMore: boolean }>;
      serverTime: number;
    };

    const returned = body.result.intakeRecords!.rows;
    expect(returned).toHaveLength(3);
    expect(returned.map((r) => r.id)).toEqual(["a", "b", "c"]);
    // Every returned row has updatedAt > the request cursor.
    for (const r of returned) {
      expect((r as { updatedAt: number }).updatedAt).toBeGreaterThan(1000);
    }
    expect(body.result.intakeRecords!.hasMore).toBe(false);
  });

  it("soft-caps per table at PULL_SOFT_CAP (500) and sets hasMore=true when exceeded", async () => {
    const { POST } = await import("@/app/api/sync/pull/route");
    const { schemaByTableName, PULL_SOFT_CAP } = await import(
      "@/lib/sync-payload"
    );

    // Return PULL_SOFT_CAP + 1 rows — the route queries with
    // limit(PULL_SOFT_CAP + 1), so the stub gives it exactly that many,
    // and the route must slice to PULL_SOFT_CAP + flag hasMore=true.
    const big: StubRow[] = Array.from({ length: PULL_SOFT_CAP + 1 }, (_, i) => ({
      id: `row-${i}`,
      updatedAt: 2000 + i,
      deletedAt: null,
    }));
    rowsByTableRef.set(schemaByTableName.intakeRecords, big);

    const res = await POST(makePullRequest({ cursors: {} }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: Record<string, { rows: StubRow[]; hasMore: boolean }>;
      serverTime: number;
    };

    expect(body.result.intakeRecords!.rows).toHaveLength(PULL_SOFT_CAP);
    expect(body.result.intakeRecords!.hasMore).toBe(true);
  });

  it("includes tombstones (deletedAt != null) in response", async () => {
    const { POST } = await import("@/app/api/sync/pull/route");
    const { schemaByTableName } = await import("@/lib/sync-payload");

    const tombstone: StubRow = {
      id: "deleted-1",
      updatedAt: 3000,
      deletedAt: 2999, // Tombstone — MUST be included in response.
    };
    const live: StubRow = {
      id: "live-1",
      updatedAt: 3001,
      deletedAt: null,
    };
    rowsByTableRef.set(schemaByTableName.intakeRecords, [tombstone, live]);

    const res = await POST(makePullRequest({ cursors: {} }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: Record<string, { rows: StubRow[]; hasMore: boolean }>;
      serverTime: number;
    };

    const ids = body.result.intakeRecords!.rows.map((r) => r.id);
    expect(ids).toContain("deleted-1");
    expect(ids).toContain("live-1");
    const tombstoneRow = body.result.intakeRecords!.rows.find(
      (r) => r.id === "deleted-1",
    ) as { deletedAt: number | null } | undefined;
    expect(tombstoneRow?.deletedAt).toBe(2999);
  });

  it("returns serverTime for client-side skew-margin cursor clamp", async () => {
    const { POST } = await import("@/app/api/sync/pull/route");

    const before = Date.now();
    const res = await POST(makePullRequest({ cursors: {} }));
    const after = Date.now();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { serverTime: number };
    expect(typeof body.serverTime).toBe("number");
    // serverTime is captured inside the handler between `before` and `after`.
    // Allow a 1000ms slack on either side for slow CI.
    expect(body.serverTime).toBeGreaterThanOrEqual(before - 1000);
    expect(body.serverTime).toBeLessThanOrEqual(after + 1000);
  });

  it("rejects unauthenticated requests with 401 via withAuth", async () => {
    // Override the auth mock for this one test: withAuth now rejects with
    // a 401 NextResponse like the real implementation does when no session
    // is present. This is a thin test — Phase 41 covers withAuth in depth.
    vi.resetModules();
    vi.doMock("@/lib/auth-middleware", () => ({
      withAuth: () => {
        return async (_request: NextRequest) => {
          const { NextResponse } = await import("next/server");
          return NextResponse.json(
            { error: "No active session", requiresAuth: true },
            { status: 401 },
          );
        };
      },
    }));
    // Re-mock drizzle for the fresh module graph.
    vi.doMock("@/lib/drizzle", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({ limit: async () => [] }),
            }),
          }),
        }),
      },
    }));

    const { POST } = await import("@/app/api/sync/pull/route");
    const res = await POST(makePullRequest({ cursors: {} }));
    expect(res.status).toBe(401);
  });
});
