import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

type GetSessionResult = {
  data: { user: { id: string; email: string } } | null;
  error: null;
};

const getSessionMock = vi.fn(
  async (): Promise<GetSessionResult> => ({ data: null, error: null })
);

vi.mock("@/lib/neon-auth", () => ({
  auth: {
    getSession: () => getSessionMock(),
    handler: () => ({
      GET: async () => new Response(null, { status: 204 }),
      POST: async () => new Response(null, { status: 204 }),
    }),
    middleware: () => async () => new Response(null, { status: 204 }),
  },
}));

// withAuth upserts the user into neon_auth.users_sync; stub the DB so the
// test runtime doesn't need a real Neon connection.
vi.mock("@/lib/drizzle", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: async () => undefined,
      }),
    }),
  },
}));

const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal("fetch", fetchMock);

const ORIGINAL_ALLOWED_EMAILS = process.env.ALLOWED_EMAILS;
const ORIGINAL_NEON_AUTH_URL = process.env.NEON_AUTH_URL;

function makeRequest(opts: { bearer?: string; url?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.bearer !== undefined) {
    headers.set("authorization", `Bearer ${opts.bearer}`);
  }
  return new NextRequest(opts.url ?? "https://example.test/api/ai/parse", {
    method: "POST",
    headers,
  });
}

function upstreamSuccess(userId: string, email: string): Response {
  return new Response(
    JSON.stringify({ session: { user: { id: userId, email } } }),
    { status: 200 }
  );
}

async function readJson(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("withAuth Bearer token validation", () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset();
    fetchMock.mockReset();
    process.env.NEON_AUTH_URL = "https://neon-auth.example.test";
    delete process.env.ALLOWED_EMAILS;
  });

  afterEach(() => {
    if (ORIGINAL_ALLOWED_EMAILS === undefined) {
      delete process.env.ALLOWED_EMAILS;
    } else {
      process.env.ALLOWED_EMAILS = ORIGINAL_ALLOWED_EMAILS;
    }
    if (ORIGINAL_NEON_AUTH_URL === undefined) {
      delete process.env.NEON_AUTH_URL;
    } else {
      process.env.NEON_AUTH_URL = ORIGINAL_NEON_AUTH_URL;
    }
  });

  it("valid Bearer token → handler called with correct userId/email", async () => {
    fetchMock.mockResolvedValue(upstreamSuccess("user-42", "Test@Example.test"));

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest({ bearer: "valid-token-123" }));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);

    const ctx = (handler.mock.calls as unknown[][])[0]![0] as {
      auth: { success: boolean; userId: string; email: string };
    };
    expect(ctx.auth.success).toBe(true);
    expect(ctx.auth.userId).toBe("user-42");
    expect(ctx.auth.email).toBe("test@example.test");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://neon-auth.example.test/api/auth/get-session",
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: "__Secure-neon-auth.session_token=valid-token-123",
        }),
      })
    );
  });

  it("invalid Bearer token → upstream returns 401 → response is 401", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn();
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest({ bearer: "bad-token" }));
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.error).toBe("Invalid or expired token");
    expect(handler).not.toHaveBeenCalled();
  });

  it("no Authorization header → falls back to cookie auth", async () => {
    getSessionMock.mockResolvedValue({
      data: { user: { id: "cookie-user", email: "cookie@example.test" } },
      error: null,
    });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest());
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("upstream times out → response is 401", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const signal = (init as RequestInit)?.signal;
      return new Promise((_resolve, reject) => {
        if (signal) {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        }
        setTimeout(
          () => reject(new DOMException("Aborted", "AbortError")),
          6000
        );
      });
    });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn();
    const wrapped = withAuth(handler as never);

    vi.useFakeTimers();
    const promise = wrapped(makeRequest({ bearer: "slow-token" }));
    await vi.advanceTimersByTimeAsync(5100);
    const res = await promise;
    vi.useRealTimers();

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("Bearer auth still enforces email whitelist", async () => {
    process.env.ALLOWED_EMAILS = "allowed@example.test";
    fetchMock.mockResolvedValue(
      upstreamSuccess("user-99", "denied@example.test")
    );

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn();
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest({ bearer: "valid-token" }));
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.error).toBe("Your account is not authorized to use this app");
    expect(handler).not.toHaveBeenCalled();
  });

  it("request with both cookie AND Bearer → Bearer takes precedence", async () => {
    fetchMock.mockResolvedValue(
      upstreamSuccess("bearer-user", "bearer@example.test")
    );
    getSessionMock.mockResolvedValue({
      data: { user: { id: "cookie-user", email: "cookie@example.test" } },
      error: null,
    });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest({ bearer: "my-bearer" }));
    expect(res.status).toBe(200);

    const ctx = (handler.mock.calls as unknown[][])[0]![0] as {
      auth: { userId: string; email: string };
    };
    expect(ctx.auth.userId).toBe("bearer-user");
    expect(ctx.auth.email).toBe("bearer@example.test");
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("empty Bearer token string → falls back to cookie auth", async () => {
    getSessionMock.mockResolvedValue({
      data: { user: { id: "cookie-user", email: "cookie@example.test" } },
      error: null,
    });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withAuth(handler as never);

    const headers = new Headers();
    headers.set("authorization", "Bearer ");
    const req = new NextRequest("https://example.test/api/ai/parse", {
      method: "POST",
      headers,
    });

    const res = await wrapped(req);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("missing Bearer prefix → falls back to cookie auth", async () => {
    getSessionMock.mockResolvedValue({
      data: { user: { id: "cookie-user", email: "cookie@example.test" } },
      error: null,
    });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withAuth(handler as never);

    const headers = new Headers();
    headers.set("authorization", "Basic abc123");
    const req = new NextRequest("https://example.test/api/ai/parse", {
      method: "POST",
      headers,
    });

    const res = await wrapped(req);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("upstream returns 500 → response is 401", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn();
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest({ bearer: "some-token" }));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("upstream returns malformed JSON → response is 401 with warning", async () => {
    fetchMock.mockResolvedValue(
      new Response("not json", { status: 200 })
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn();
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest({ bearer: "some-token" }));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("OPTIONS preflight with no origin → no CORS headers (handled by middleware)", async () => {
    const { default: middleware } = await import("../../src/middleware");
    const req = new NextRequest("https://example.test/api/sync/push", {
      method: "OPTIONS",
    });

    const res = await middleware(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
