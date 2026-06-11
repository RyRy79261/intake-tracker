/**
 * Tests for POST /api/sync/cleanup handler.
 *
 * Strategy mirrors src/__tests__/sync-push-route.test.ts:
 *   - Mock @/lib/auth-middleware so withAuth becomes a pass-through HOF that
 *     injects a fixed authenticated context.
 *   - Mock @intake/db/client with a controllable stub `db` whose `.delete()`
 *     chain records the table order and returns a per-table rowCount.
 *   - Dynamically import the route AFTER the mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ────────────────────────────────────────────────────────────────────────
// Controllable stubs driving the drizzle mock
// ────────────────────────────────────────────────────────────────────────

// Records every table passed to db.delete(), in call order.
const deleteCalls: { table: unknown }[] = [];
// Per-table-reference rowCount the stub should report back.
let rowCountByTableRef = new Map<unknown, number>();
// When set, db.delete throws — used to exercise the error path.
let deleteShouldThrow: Error | null = null;

function resetDbState() {
  deleteCalls.length = 0;
  rowCountByTableRef = new Map();
  deleteShouldThrow = null;
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
    delete: (table: unknown) => ({
      where: async (_cond: unknown) => {
        if (deleteShouldThrow) throw deleteShouldThrow;
        deleteCalls.push({ table });
        return { rowCount: rowCountByTableRef.get(table) ?? 0 };
      },
    }),
  };
  return { db };
});

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
  return new NextRequest("https://example.test/api/sync/cleanup", {
    method: "POST",
  });
}

// The exact order the route must delete in (child tables before parents so
// foreign keys never break). Mirrors DELETION_ORDER in the route.
const EXPECTED_DELETION_ORDER = [
  "doseLogs",
  "inventoryTransactions",
  "inventoryItems",
  "phaseSchedules",
  "medicationPhases",
  "titrationPlans",
  "prescriptions",
  "substanceRecords",
  "auditLogs",
  "dailyNotes",
  "defecationRecords",
  "urinationRecords",
  "eatingRecords",
  "bloodPressureRecords",
  "weightRecords",
  "intakeRecords",
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("sync-cleanup-route", () => {
  beforeEach(() => {
    resetDbState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes every table in FK-safe order (children before parents)", async () => {
    const { POST } = await import("@/app/api/sync/cleanup/route");
    const { schemaByTableName } = await import("@intake/db/sync-payload");

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // One delete per table in DELETION_ORDER, no more, no fewer.
    expect(deleteCalls).toHaveLength(EXPECTED_DELETION_ORDER.length);

    // Map each recorded table reference back to its name and assert order.
    const refToName = new Map<unknown, string>(
      Object.entries(schemaByTableName).map(([name, ref]) => [ref, name]),
    );
    const deletedNames = deleteCalls.map((c) => refToName.get(c.table));
    expect(deletedNames).toEqual(EXPECTED_DELETION_ORDER);
  });

  it("returns per-table deleted counts from the DB rowCount", async () => {
    const { schemaByTableName } = await import("@intake/db/sync-payload");
    rowCountByTableRef.set(schemaByTableName.intakeRecords, 7);
    rowCountByTableRef.set(schemaByTableName.doseLogs, 3);

    const { POST } = await import("@/app/api/sync/cleanup/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as { deleted: Record<string, number> };
    expect(body.deleted.intakeRecords).toBe(7);
    expect(body.deleted.doseLogs).toBe(3);
    // Tables that returned no rowCount default to 0, never undefined.
    expect(body.deleted.weightRecords).toBe(0);
    // Every table in the deletion order appears in the response.
    for (const name of EXPECTED_DELETION_ORDER) {
      expect(typeof body.deleted[name]).toBe("number");
    }
  });

  it("treats a missing rowCount as 0 (?? 0 fallback)", async () => {
    // No rowCounts seeded — every table's `result.rowCount` is undefined.
    const { POST } = await import("@/app/api/sync/cleanup/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: Record<string, number> };
    for (const name of EXPECTED_DELETION_ORDER) {
      expect(body.deleted[name]).toBe(0);
    }
  });

  it("returns 500 with a generic message and no raw error detail when the DB throws", async () => {
    deleteShouldThrow = new Error(
      'duplicate key value violates unique constraint "intake_records_pkey"',
    );
    const { POST } = await import("@/app/api/sync/cleanup/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    // Generic, hardened message — no Postgres internals leaked.
    expect(body.error).toBe("Failed to clean up user data");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("duplicate key");
    expect(serialized).not.toContain("intake_records_pkey");
    expect(serialized).not.toContain("constraint");
  });
});
