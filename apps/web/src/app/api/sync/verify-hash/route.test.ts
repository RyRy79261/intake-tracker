/**
 * Tests for POST /api/sync/verify-hash handler.
 *
 * Strategy mirrors src/__tests__/sync-pull-route.test.ts:
 *   - Mock @/lib/auth-middleware so withAuth becomes a pass-through HOF that
 *     injects a fixed authenticated context.
 *   - Mock @intake/db/client with a controllable stub `db` whose
 *     `.select().from(table).where().orderBy().limit()` chain returns
 *     per-table rows. The route chunks at SELECT_CHUNK_SIZE (200), so the
 *     stub returns whatever rows the test seeds in a single page.
 *   - Dynamically import the route AFTER the mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";

// ────────────────────────────────────────────────────────────────────────
// Controllable stubs driving the drizzle mock
// ────────────────────────────────────────────────────────────────────────

type StubRow = Record<string, unknown>;

// Per-table-reference rows; tests seed this before calling POST.
let rowsByTableRef = new Map<unknown, StubRow[]>();
// When set, db.select throws — used to exercise the error path.
let selectShouldThrow: Error | null = null;

function resetDbState() {
  rowsByTableRef = new Map();
  selectShouldThrow = null;
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
    select: () => ({
      from: (table: unknown) => ({
        where: (_cond: unknown) => ({
          orderBy: (_ord: unknown) => ({
            limit: async (_n: number) => {
              if (selectShouldThrow) throw selectShouldThrow;
              // Return the seeded rows once; the route's keyset loop calls
              // again with a cursor — return [] then so the loop terminates
              // (rows.length < SELECT_CHUNK_SIZE on the seeded page already
              // breaks, but this keeps the stub robust).
              return rowsByTableRef.get(table) ?? [];
            },
          }),
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
  return new NextRequest("https://example.test/api/sync/verify-hash", {
    method: "POST",
  });
}

/**
 * Reimplements the route's deterministic row serialization so a test can
 * compute the expected SHA-256 independently.
 */
function deterministicJsonRow(row: Record<string, unknown>): string {
  return JSON.stringify(row, (_, value) =>
    value === undefined
      ? null
      : value && typeof value === "object" && !Array.isArray(value)
        ? Object.keys(value)
            .sort()
            .reduce<Record<string, unknown>>((acc, k) => {
              acc[k] = value[k as keyof typeof value];
              return acc;
            }, {})
        : value,
  );
}

function expectedHashFor(rowsWithoutUserId: Record<string, unknown>[]): string {
  const hash = createHash("sha256");
  hash.update("[");
  rowsWithoutUserId.forEach((row, i) => {
    if (i > 0) hash.update(",");
    hash.update(deterministicJsonRow(row));
  });
  hash.update("]");
  return hash.digest("hex");
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("sync-verify-hash-route", () => {
  beforeEach(() => {
    resetDbState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a 64-char hex SHA-256 hash and a count for every table", async () => {
    const { POST } = await import("@/app/api/sync/verify-hash/route");
    const { schemaByTableName } = await import("@intake/db/sync-payload");

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hashes: Record<string, string>;
      rowCounts: Record<string, number>;
    };

    const tableNames = Object.keys(schemaByTableName);
    expect(Object.keys(body.hashes).sort()).toEqual([...tableNames].sort());
    expect(Object.keys(body.rowCounts).sort()).toEqual(
      [...tableNames].sort(),
    );

    for (const name of tableNames) {
      // Hash of an empty table is still a valid 64-char hex digest.
      expect(body.hashes[name]).toMatch(SHA256_HEX);
      expect(body.rowCounts[name]).toBe(0);
    }
  });

  it("hashes seeded rows deterministically and excludes userId from the digest", async () => {
    const { schemaByTableName } = await import("@intake/db/sync-payload");
    // userId is present on the DB rows but MUST be stripped before hashing.
    const dbRows: StubRow[] = [
      { id: "a", userId: "user-test", amount: 250, updatedAt: 1000 },
      { id: "b", userId: "user-test", amount: 500, updatedAt: 2000 },
    ];
    rowsByTableRef.set(schemaByTableName.intakeRecords, dbRows);

    const { POST } = await import("@/app/api/sync/verify-hash/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hashes: Record<string, string>;
      rowCounts: Record<string, number>;
    };

    expect(body.rowCounts.intakeRecords).toBe(2);

    // Expected hash computed over the rows WITHOUT userId.
    const expected = expectedHashFor([
      { id: "a", amount: 250, updatedAt: 1000 },
      { id: "b", amount: 500, updatedAt: 2000 },
    ]);
    expect(body.hashes.intakeRecords).toBe(expected);

    // Sanity: a hash that mistakenly included userId would differ.
    const withUserId = expectedHashFor(dbRows);
    expect(body.hashes.intakeRecords).not.toBe(withUserId);
  });

  it("produces an identical hash regardless of key order within a row", async () => {
    const { schemaByTableName } = await import("@intake/db/sync-payload");

    // Same logical row, keys in a different insertion order.
    rowsByTableRef.set(schemaByTableName.weightRecords, [
      { userId: "user-test", id: "w1", weight: 80, updatedAt: 5 },
    ]);
    const { POST: POST1 } = await import("@/app/api/sync/verify-hash/route");
    const body1 = (await (await POST1(makeRequest())).json()) as {
      hashes: Record<string, string>;
    };

    resetDbState();
    rowsByTableRef.set(schemaByTableName.weightRecords, [
      { updatedAt: 5, weight: 80, id: "w1", userId: "user-test" },
    ]);
    const { POST: POST2 } = await import("@/app/api/sync/verify-hash/route");
    const body2 = (await (await POST2(makeRequest())).json()) as {
      hashes: Record<string, string>;
    };

    // Deterministic serialization sorts keys, so both digests must match.
    expect(body1.hashes.weightRecords).toBe(body2.hashes.weightRecords);
    expect(body1.hashes.weightRecords).toMatch(SHA256_HEX);
  });

  it("returns 500 with a generic message and no raw error detail when the DB throws", async () => {
    selectShouldThrow = new Error(
      'column "user_id" does not exist (SQLSTATE 42703)',
    );
    const { POST } = await import("@/app/api/sync/verify-hash/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    // Generic, hardened message — no Postgres internals leaked.
    expect(body.error).toBe("Failed to compute verification hashes");
    expect(body).not.toHaveProperty("hashes");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("42703");
    expect(serialized).not.toContain("does not exist");
  });
});
