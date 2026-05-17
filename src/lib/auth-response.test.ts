import { describe, it, expect } from "vitest";
import {
  verificationToErrorResponse,
  verificationToAccessResponse,
} from "@/lib/auth-response";
import type { VerificationResult } from "@/lib/privy-server";

describe("verificationToErrorResponse", () => {
  it("throws if called with a successful result (caller bug)", () => {
    const result: VerificationResult = { success: true, userId: "u_1" };
    expect(() => verificationToErrorResponse(result)).toThrow();
  });

  it("missing token → 401 + requiresAuth", () => {
    const res = verificationToErrorResponse({
      success: false,
      reason: "no-token",
      error: "No auth token provided",
    });
    expect(res.status).toBe(401);
    expect(res.body.requiresAuth).toBe(true);
    expect(res.body.accountUnapproved).toBeUndefined();
    expect(res.body.error).toBe("No auth token provided");
  });

  it("invalid/expired token → 401 + requiresAuth", () => {
    const res = verificationToErrorResponse({
      success: false,
      reason: "invalid-token",
      error: "Invalid or expired auth token",
    });
    expect(res.status).toBe(401);
    expect(res.body.requiresAuth).toBe(true);
    expect(res.body.accountUnapproved).toBeUndefined();
  });

  it("not-whitelisted → 403 + accountUnapproved (NOT requiresAuth)", () => {
    const res = verificationToErrorResponse({
      success: false,
      reason: "not-whitelisted",
      error: "Your account is not authorized to use this app",
    });
    expect(res.status).toBe(403);
    expect(res.body.accountUnapproved).toBe(true);
    expect(res.body.requiresAuth).toBeUndefined();
    expect(res.body.error).toBe("Your account is not authorized to use this app");
  });

  it("not-configured → 401 + requiresAuth (server misconfig surfaces as re-auth)", () => {
    const res = verificationToErrorResponse({
      success: false,
      reason: "not-configured",
      error: "Authentication service not configured",
    });
    expect(res.status).toBe(401);
    expect(res.body.requiresAuth).toBe(true);
  });

  it("falls back to 'Unauthorized' when error message is missing", () => {
    const res = verificationToErrorResponse({
      success: false,
      reason: "invalid-token",
    });
    expect(res.body.error).toBe("Unauthorized");
  });

  it("unknown reason still produces a sane 401 response", () => {
    const res = verificationToErrorResponse({
      success: false,
      error: "Mystery failure",
    });
    expect(res.status).toBe(401);
    expect(res.body.requiresAuth).toBe(true);
  });
});

describe("verificationToAccessResponse", () => {
  it("success → signedIn + approved with email", () => {
    const res = verificationToAccessResponse({
      success: true,
      userId: "u_1",
      email: "alice@example.com",
    });
    expect(res).toEqual({
      signedIn: true,
      approved: true,
      email: "alice@example.com",
    });
  });

  it("success without email → omits the email field", () => {
    const res = verificationToAccessResponse({
      success: true,
      userId: "u_1",
    });
    expect(res).toEqual({ signedIn: true, approved: true });
  });

  it("not-whitelisted → signedIn:true (valid token) + approved:false", () => {
    const res = verificationToAccessResponse({
      success: false,
      reason: "not-whitelisted",
      error: "Your account is not authorized to use this app",
    });
    expect(res.signedIn).toBe(true);
    expect(res.approved).toBe(false);
    expect(res.reason).toBe("Your account is not authorized to use this app");
  });

  it("invalid-token → signedIn:false (token can't be trusted)", () => {
    const res = verificationToAccessResponse({
      success: false,
      reason: "invalid-token",
      error: "Invalid or expired auth token",
    });
    expect(res.signedIn).toBe(false);
    expect(res.approved).toBe(false);
  });

  it("no-token → signedIn:false", () => {
    const res = verificationToAccessResponse({
      success: false,
      reason: "no-token",
      error: "No auth token provided",
    });
    expect(res.signedIn).toBe(false);
    expect(res.approved).toBe(false);
  });

  it("not-configured → signedIn:false", () => {
    const res = verificationToAccessResponse({
      success: false,
      reason: "not-configured",
      error: "Authentication service not configured",
    });
    expect(res.signedIn).toBe(false);
    expect(res.approved).toBe(false);
  });

  it("omits reason when error is empty", () => {
    const res = verificationToAccessResponse({
      success: false,
      reason: "invalid-token",
    });
    expect(res.reason).toBeUndefined();
  });
});
