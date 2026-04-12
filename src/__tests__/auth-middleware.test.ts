/**
 * Tests for the rewritten withAuth HOF.
 *
 * Mocks @/lib/neon-auth so the underlying @neondatabase/auth/next/server
 * module never tries to resolve `next/headers` at the Node test runtime.
 * Every test stubs `auth.getSession()` per case to cover:
 *   1. No session → 401 { requiresAuth: true }
 *   2. Session present but email not in ALLOWED_EMAILS → 401
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

vi.mock("@/lib/neon-auth", () => ({
  auth: {
    getSession: () => getSessionMock(),
    handler: () => ({
      GET: async () => new Response(null, { status: 204 }),
      POST: async () => new Response(null, { status: 204 }),
    }),
    middleware: (_config?: { loginUrl?: string }) =>
      async (_req: NextRequest) => new Response(null, { status: 204 }),
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

  it("returns 401 when authenticated email is not in ALLOWED_EMAILS", async () => {
    process.env.ALLOWED_EMAILS = "owner@example.test";
    getSessionMock.mockResolvedValue({
      data: { user: { id: "user-123", email: "outsider@example.test" } },
      error: null,
    });

    const { withAuth } = await import("@/lib/auth-middleware");
    const handler = vi.fn();
    const wrapped = withAuth(handler as never);

    const res = await wrapped(makeRequest());
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.error).toBe("Your account is not authorized to use this app");
    expect(body.requiresAuth).toBe(true);
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
    const mod = await import("../../middleware");
    expect(typeof mod.default).toBe("function");
    expect(mod.config).toBeDefined();
    expect(Array.isArray(mod.config.matcher)).toBe(true);
    const matcher = mod.config.matcher as string[];
    // Matcher must leave /api, /auth, /_next, static assets alone.
    // We spot-check the regex-fragment patterns are present.
    expect(matcher.length).toBeGreaterThan(0);
    const first = matcher[0]!;
    expect(first).toContain("api");
    expect(first).toContain("auth");
    expect(first).toContain("_next");
  });
});
