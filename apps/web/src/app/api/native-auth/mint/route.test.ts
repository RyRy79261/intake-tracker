import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));
vi.mock("@/lib/auth-middleware", () => ({
  validateBearerToken: vi.fn(),
}));
vi.mock("@/lib/native-auth-bridge", () => ({
  mintNativeAuthCode: vi.fn(),
}));

import { POST } from "@/app/api/native-auth/mint/route";
import { validateBearerToken } from "@/lib/auth-middleware";
import { mintNativeAuthCode } from "@/lib/native-auth-bridge";

const mockValidate = vi.mocked(validateBearerToken);
const mockMint = vi.mocked(mintNativeAuthCode);

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
});
