/**
 * auth-client signOut (audit native-android#8): on native there is no session
 * cookie, so the server session behind the stored Bearer token is only revoked
 * if the sign-out request carries that token.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const neonSignOut = vi.fn(async (..._args: unknown[]) => ({ data: null, error: null }));
vi.mock("@neondatabase/auth", () => ({
  createAuthClient: () => ({
    signIn: { email: vi.fn(), social: vi.fn() },
    signOut: (...args: unknown[]) => neonSignOut(...args),
    signUp: {},
    useSession: vi.fn(),
    getSession: vi.fn(),
  }),
}));
vi.mock("@neondatabase/auth/react/adapters", () => ({
  BetterAuthReactAdapter: () => ({}),
}));

let storedToken: string | null = null;
const clearAuthToken = vi.fn(() => {
  storedToken = null;
});
vi.mock("@/lib/api-fetch", () => ({
  saveAuthToken: vi.fn(),
  getAuthToken: () => storedToken,
  clearAuthToken: () => clearAuthToken(),
  isCapacitorMode: () => storedToken !== null,
}));

import { signOut } from "@/lib/auth-client";

beforeEach(() => {
  neonSignOut.mockClear();
  clearAuthToken.mockClear();
  storedToken = null;
});

describe("auth-client signOut", () => {
  it("sends the stored Bearer token so the server session is revoked", async () => {
    storedToken = "native-token";
    await signOut();

    expect(neonSignOut).toHaveBeenCalledTimes(1);
    const opts = neonSignOut.mock.calls[0]![0] as {
      fetchOptions?: { headers?: Record<string, string> };
    };
    expect(opts.fetchOptions?.headers?.Authorization).toBe("Bearer native-token");
    expect(clearAuthToken).toHaveBeenCalledTimes(1);
  });

  it("keeps caller fetchOptions alongside the Bearer header", async () => {
    storedToken = "native-token";
    const onSuccess = vi.fn();
    await signOut({ fetchOptions: { onSuccess } } as never);

    const opts = neonSignOut.mock.calls[0]![0] as {
      fetchOptions?: { headers?: Record<string, string>; onSuccess?: unknown };
    };
    expect(opts.fetchOptions?.onSuccess).toBe(onSuccess);
    expect(opts.fetchOptions?.headers?.Authorization).toBe("Bearer native-token");
  });

  it("passes the call through unchanged on the web (cookie session)", async () => {
    await signOut();
    expect(neonSignOut).toHaveBeenCalledWith();
    expect(clearAuthToken).toHaveBeenCalledTimes(1);
  });
});
