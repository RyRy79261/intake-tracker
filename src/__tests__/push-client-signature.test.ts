/**
 * Phase 41-03 contract test: push client helpers have zero auth plumbing.
 *
 * Verifies:
 *  - subscribeToPush() can be called with zero arguments
 *  - unsubscribeFromPush() can be called with zero arguments
 *  - usePushScheduleSync() can be called with zero arguments
 *  - /api/push/subscribe fetch has no Authorization header
 *  - /api/push/unsubscribe fetch has no Authorization header
 *  - /api/push/sync-schedule fetch has no Authorization header
 *
 * Test environment is node (per vitest.config.ts), so we do NOT renderHook.
 * Instead we verify `usePushScheduleSync.length === 0` (compile-time signature)
 * and grep the hook source for any residual Authorization plumbing. Runtime
 * fetch behavior is exercised via subscribeToPush / unsubscribeFromPush which
 * need no React rendering.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

const fetchCalls: Array<{ url: string; init: FetchInit }> = [];

const fetchMock = vi.fn(async (url: string, init?: FetchInit) => {
  fetchCalls.push({ url, init: init ?? {} });
  return new Response(null, { status: 204 });
});

vi.stubGlobal("fetch", fetchMock);

// Minimal service worker + PushManager stub so subscribeToPush can reach the
// fetch call without touching real browser APIs.
const fakeSubscription = {
  endpoint: "https://push.example/endpoint/abc",
  toJSON: () => ({
    endpoint: "https://push.example/endpoint/abc",
    keys: { p256dh: "p256dh-value", auth: "auth-value" },
  }),
  unsubscribe: vi.fn(async () => true),
};

const fakeRegistration = {
  pushManager: {
    getSubscription: vi.fn(async () => fakeSubscription),
    subscribe: vi.fn(async () => fakeSubscription),
  },
};

vi.stubGlobal("navigator", {
  serviceWorker: {
    ready: Promise.resolve(fakeRegistration),
  },
});

vi.stubGlobal("window", {
  PushManager: function PushManager() {
    /* noop */
  },
});

// subscribeToPush reads NEXT_PUBLIC_VAPID_PUBLIC_KEY at call time.
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
  "BMqSvZarZuVi1pQmvyA-W8Z7YvTjC3z1JvXrYtNwQpL0R2sD4fG6hK8oP9nT5uV7wX";

describe("push client helpers have zero auth plumbing", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    fetchMock.mockClear();
  });

  afterEach(() => {
    fetchCalls.length = 0;
  });

  it("subscribeToPush() accepts zero arguments at compile time", async () => {
    const { subscribeToPush } = await import(
      "@/lib/push-notification-service"
    );
    // TypeScript signature check: this line only compiles when the function
    // signature has no required parameters.
    const call: () => Promise<PushSubscription | null> = subscribeToPush;
    expect(typeof call).toBe("function");
    expect(subscribeToPush.length).toBe(0);
  });

  it("unsubscribeFromPush() accepts zero arguments at compile time", async () => {
    const { unsubscribeFromPush } = await import(
      "@/lib/push-notification-service"
    );
    const call: () => Promise<boolean> = unsubscribeFromPush;
    expect(typeof call).toBe("function");
    expect(unsubscribeFromPush.length).toBe(0);
  });

  it("usePushScheduleSync() accepts zero arguments at compile time", async () => {
    const { usePushScheduleSync } = await import(
      "@/hooks/use-push-schedule-sync"
    );
    const call: () => void = usePushScheduleSync;
    expect(typeof call).toBe("function");
    expect(usePushScheduleSync.length).toBe(0);
  });

  it("subscribeToPush() fetches /api/push/subscribe with NO Authorization header", async () => {
    const { subscribeToPush } = await import(
      "@/lib/push-notification-service"
    );
    await subscribeToPush();

    const subscribeCall = fetchCalls.find((c) =>
      c.url.includes("/api/push/subscribe")
    );
    expect(subscribeCall).toBeDefined();
    const headers = subscribeCall?.init?.headers ?? {};
    const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain("authorization");
  });

  it("unsubscribeFromPush() fetches /api/push/unsubscribe with NO Authorization header", async () => {
    const { unsubscribeFromPush } = await import(
      "@/lib/push-notification-service"
    );
    await unsubscribeFromPush();

    const unsubscribeCall = fetchCalls.find((c) =>
      c.url.includes("/api/push/unsubscribe")
    );
    expect(unsubscribeCall).toBeDefined();
    const headers = unsubscribeCall?.init?.headers ?? {};
    const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain("authorization");
  });

  it("use-push-schedule-sync.ts source contains no Authorization header plumbing", () => {
    // Runtime hook behavior cannot be exercised in a node environment without
    // jsdom + renderHook, so instead we assert the source file itself has no
    // Authorization plumbing or authToken parameter. Combined with the
    // signature check above and the end-to-end build, this closes the loop.
    //
    // We look specifically for code tokens (header keys, template literals,
    // identifiers) — not prose mentions — so doc comments explaining "no Bearer
    // token plumbing" do not trigger false positives.
    const src = readFileSync(
      resolve(__dirname, "..", "hooks", "use-push-schedule-sync.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/["']Authorization["']/);
    expect(src).not.toMatch(/\bauthToken\b/);
    expect(src).not.toMatch(/\bgetAuthToken\b/);
    expect(src).not.toMatch(/Bearer \$\{/);
  });

  it("push-notification-service.ts source contains no Authorization header plumbing", () => {
    const src = readFileSync(
      resolve(__dirname, "..", "lib", "push-notification-service.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/["']Authorization["']/);
    expect(src).not.toMatch(/Authorization: `/);
    expect(src).not.toMatch(/\bauthToken\b/);
    expect(src).not.toMatch(/Bearer \$\{/);
  });
});
