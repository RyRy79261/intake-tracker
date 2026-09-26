import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));
vi.mock("@/lib/auth-middleware", () => ({
  validateBearerToken: vi.fn(),
  ensureUserSynced: vi.fn(async () => undefined),
  AuthUpstreamError: class AuthUpstreamError extends Error {},
}));
vi.mock("@/lib/native-auth-bridge", () => ({
  mintNativeAuthCode: vi.fn(),
}));

import { POST } from "@/app/api/native-auth/mint/route";
import {
  validateBearerToken,
  ensureUserSynced,
  AuthUpstreamError,
} from "@/lib/auth-middleware";
import { mintNativeAuthCode } from "@/lib/native-auth-bridge";

const mockValidate = vi.mocked(validateBearerToken);
const mockMint = vi.mocked(mintNativeAuthCode);
const mockEnsureUser = vi.mocked(ensureUserSynced);

beforeEach(() => {
  vi.clearAllMocks();
  mockCookieGet.mockReturnValue(undefined);
});

describe("POST /api/native-auth/mint", () => {
  it("401 no_session when the session cookie is absent", async () => {
    mockCookieGet.mockReturnValue(undefined);
    const res = await POST();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("no_session");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mockValidate).not.toHaveBeenCalled();
    expect(mockMint).not.toHaveBeenCalled();
  });

  it("401 no_session when the cookie is present but the session is invalid", async () => {
    mockCookieGet.mockReturnValue({ value: "stale-token" });
    mockValidate.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("no_session");
    expect(mockMint).not.toHaveBeenCalled();
  });

  it("200 mints a code bound to the session for a valid cookie", async () => {
    mockCookieGet.mockReturnValue({ value: "sess-token" });
    mockValidate.mockResolvedValue({ userId: "user-1", email: "a@b.c" });
    mockMint.mockResolvedValue("minted-code");
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).code).toBe("minted-code");
    expect(mockMint).toHaveBeenCalledWith({ sessionToken: "sess-token", userId: "user-1" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Pragma")).toBe("no-cache");
  });

  it("upserts users_sync before minting (first-ever sign-in is via the bridge)", async () => {
    // audit mcp-server-auth#14: native_auth_codes.user_id FKs users_sync.
    mockCookieGet.mockReturnValue({ value: "sess-token" });
    mockValidate.mockResolvedValue({ userId: "user-1", email: "A@B.c" });
    const order: string[] = [];
    mockEnsureUser.mockImplementation(async () => {
      order.push("ensure");
    });
    mockMint.mockImplementation(async () => {
      order.push("mint");
      return "minted-code";
    });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockEnsureUser).toHaveBeenCalledWith("user-1", "a@b.c");
    expect(order).toEqual(["ensure", "mint"]);
  });

  it("500 JSON (not an unhandled throw) when the insert fails", async () => {
    mockCookieGet.mockReturnValue({ value: "sess-token" });
    mockValidate.mockResolvedValue({ userId: "user-1", email: "a@b.c" });
    mockMint.mockRejectedValue(new Error("fk violation"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("mint_failed");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    errSpy.mockRestore();
  });

  it("503 JSON when Neon Auth cannot validate the session", async () => {
    mockCookieGet.mockReturnValue({ value: "sess-token" });
    mockValidate.mockRejectedValue(new AuthUpstreamError("down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("auth_unavailable");
    expect(mockMint).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
