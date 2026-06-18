import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/native-auth-bridge", () => ({
  claimNativeAuthCode: vi.fn(),
}));

import { POST } from "@/app/api/native-auth/claim/route";
import { claimNativeAuthCode } from "@/lib/native-auth-bridge";

const mockClaim = vi.mocked(claimNativeAuthCode);

function req(body: string) {
  return new NextRequest("https://intake-tracker.ryanjnoble.dev/api/native-auth/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/native-auth/claim", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 on non-JSON body", async () => {
    const res = await POST(req("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("400 when code is missing", async () => {
    const res = await POST(req(JSON.stringify({})));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("400 invalid_grant for an unknown/expired/used code", async () => {
    mockClaim.mockResolvedValue(null);
    const res = await POST(req(JSON.stringify({ code: "nope" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
    expect(mockClaim).toHaveBeenCalledWith("nope");
  });

  it("200 returns the session token for a valid code, no-store", async () => {
    mockClaim.mockResolvedValue("sess-token-xyz");
    const res = await POST(req(JSON.stringify({ code: "good-code" })));
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBe("sess-token-xyz");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
