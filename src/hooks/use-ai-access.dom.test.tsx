// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockUseAuth = vi.fn();
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

import { useAiAccess } from "./use-ai-access";

const fetchSpy = vi.fn();

function wrapper(client: QueryClient) {
  function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return TestWrapper;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

describe("useAiAccess (integration)", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns loading while Privy isn't ready", () => {
    mockUseAuth.mockReturnValue({
      ready: false,
      authenticated: false,
      user: { id: "did:privy:test-user" },
      getAuthHeader: async () => ({}),
    });

    const { result } = renderHook(() => useAiAccess(), {
      wrapper: wrapper(makeClient()),
    });

    expect(result.current.status).toBe("loading");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns signed-out when authenticated is false (no network call)", () => {
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: false,
      user: { id: "did:privy:test-user" },
      getAuthHeader: async () => ({}),
    });

    const { result } = renderHook(() => useAiAccess(), {
      wrapper: wrapper(makeClient()),
    });

    expect(result.current.status).toBe("signed-out");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches /api/ai/access with auth header and returns approved", async () => {
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { id: "did:privy:test-user" },
      getAuthHeader: async () => ({ Authorization: "Bearer test-token" }),
    });
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          signedIn: true,
          approved: true,
          email: "alice@example.com",
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useAiAccess(), {
      wrapper: wrapper(makeClient()),
    });

    expect(result.current.status).toBe("loading");

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "approved",
        email: "alice@example.com",
      })
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/ai/access",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      })
    );
  });

  it("returns denied with reason when the user isn't whitelisted", async () => {
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { id: "did:privy:test-user" },
      getAuthHeader: async () => ({}),
    });
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          signedIn: true,
          approved: false,
          reason: "Your account is not authorized to use this app",
        }),
        { status: 200 }
      )
    );

    const { result } = renderHook(() => useAiAccess(), {
      wrapper: wrapper(makeClient()),
    });

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "denied",
        reason: "Your account is not authorized to use this app",
      })
    );
  });

  it("re-queries when the cache is invalidated", async () => {
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { id: "did:privy:test-user" },
      getAuthHeader: async () => ({}),
    });
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ signedIn: true, approved: true }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedIn: true,
            approved: false,
            reason: "revoked",
          }),
          { status: 200 }
        )
      );
    const client = makeClient();

    const { result } = renderHook(() => useAiAccess(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.status).toBe("approved"));

    // Simulate useAiFetch's behavior on a 403 response. The queryKey
    // prefix is what invalidateQueries matches on.
    client.invalidateQueries({ queryKey: ["ai-access"] });

    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("on fetch failure: surfaces signed-out (not denied — don't show 'contact admin' for a network blip)", async () => {
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { id: "did:privy:test-user" },
      getAuthHeader: async () => ({}),
    });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 })
    );

    const { result } = renderHook(() => useAiAccess(), {
      wrapper: wrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
  });

  it("queryKey is scoped per-user, so caches don't leak between accounts", async () => {
    // User A signs in and is approved.
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { id: "did:privy:user-a" },
      getAuthHeader: async () => ({}),
    });
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ signedIn: true, approved: true, email: "a@x.com" }),
        { status: 200 }
      )
    );
    const client = makeClient();
    const { result, rerender } = renderHook(() => useAiAccess(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe("approved"));

    // Now user B logs in on the same device. With a global queryKey, B
    // would briefly see A's approval. With per-user scoping, B gets its
    // own fetch.
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { id: "did:privy:user-b" },
      getAuthHeader: async () => ({}),
    });
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          signedIn: true,
          approved: false,
          reason: "not on the list",
        }),
        { status: 200 }
      )
    );
    rerender();

    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
