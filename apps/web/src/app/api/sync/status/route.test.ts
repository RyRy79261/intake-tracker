/**
 * Tests for GET /api/sync/status handler.
 *
 * Strategy mirrors src/__tests__/sync-pull-route.test.ts:
 *   - Mock @/lib/auth-middleware so withAuth becomes a pass-through HOF that
 *     injects a fixed authenticated context.
 *   - Mock @intake/db/client with a controllable stub `db` whose
 *     `.select().from(table).where().limit(1)` chain returns per-table rows
 *     so tests can drive the "has previously synced" probe.
 *   - Dynamically import the route AFTER the mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ────────────────────────────────────────────────────────────────────────
// Controllable stubs driving the drizzle mock
// ────────────────────────────────────────────────────────────────────────

type StubRow = Record<string, unknown>;

// Per-table-reference rows the probe should find.
let rowsByTableRef = new Map<unknown, StubRow[]>();
// When set, db.select throws — used to exercise the error path.
let selectShouldThrow: Error | null = null;
// Counts how many tables were probed before a short-circuit.
let probedTableCount = 0;

function resetDbState() {
  rowsByTableRef = new Map();
  selectShouldThrow = null;
  probedTableCount = 0;
}

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string; email: string };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) =>
      handler({
        request,
        auth: {
          success: true,
          userId: "user-test",
          email: "test@example.test",
        },
      });
  },
}));

vi.mock("@intake/db/client", () => {
  const db = {
    select: (_proj: unknown) => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: async (_n: number) => {
            if (selectShouldThrow) throw selectShouldThrow;
            probedTableCount++;
            return rowsByTableRef.get(table) ?? [];
          },
        }),
      }),
    }),
  };
  return { db };
});

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
  return new NextRequest("https://example.test/api/sync/status", {
    method: "GET",
  });
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("sync-status-route", () => {
  beforeEach(() => {
    resetDbState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns hasSyncedData: false when every probe table is empty", async () => {
    const { GET } = await import("@/app/api/sync/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { hasSyncedData: boolean };
    expect(body.hasSyncedData).toBe(false);
    // No table had rows, so every probe table must have been queried.
    expect(probedTableCount).toBe(5);
  });

  it("returns hasSyncedData: true when a probe table has a row", async () => {
    const { weightRecords } = await import("@intake/db/schema");
    rowsByTableRef.set(weightRecords, [{ id: "w-1" }]);

    const { GET } = await import("@/app/api/sync/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { hasSyncedData: boolean };
    expect(body.hasSyncedData).toBe(true);
  });

  it("short-circuits on the first table that has data", async () => {
    // intakeRecords is the first PROBE_TABLE — a hit there must stop the loop
    // before any later table is queried.
    const { intakeRecords } = await import("@intake/db/schema");
    rowsByTableRef.set(intakeRecords, [{ id: "i-1" }]);

    const { GET } = await import("@/app/api/sync/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { hasSyncedData: boolean };
    expect(body.hasSyncedData).toBe(true);
    // Only the first table was probed — proves the short-circuit.
    expect(probedTableCount).toBe(1);
  });

  it("returns 500 with a generic message and no raw error detail when the DB throws", async () => {
    selectShouldThrow = new Error(
      'relation "intake_records" does not exist (SQLSTATE 42P01)',
    );
    const { GET } = await import("@/app/api/sync/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    // Generic, hardened message — no Postgres internals leaked.
    expect(body.error).toBe("Failed to check sync status");
    expect(body).not.toHaveProperty("hasSyncedData");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("relation");
    expect(serialized).not.toContain("42P01");
    expect(serialized).not.toContain("does not exist");
  });
});
