import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/privy-server", () => ({
  verifyAndCheckWhitelist: vi.fn(),
}));

import { GET } from "@/app/api/ai/access/route";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";

const mockVerify = vi.mocked(verifyAndCheckWhitelist);

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("Authorization", authHeader);
  return new NextRequest("http://localhost/api/ai/access", { headers });
}

describe("GET /api/ai/access", () => {
  beforeEach(() => {
    mockVerify.mockReset();
  });

  it("no Authorization header → 200 with signedIn:false (verifier never called)", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ signedIn: false, approved: false });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("Authorization header without Bearer prefix → 200 with signedIn:false", async () => {
    const res = await GET(makeRequest("Token xyz"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ signedIn: false, approved: false });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("invalid token: verifier returns invalid-token → 200 signedIn:false (NOT 401)", async () => {
    // The endpoint must always return 200 with a structured body — the
    // whole point of /access is to let the client distinguish denial
    // from token failure without entering the 401 re-auth path.
    mockVerify.mockResolvedValue({
      success: false,
      reason: "invalid-token",
      error: "Invalid or expired auth token",
    });

    const res = await GET(makeRequest("Bearer obviously-fake"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signedIn).toBe(false);
    expect(body.approved).toBe(false);
    expect(mockVerify).toHaveBeenCalledWith("obviously-fake");
  });

  it("valid token but not whitelisted → 200 signedIn:true, approved:false, reason set", async () => {
    mockVerify.mockResolvedValue({
      success: false,
      reason: "not-whitelisted",
      error: "Your account is not authorized to use this app",
    });

    const res = await GET(makeRequest("Bearer valid-but-denied"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      signedIn: true,
      approved: false,
      reason: "Your account is not authorized to use this app",
    });
  });

  it("valid token, on the allow-list → 200 signedIn:true, approved:true, email surfaced", async () => {
    mockVerify.mockResolvedValue({
      success: true,
      userId: "u_1",
      email: "alice@example.com",
    });

    const res = await GET(makeRequest("Bearer good"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      signedIn: true,
      approved: true,
      email: "alice@example.com",
    });
  });
});
