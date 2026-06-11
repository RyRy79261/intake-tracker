/**
 * Tests for POST /api/push/subscribe — stores a Web Push subscription.
 *
 * withAuth is a pass-through HOF; the push-db savePushSubscription helper is
 * mocked. Covers happy path, body validation, and the error path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockSavePushSubscription = vi.fn();
vi.mock("@/lib/push-db", () => ({
  savePushSubscription: (...args: unknown[]) =>
    mockSavePushSubscription(...args),
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

function makeRequest(rawBody: string): NextRequest {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method: "POST",
    body: rawBody,
    headers: { "content-type": "application/json" },
  });
}

async function callSubscribe(rawBody: string) {
  const { POST } = await import("@/app/api/push/subscribe/route");
  return POST(makeRequest(rawBody));
}

const VALID_SUB = {
  endpoint: "https://push.example.com/endpoint/abc123",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSavePushSubscription.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves a valid subscription and returns { ok: true }", async () => {
    const res = await callSubscribe(JSON.stringify(VALID_SUB));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSavePushSubscription).toHaveBeenCalledWith(
      "user-test",
      VALID_SUB,
    );
  });

  it("rejects with 400 when the endpoint is not a valid URL", async () => {
    const res = await callSubscribe(
      JSON.stringify({ ...VALID_SUB, endpoint: "not-a-url" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(mockSavePushSubscription).not.toHaveBeenCalled();
  });

  it("rejects with 400 when keys are missing", async () => {
    const res = await callSubscribe(
      JSON.stringify({ endpoint: VALID_SUB.endpoint }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(mockSavePushSubscription).not.toHaveBeenCalled();
  });

  it("rejects with 400 when a key value is an empty string", async () => {
    const res = await callSubscribe(
      JSON.stringify({
        ...VALID_SUB,
        keys: { p256dh: "", auth: "auth-key" },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
  });

  it("rejects with 400 when the body is malformed JSON", async () => {
    const res = await callSubscribe("{ this is not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(mockSavePushSubscription).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when savePushSubscription throws (no raw error leak)", async () => {
    mockSavePushSubscription.mockRejectedValue(
      new Error("insert failed on host db.internal"),
    );
    const res = await callSubscribe(JSON.stringify(VALID_SUB));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to save subscription" });
    expect(JSON.stringify(body)).not.toContain("db.internal");
  });
});
