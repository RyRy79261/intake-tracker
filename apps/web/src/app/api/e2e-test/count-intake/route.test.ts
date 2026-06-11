/**
 * Tests for POST /api/e2e-test/count-intake handler.
 *
 * The route is a test-only helper guarded by a NODE_ENV / ENABLE_E2E_TEST_ROUTES
 * check: in production it must 404 unless the flag is explicitly "true".
 *
 * Strategy:
 *   - Mock @/lib/auth-middleware so withAuth injects a fixed userId.
 *   - Mock @intake/db/client with a controllable `select().from().where()` chain
 *     that resolves to a `[{ count }]` row.
 *   - Use vi.stubEnv to flip NODE_ENV / ENABLE_E2E_TEST_ROUTES per case.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

let countResult: Array<{ count: number }> = [{ count: 0 }];
let selectShouldThrow: Error | null = null;
let lastWhereCond: unknown = null;

function resetDbState() {
  countResult = [{ count: 0 }];
  selectShouldThrow = null;
  lastWhereCond = null;
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

vi.mock("@intake/db/client", () => {
  const db = {
    select: (_proj: unknown) => ({
      from: (_table: unknown) => ({
        where: (cond: unknown) => {
          lastWhereCond = cond;
          if (selectShouldThrow) return Promise.reject(selectShouldThrow);
          return Promise.resolve(countResult);
        },
      }),
    }),
  };
  return { db };
});

function makeRequest(): NextRequest {
  return new NextRequest("https://example.test/api/e2e-test/count-intake", {
    method: "POST",
  });
}

describe("e2e-test/count-intake-route", () => {
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

    const { POST } = await import("@/app/api/e2e-test/count-intake/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Not available");
    // The DB must not have been touched once the guard blocked the request.
    expect(lastWhereCond).toBeNull();
  });

  it("works in production when ENABLE_E2E_TEST_ROUTES is 'true'", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_E2E_TEST_ROUTES", "true");
    countResult = [{ count: 7 }];

    const { POST } = await import("@/app/api/e2e-test/count-intake/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(7);
    // Proves the userId filter was applied.
    expect(lastWhereCond).not.toBeNull();
  });

  it("works outside production regardless of the flag", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENABLE_E2E_TEST_ROUTES", "");
    countResult = [{ count: 3 }];

    const { POST } = await import("@/app/api/e2e-test/count-intake/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(3);
  });

  it("returns count 0 when the query yields no rows", async () => {
    vi.stubEnv("NODE_ENV", "test");
    countResult = [];

    const { POST } = await import("@/app/api/e2e-test/count-intake/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(0);
  });
});
