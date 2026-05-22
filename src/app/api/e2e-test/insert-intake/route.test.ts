/**
 * Tests for POST /api/e2e-test/insert-intake handler.
 *
 * The route is a test-only helper guarded by the NODE_ENV /
 * ENABLE_E2E_TEST_ROUTES check. It inserts an intake record, applying
 * sensible defaults for any field the caller omits.
 *
 * It was hardened to NOT leak raw DB errors: on failure it returns a generic
 * { error: "Insert failed" } with status 500 — this test locks that in.
 *
 * Strategy:
 *   - Mock @/lib/auth-middleware so withAuth injects a fixed userId.
 *   - Mock @/lib/drizzle with an `insert().values()` chain that records the
 *     written row, or rejects when configured to.
 *   - Use vi.stubEnv to flip the guard env vars.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

let insertedRows: Array<Record<string, unknown>> = [];
let insertShouldThrow: Error | null = null;

function resetDbState() {
  insertedRows = [];
  insertShouldThrow = null;
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
        auth: { success: true, userId: "user-test", email: "test@example.test" },
      });
  },
}));

vi.mock("@/lib/drizzle", () => {
  const db = {
    insert: (_table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        if (insertShouldThrow) return Promise.reject(insertShouldThrow);
        insertedRows.push(row);
        return Promise.resolve(undefined);
      },
    }),
  };
  return { db };
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/e2e-test/insert-intake", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("e2e-test/insert-intake-route", () => {
  beforeEach(() => {
    resetDbState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("404s in production when ENABLE_E2E_TEST_ROUTES is not set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_E2E_TEST_ROUTES", "");

    const { POST } = await import("@/app/api/e2e-test/insert-intake/route");
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Not available");
    // Guard must block before any DB write.
    expect(insertedRows).toHaveLength(0);
  });

  it("works in production when ENABLE_E2E_TEST_ROUTES is 'true'", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_E2E_TEST_ROUTES", "true");

    const { POST } = await import("@/app/api/e2e-test/insert-intake/route");
    const res = await POST(makeRequest({ id: "rec-prod" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(body.id).toBe("rec-prod");
    expect(insertedRows).toHaveLength(1);
  });

  it("applies field defaults for an empty body", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const { POST } = await import("@/app/api/e2e-test/insert-intake/route");
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      id: string;
      updatedAt: number;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
    expect(typeof body.updatedAt).toBe("number");

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0]!;
    // Documented defaults from the route.
    expect(row.type).toBe("water");
    expect(row.amount).toBe(250);
    expect(row.source).toBe("e2e-server-insert");
    expect(row.deviceId).toBe("server-e2e");
    expect(row.timezone).toBe("UTC");
    expect(row.deletedAt).toBeNull();
    // userId always comes from the session, never the body.
    expect(row.userId).toBe("user-test");
  });

  it("honours caller-supplied field values over defaults", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const { POST } = await import("@/app/api/e2e-test/insert-intake/route");
    const res = await POST(
      makeRequest({
        id: "custom-id",
        type: "salt",
        amount: 1234,
        timestamp: 111,
        timezone: "Africa/Johannesburg",
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("custom-id");

    const row = insertedRows[0]!;
    expect(row.id).toBe("custom-id");
    expect(row.type).toBe("salt");
    expect(row.amount).toBe(1234);
    expect(row.timestamp).toBe(111);
    expect(row.timezone).toBe("Africa/Johannesburg");
  });

  it("rejects a userId injected via the request body", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const { POST } = await import("@/app/api/e2e-test/insert-intake/route");
    const res = await POST(makeRequest({ userId: "attacker" }));

    expect(res.status).toBe(200);
    // The DB write must always carry the session-derived userId.
    expect(insertedRows[0]!.userId).toBe("user-test");
    expect(insertedRows[0]!.userId).not.toBe("attacker");
  });

  it("returns a generic 500 without leaking raw DB errors", async () => {
    vi.stubEnv("NODE_ENV", "test");
    insertShouldThrow = new Error(
      'duplicate key value violates unique constraint "intake_records_pkey" (SQLSTATE 23505)',
    );

    const { POST } = await import("@/app/api/e2e-test/insert-intake/route");
    const res = await POST(makeRequest({ id: "dup" }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Insert failed");
    // Hardened: no Postgres internals must reach the client.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("duplicate key");
    expect(serialized).not.toContain("23505");
    expect(serialized).not.toContain("intake_records_pkey");
    expect(body).not.toHaveProperty("ok");
  });

  it("returns a generic 500 when the request body is not valid JSON", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const badReq = new NextRequest(
      "https://example.test/api/e2e-test/insert-intake",
      {
        method: "POST",
        body: "not-json{",
        headers: { "content-type": "application/json" },
      },
    );

    const { POST } = await import("@/app/api/e2e-test/insert-intake/route");
    const res = await POST(badReq);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Insert failed");
    expect(insertedRows).toHaveLength(0);
  });
});
