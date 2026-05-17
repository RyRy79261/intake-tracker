// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockUseAuth = vi.fn();
const mockRequireAuth = vi.fn();
const mockNotifyExpired = vi.fn();

vi.mock("@/components/auth-guard", () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock("@/components/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    requireAuth: mockRequireAuth,
    notifyExpired: mockNotifyExpired,
  }),
}));

import { useAiFetch } from "./use-ai-fetch";

const fetchSpy = vi.fn();

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

function wrapper(client: QueryClient) {
  function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return TestWrapper;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("useAiFetch (integration)", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockRequireAuth.mockReset();
    mockNotifyExpired.mockReset();
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);

    mockUseAuth.mockReturnValue({
      getAuthHeader: async () => ({ Authorization: "Bearer test-token" }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when the user dismisses the sign-in modal", async () => {
    mockRequireAuth.mockResolvedValue(false);

    const { result } = renderHook(() => useAiFetch(), {
      wrapper: wrapper(makeClient()),
    });

    const res = await result.current("/api/ai/parse");
    expect(res).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("attaches the Privy bearer token to outgoing requests", async () => {
    mockRequireAuth.mockResolvedValue(true);
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }, { status: 200 }));

    const { result } = renderHook(() => useAiFetch(), {
      wrapper: wrapper(makeClient()),
    });

    await result.current("/api/ai/parse", { method: "POST", body: "{}" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/ai/parse",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
  });

  it("on 401+requiresAuth: triggers notifyExpired and retries once", async () => {
    mockRequireAuth.mockResolvedValue(true);
    mockNotifyExpired.mockResolvedValue(true);
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({ error: "expired", requiresAuth: true }, { status: 401 })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, { status: 200 }));

    const { result } = renderHook(() => useAiFetch(), {
      wrapper: wrapper(makeClient()),
    });

    const res = await result.current("/api/ai/parse");

    expect(mockNotifyExpired).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res?.status).toBe(200);
  });

  it("on 403+accountUnapproved: invalidates ai-access query, does NOT retry, does NOT logout", async () => {
    mockRequireAuth.mockResolvedValue(true);
    fetchSpy.mockResolvedValue(
      jsonResponse(
        { error: "denied", accountUnapproved: true },
        { status: 403 }
      )
    );
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useAiFetch(), {
      wrapper: wrapper(client),
    });

    const res = await result.current("/api/ai/parse");

    expect(mockNotifyExpired).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no retry
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ai-access"] });
    expect(res?.status).toBe(403);
  });

  it("on 401 WITHOUT requiresAuth flag: passes through without re-auth (no loop)", async () => {
    mockRequireAuth.mockResolvedValue(true);
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: "something else" }, { status: 401 })
    );

    const { result } = renderHook(() => useAiFetch(), {
      wrapper: wrapper(makeClient()),
    });

    const res = await result.current("/api/ai/parse");

    expect(mockNotifyExpired).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res?.status).toBe(401);
  });

  it("on 200: passes through without touching the auth flow", async () => {
    mockRequireAuth.mockResolvedValue(true);
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }, { status: 200 }));

    const { result } = renderHook(() => useAiFetch(), {
      wrapper: wrapper(makeClient()),
    });

    const res = await result.current("/api/ai/parse");

    expect(mockNotifyExpired).not.toHaveBeenCalled();
    expect(res?.status).toBe(200);
  });

  it("if re-auth fails after 401+requiresAuth, returns the original 401", async () => {
    mockRequireAuth.mockResolvedValue(true);
    mockNotifyExpired.mockResolvedValue(false);
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: "expired", requiresAuth: true }, { status: 401 })
    );

    const { result } = renderHook(() => useAiFetch(), {
      wrapper: wrapper(makeClient()),
    });

    const res = await result.current("/api/ai/parse");

    expect(mockNotifyExpired).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no retry after failed re-auth
    expect(res?.status).toBe(401);
  });
});
