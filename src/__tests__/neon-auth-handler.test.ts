/**
 * Tests for the Neon Auth server helper and catch-all route handler.
 *
 * These are smoke tests — no real network calls are made. They validate:
 *   1. `auth` export exposes the required surface (handler/middleware/getSession)
 *   2. The catch-all route exports GET and POST that are functions
 *   3. Importing `src/lib/neon-auth.ts` without NEON_AUTH_BASE_URL is safe
 *      at module load (the module must not throw at import time)
 *
 * We mock `@neondatabase/auth/next/server` at the vitest level so the test
 * environment never has to resolve `next/headers` — that module only exists
 * inside a real Next.js runtime. The mock stubs the same shape createNeonAuth
 * returns in production (handler/middleware/getSession functions) so this file
 * validates the *contract* between our wrapper and the Neon Auth package
 * without booting the whole Better Auth server pipeline.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@neondatabase/auth/next/server", () => {
  return {
    createNeonAuth: () => {
      const noop = async () => new Response(null, { status: 204 });
      return {
        handler: () => ({
          GET: noop,
          POST: noop,
          PUT: noop,
          DELETE: noop,
          PATCH: noop,
        }),
        middleware: () => async () => new Response(null, { status: 204 }),
        getSession: async () => ({ data: null, error: null }),
      };
    },
  };
});

const ORIGINAL_BASE_URL = process.env.NEON_AUTH_BASE_URL;
const ORIGINAL_COOKIE_SECRET = process.env.NEON_AUTH_COOKIE_SECRET;

describe("neon-auth server helper", () => {
  beforeAll(() => {
    // Ensure tests don't fall back to real production env at module init.
    // The helper has a placeholder fallback so module load is always safe.
    delete process.env.NEON_AUTH_BASE_URL;
    delete process.env.NEON_AUTH_COOKIE_SECRET;
  });

  afterAll(() => {
    if (ORIGINAL_BASE_URL !== undefined) {
      process.env.NEON_AUTH_BASE_URL = ORIGINAL_BASE_URL;
    }
    if (ORIGINAL_COOKIE_SECRET !== undefined) {
      process.env.NEON_AUTH_COOKIE_SECRET = ORIGINAL_COOKIE_SECRET;
    }
  });

  it("exposes handler, middleware, and getSession methods", async () => {
    const { auth } = await import("@/lib/neon-auth");
    expect(typeof auth.handler).toBe("function");
    expect(typeof auth.middleware).toBe("function");
    expect(typeof auth.getSession).toBe("function");
  });

  it("module loads cleanly with NEON_AUTH_BASE_URL unset (lazy init)", async () => {
    // The helper uses a placeholder fallback for both NEON_AUTH_BASE_URL and
    // NEON_AUTH_COOKIE_SECRET so `import` never throws. Real failures occur
    // only on first live call (e.g., auth.getSession() against a real request).
    await expect(import("@/lib/neon-auth")).resolves.toBeDefined();
  });
});

describe("neon-auth catch-all route handler", () => {
  it("exports GET and POST as callable functions", async () => {
    const route = await import("@/app/api/auth/[...path]/route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });
});
