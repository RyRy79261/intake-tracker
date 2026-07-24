/**
 * Tests for the rewritten withAuth HOF.
 *
 * Mocks @/lib/neon-auth so the underlying @neondatabase/auth/next/server
 * module never tries to resolve `next/headers` at the Node test runtime.
 * Every test stubs `auth.getSession()` per case to cover:
 *   1. No session → 401 { requiresAuth: true }
 *   2. Session present but email not in ALLOWED_EMAILS → 403
 *      { accountUnapproved: true }
 *   3. Session present and email in ALLOWED_EMAILS → handler runs with ctx
 *   4. Empty ALLOWED_EMAILS → any authenticated email passes
 *
 * Also covers the root `middleware.ts` export shape (matcher config + default
 * export is a function) so route protection is guaranteed to be wired.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

type GetSessionResult = {
  data: { user: { id: string; email: string } } | null;
  error: null;
};

const getSessionMock = vi.fn(
  async (): Promise<GetSessionResult> => ({ data: null, error: null })
);

// Trackable Neon Auth middleware so the root-middleware delegation test
// below can assert that requests for /auth (and /auth/*) actually invoke
// it — not just that the path is on the matcher list.
const neonAuthMiddlewareFn = vi.fn(
  async (_req: NextRequest) => new Response(null, { status: 204 })
);

vi.mock("@/lib/neon-auth", () => ({
  auth: {
    getSession: () => getSessionMock(),
    handler: () => ({
      GET: async () => new Response(null, { status: 204 }),
      POST: async () => new Response(null, { status: 204 }),
    }),
    middleware: (_config?: { loginUrl?: string }) => neonAuthMiddlewareFn,
  },
}));

// withAuth upserts the user into neon_auth.users_sync; stub the DB so the
// test runtime doesn't need a real Neon connection.
vi.mock("@intake/db/client", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: async () => undefined,
      }),
    }),
  },
}));

const ORIGINAL_ALLOWED_EMAILS = process.env.ALLOWED_EMAILS;

function makeRequest(url = "https://example.test/api/ai/parse"): NextRequest {
  return new NextRequest(url, { method: "POST" });
}

async function readJson(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("withAuth HOF (Neon Auth cookie sessions)", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_ALLOWED_EMAILS === undefined) {
      delete process.env.ALLOWED_EMAILS;
    } else {
      process.env.ALLOWED_EMAILS = ORIGINAL_ALLOWED_EMAILS;
    }
  });

  it("returns 401 with requiresAuth=true when no active session", async () => {
    delete process.env.ALLOWED_EMAILS;
    getSessionMock.mockResolvedValue({ data: null, error: null });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn();
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest());
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body).toEqual({ error: "No active session", requiresAuth: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated email is not in ALLOWED_EMAILS", async () => {
    process.env.ALLOWED_EMAILS = "owner@example.test";
    getSessionMock.mockResolvedValue({
      data: { user: { id: "user-123", email: "outsider@example.test" } },
      error: null,
    });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn();
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest());
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("Your account is not authorized to use this app");
    expect(body.accountUnapproved).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler with { request, auth } when session + whitelist pass", async () => {
    process.env.ALLOWED_EMAILS = "owner@example.test";
    getSessionMock.mockResolvedValue({
      data: { user: { id: "user-789", email: "Owner@Example.Test" } },
      error: null,
    });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const wrapped = withAuth(handler as never);

    const req = makeRequest();
    const res = await wrapped(req);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const calls = (handler as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    const ctx = calls[0]![0] as {
      request: NextRequest;
      auth: { success: boolean; userId: string; email: string };
    };
    expect(ctx.request).toBe(req);
    expect(ctx.auth).toEqual({
      success: true,
      userId: "user-789",
      email: "owner@example.test",
    });
  });

  it("allows any authenticated email when ALLOWED_EMAILS is empty", async () => {
    delete process.env.ALLOWED_EMAILS;
    getSessionMock.mockResolvedValue({
      data: { user: { id: "user-xyz", email: "anyone@example.test" } },
      error: null,
    });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn(async () => new Response("ok", { status: 200 }));
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest());
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("root middleware.ts", () => {
  it("exports a default middleware function and a matcher config", async () => {
    const mod = await import("@/middleware");
    expect(typeof mod.default).toBe("function");
    expect(mod.config).toBeDefined();
    expect(Array.isArray(mod.config.matcher)).toBe(true);
    const matcher = mod.config.matcher as string[];
    // /api/:path* drives the capacitor CORS branch; /auth and /auth/* are
    // routed through Neon Auth's middleware so the OAuth verifier-exchange
    // step runs on the OAuth return trip (without it the session cookie
    // never materialises and the MCP custom-connector flow stalls after
    // Google sign-in). /native-auth/* is the native Google sign-in callback,
    // kept OUTSIDE /auth/* because the loginUrl("/auth") early-allow in
    // @neondatabase/auth skips the verifier exchange for loginUrl-prefixed
    // paths.
    expect(matcher.length).toBe(4);
    expect(matcher).toEqual(
      expect.arrayContaining([
        "/api/:path*",
        "/auth",
        "/auth/:path*",
        "/native-auth/:path*",
      ]),
    );
  });

  it("delegates /auth requests to the Neon Auth middleware", async () => {
    neonAuthMiddlewareFn.mockClear();
    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest("https://example.test/auth?callbackURL=/foo");
    await middleware(req);
    expect(neonAuthMiddlewareFn).toHaveBeenCalledTimes(1);
    expect(neonAuthMiddlewareFn).toHaveBeenCalledWith(req);
  });

  it("delegates /auth/* subroutes to the Neon Auth middleware", async () => {
    neonAuthMiddlewareFn.mockClear();
    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest("https://example.test/auth/sign-up");
    await middleware(req);
    expect(neonAuthMiddlewareFn).toHaveBeenCalledTimes(1);
  });

  it("does NOT delegate /api/* requests to the Neon Auth middleware", async () => {
    neonAuthMiddlewareFn.mockClear();
    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest("https://example.test/api/mcp/oauth/register");
    await middleware(req);
    expect(neonAuthMiddlewareFn).not.toHaveBeenCalled();
  });

  it("delegates the native bridge OAuth return (verifier present) to the Neon Auth middleware", async () => {
    neonAuthMiddlewareFn.mockClear();
    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest(
      "https://example.test/native-auth/bridge?neon_auth_session_verifier=tok",
    );
    await middleware(req);
    expect(neonAuthMiddlewareFn).toHaveBeenCalledTimes(1);
    expect(neonAuthMiddlewareFn).toHaveBeenCalledWith(req);
  });

  it("does NOT delegate verifier-less /native-auth/* loads (post-exchange redirect stays on the static page)", async () => {
    neonAuthMiddlewareFn.mockClear();
    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest("https://example.test/native-auth/bridge");
    await middleware(req);
    expect(neonAuthMiddlewareFn).not.toHaveBeenCalled();
  });
});
