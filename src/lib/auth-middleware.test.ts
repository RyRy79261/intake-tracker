import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("./privy-server", () => ({
  verifyAndCheckWhitelist: vi.fn(),
}));

import { withAuth } from "./auth-middleware";
import { verifyAndCheckWhitelist } from "./privy-server";

const mockVerify = vi.mocked(verifyAndCheckWhitelist);

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("Authorization", authHeader);
  return new NextRequest("http://localhost/api/test", { headers });
}

describe("withAuth", () => {
  beforeEach(() => {
    mockVerify.mockReset();
  });

  it("extracts Bearer token from Authorization header", async () => {
    mockVerify.mockResolvedValue({ success: true, userId: "u_1" });
    const handler = vi.fn(() => NextResponse.json({ ok: true }));

    await withAuth(handler)(makeRequest("Bearer abc123"));

    expect(mockVerify).toHaveBeenCalledWith("abc123");
  });

  it("passes null token when Authorization header is missing", async () => {
    mockVerify.mockResolvedValue({
      success: false,
      reason: "no-token",
      error: "No auth token provided",
    });

    await withAuth(vi.fn())(makeRequest());

    expect(mockVerify).toHaveBeenCalledWith(null);
  });

  it("passes null token when Authorization header lacks Bearer prefix", async () => {
    mockVerify.mockResolvedValue({
      success: false,
      reason: "no-token",
      error: "No auth token provided",
    });

    await withAuth(vi.fn())(makeRequest("Token abc"));

    expect(mockVerify).toHaveBeenCalledWith(null);
  });

  it("invokes the handler with the verification result on success", async () => {
    const auth = { success: true as const, userId: "u_1", email: "alice@x.com" };
    mockVerify.mockResolvedValue(auth);
    const handler = vi.fn(() => NextResponse.json({ ok: true }));

    const res = await withAuth(handler)(makeRequest("Bearer t"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ auth }));
    expect(res.status).toBe(200);
  });

  it("does NOT invoke the handler when verification fails", async () => {
    mockVerify.mockResolvedValue({
      success: false,
      reason: "invalid-token",
      error: "Invalid or expired auth token",
    });
    const handler = vi.fn();

    await withAuth(handler)(makeRequest("Bearer bad"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 401 + requiresAuth for invalid-token failures", async () => {
    mockVerify.mockResolvedValue({
      success: false,
      reason: "invalid-token",
      error: "Invalid or expired auth token",
    });

    const res = await withAuth(vi.fn())(makeRequest("Bearer bad"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.requiresAuth).toBe(true);
    expect(body.accountUnapproved).toBeUndefined();
    expect(body.error).toBe("Invalid or expired auth token");
  });

  it("returns 401 + requiresAuth for no-token failures", async () => {
    mockVerify.mockResolvedValue({
      success: false,
      reason: "no-token",
      error: "No auth token provided",
    });

    const res = await withAuth(vi.fn())(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.requiresAuth).toBe(true);
  });

  it("returns 403 + accountUnapproved for not-whitelisted (NOT 401)", async () => {
    // This is the bug-fix contract: a whitelisted user being denied must
    // NOT trigger the client's re-auth loop, since re-logging in won't help.
    mockVerify.mockResolvedValue({
      success: false,
      reason: "not-whitelisted",
      error: "Your account is not authorized to use this app",
    });

    const res = await withAuth(vi.fn())(makeRequest("Bearer valid-but-denied"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.accountUnapproved).toBe(true);
    expect(body.requiresAuth).toBeUndefined();
    expect(body.error).toBe("Your account is not authorized to use this app");
  });

  it("returns 401 + requiresAuth for not-configured (server misconfig)", async () => {
    mockVerify.mockResolvedValue({
      success: false,
      reason: "not-configured",
      error: "Authentication service not configured",
    });

    const res = await withAuth(vi.fn())(makeRequest("Bearer t"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.requiresAuth).toBe(true);
  });

  it("does not leak the inner verification result through the response body", async () => {
    mockVerify.mockResolvedValue({
      success: false,
      reason: "invalid-token",
      error: "Invalid or expired auth token",
    });

    const res = await withAuth(vi.fn())(makeRequest("Bearer bad"));
    const body = await res.json();

    // No userId, no email, no wallet, no reason enum
    expect(body.userId).toBeUndefined();
    expect(body.email).toBeUndefined();
    expect(body.reason).toBeUndefined();
  });
});
