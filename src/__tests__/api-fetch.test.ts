import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = process.env.NEXT_PUBLIC_API_BASE_URL;

function loadModule() {
  return import("../lib/api-fetch");
}

describe("api-fetch", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    vi.resetModules();
    mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", mockFetch);

    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalEnv;
    vi.unstubAllGlobals();
  });

  describe("web mode (no NEXT_PUBLIC_API_BASE_URL)", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    });

    it("calls fetch with relative path and no Authorization header", async () => {
      const { apiFetch } = await loadModule();
      await apiFetch("/api/foo");

      expect(mockFetch).toHaveBeenCalledWith("/api/foo", undefined);
    });

    it("isCapacitorMode returns false", async () => {
      const { isCapacitorMode } = await loadModule();
      expect(isCapacitorMode()).toBe(false);
    });
  });

  describe("Capacitor mode (NEXT_PUBLIC_API_BASE_URL set)", () => {
    const BASE = "https://intake-tracker.ryanjnoble.dev";

    beforeEach(() => {
      process.env.NEXT_PUBLIC_API_BASE_URL = BASE;
    });

    it("prepends base URL and adds Bearer token", async () => {
      mockStorage["capacitor_auth_token"] = "test-session-token";
      const { apiFetch } = await loadModule();
      await apiFetch("/api/foo");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${BASE}/api/foo`);
      const headers = init!.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer test-session-token");
    });

    it("omits Authorization header when no token stored", async () => {
      const { apiFetch } = await loadModule();
      await apiFetch("/api/foo");

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(`${BASE}/api/foo`);
      const headers = init!.headers as Headers;
      expect(headers.has("Authorization")).toBe(false);
    });

    it("preserves existing headers alongside Authorization", async () => {
      mockStorage["capacitor_auth_token"] = "tok";
      const { apiFetch } = await loadModule();
      await apiFetch("/api/foo", {
        headers: { "Content-Type": "application/json", "X-Custom": "val" },
      });

      const headers = mockFetch.mock.calls[0]![1]!.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer tok");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(headers.get("X-Custom")).toBe("val");
    });

    it("does not overwrite existing Authorization header", async () => {
      mockStorage["capacitor_auth_token"] = "stored-tok";
      const { apiFetch } = await loadModule();
      await apiFetch("/api/foo", {
        headers: { Authorization: "Bearer explicit-tok" },
      });

      const headers = mockFetch.mock.calls[0]![1]!.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer explicit-tok");
    });

    it("isCapacitorMode returns true", async () => {
      const { isCapacitorMode } = await loadModule();
      expect(isCapacitorMode()).toBe(true);
    });
  });

  describe("token storage round-trip", () => {
    it("saveAuthToken / getAuthToken / clearAuthToken", async () => {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
      const { saveAuthToken, getAuthToken, clearAuthToken } =
        await loadModule();

      expect(getAuthToken()).toBeNull();

      saveAuthToken("my-token");
      expect(getAuthToken()).toBe("my-token");
      expect(mockStorage["capacitor_auth_token"]).toBe("my-token");

      clearAuthToken();
      expect(getAuthToken()).toBeNull();
      expect(mockStorage["capacitor_auth_token"]).toBeUndefined();
    });
  });
});
