import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the Neon Auth module to avoid pulling @neondatabase/auth/next/server
// (which imports next/headers and fails to resolve under vitest). The CORS
// branch of the middleware never invokes neonAuthMiddleware, so a no-op
// stub is sufficient for these tests.
vi.mock("@/lib/neon-auth", () => ({
  auth: {
    middleware: () => () => {
      throw new Error("neon auth middleware called unexpectedly");
    },
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
    const { default: middleware } = await import("@/middleware");
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
    const { default: middleware } = await import("@/middleware");
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
    const { default: middleware } = await import("@/middleware");
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
    const { default: middleware } = await import("@/middleware");
    const req = makeApiRequest("/api/sync/push", {
      origin: "https://evil.test",
    });

    const res = await middleware(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("omits CORS headers for same-origin (no origin header)", async () => {
    const { default: middleware } = await import("@/middleware");
    const req = makeApiRequest("/api/sync/push");

    const res = await middleware(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("passes through non-API paths without CORS headers", async () => {
    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest("https://example.test/medications", {
      method: "GET",
    });

    const res = await middleware(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("matcher config includes /api/:path* and the /auth paths used by the verifier exchange", async () => {
    const { config } = await import("@/middleware");
    expect(config.matcher).toEqual(
      expect.arrayContaining(["/api/:path*", "/auth", "/auth/:path*"]),
    );
    // /auth and /auth/* are added so Neon Auth's auth.middleware() can
    // run the OAuth verifier-exchange step on the OAuth return trip.
    // Without them the session cookie is never materialised and the MCP
    // custom-connector flow fails after Google sign-in.
    expect(config.matcher.length).toBe(3);
  });
});
