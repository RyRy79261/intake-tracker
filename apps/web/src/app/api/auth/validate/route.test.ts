/**
 * Tests for GET /api/auth/validate handler.
 *
 * The route simply echoes the authenticated identity back to the client. We
 * mock @/lib/auth-middleware so withAuth becomes a pass-through HOF that
 * injects a fixed auth context — the same strategy as sync-push-route.test.ts.
 * The real session machinery is covered by auth-middleware.test.ts.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

let injectedAuth: {
  success: true;
  userId: string | null;
  email: string | undefined;
} = {
  success: true,
  userId: "user-test",
  email: "test@example.test",
};

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string | null; email: string | undefined };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) =>
      handler({ request, auth: injectedAuth });
  },
}));

function makeRequest(): NextRequest {
  return new NextRequest("https://example.test/api/auth/validate", {
    method: "GET",
  });
}

describe("auth-validate-route", () => {
  afterEach(() => {
    injectedAuth = {
      success: true,
      userId: "user-test",
      email: "test@example.test",
    };
    vi.restoreAllMocks();
  });

  it("echoes the authenticated user id and email", async () => {
    injectedAuth = {
      success: true,
      userId: "user-abc",
      email: "person@example.test",
    };
    const { GET } = await import("@/app/api/auth/validate/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { id: string; email: string };
      session: { userId: string };
    };
    expect(body).toEqual({
      user: { id: "user-abc", email: "person@example.test" },
      session: { userId: "user-abc" },
    });
  });

  it("nests userId consistently in both user and session blocks", async () => {
    injectedAuth = {
      success: true,
      userId: "shared-id",
      email: "x@example.test",
    };
    const { GET } = await import("@/app/api/auth/validate/route");
    const res = await GET(makeRequest());

    const body = (await res.json()) as {
      user: { id: string };
      session: { userId: string };
    };
    expect(body.user.id).toBe("shared-id");
    expect(body.session.userId).toBe("shared-id");
  });

  it("passes through a null email without crashing", async () => {
    injectedAuth = { success: true, userId: "user-test", email: undefined };
    const { GET } = await import("@/app/api/auth/validate/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { id: string; email: string | null };
    };
    expect(body.user.id).toBe("user-test");
    // undefined email is dropped by JSON serialization.
    expect(body.user.email ?? null).toBeNull();
  });
});
