import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const middlewareMock = vi.fn(async () => new Response(null, { status: 204 }));

vi.mock("@/lib/neon-auth", () => ({
  auth: {
    getSession: vi.fn(async () => ({ data: null, error: null })),
    handler: () => ({
      GET: async () => new Response(null, { status: 204 }),
      POST: async () => new Response(null, { status: 204 }),
    }),
    middleware: () => middlewareMock,
  },
}));

function makeApiRequest(
  path: string,
  opts: { method?: string; origin?: string } = {}
): NextRequest {
  const { method = "GET", origin } = opts;
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new NextRequest(`https://example.test${path}`, { method, headers });
}

describe("CORS middleware for /api/* routes", () => {
  it("returns 204 for OPTIONS preflight with allowed origin", async () => {
    const { default: middleware } = await import("../../src/middleware");
    const req = makeApiRequest("/api/sync/push", {
      method: "OPTIONS",
      origin: "https://localhost",
    });

    const res = await middleware(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://localhost"
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization"
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
  });

  it("adds CORS headers to GET request with allowed origin", async () => {
    const { default: middleware } = await import("../../src/middleware");
    const req = makeApiRequest("/api/sync/status", {
      origin: "http://localhost",
    });

    const res = await middleware(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost"
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("supports capacitor://localhost origin", async () => {
    const { default: middleware } = await import("../../src/middleware");
    const req = makeApiRequest("/api/ai/parse", {
      method: "POST",
      origin: "capacitor://localhost",
    });

    const res = await middleware(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "capacitor://localhost"
    );
  });

  it("omits CORS headers for disallowed origin", async () => {
    const { default: middleware } = await import("../../src/middleware");
    const req = makeApiRequest("/api/sync/push", {
      origin: "https://evil.test",
    });

    const res = await middleware(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("omits CORS headers for same-origin (no origin header)", async () => {
    const { default: middleware } = await import("../../src/middleware");
    const req = makeApiRequest("/api/sync/push");

    const res = await middleware(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("delegates non-API paths to auth handler", async () => {
    middlewareMock.mockClear();
    const { default: middleware } = await import("../../src/middleware");
    const req = new NextRequest("https://example.test/medications", {
      method: "GET",
    });

    await middleware(req);
    expect(middlewareMock).toHaveBeenCalledWith(req);
  });

  it("matcher config includes /api/:path* and page pattern", async () => {
    const { config } = await import("../../src/middleware");
    expect(config.matcher).toContain("/api/:path*");
    expect(config.matcher.length).toBe(2);
  });
});
