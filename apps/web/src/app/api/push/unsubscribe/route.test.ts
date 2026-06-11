/**
 * Tests for POST /api/push/unsubscribe — removes a user's Web Push
 * subscription. Takes no request body; withAuth is a pass-through HOF and the
 * push-db deletePushSubscription helper is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockDeletePushSubscription = vi.fn();
vi.mock("@/lib/push-db", () => ({
  deletePushSubscription: (...args: unknown[]) =>
    mockDeletePushSubscription(...args),
}));

vi.mock("@/lib/auth-middleware", () => ({
  withAuth:
    (handler: (ctx: { request: NextRequest; auth: unknown }) => Promise<Response>) =>
    async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "user-test", email: "test@example.test" },
      }),
}));

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/push/unsubscribe", {
    method: "POST",
  });
}

async function callUnsubscribe() {
  const { POST } = await import("@/app/api/push/unsubscribe/route");
  return POST(makeRequest());
}

describe("POST /api/push/unsubscribe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDeletePushSubscription.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes the subscription for the authenticated user and returns { ok: true }", async () => {
    const res = await callUnsubscribe();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDeletePushSubscription).toHaveBeenCalledWith("user-test");
  });

  it("returns a generic 500 when deletePushSubscription throws (no raw error leak)", async () => {
    mockDeletePushSubscription.mockRejectedValue(
      new Error("delete failed against db host 10.0.0.5"),
    );
    const res = await callUnsubscribe();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to remove subscription" });
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });
});
