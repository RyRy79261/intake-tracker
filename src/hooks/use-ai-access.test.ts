import { describe, it, expect } from "vitest";
import { interpretAccessResponse } from "./use-ai-access";

describe("interpretAccessResponse", () => {
  it("returns loading while Privy is still hydrating", () => {
    const result = interpretAccessResponse({
      ready: false,
      authenticated: false,
      data: undefined,
    });
    expect(result).toEqual({ status: "loading" });
  });

  it("returns signed-out when ready but not authenticated", () => {
    const result = interpretAccessResponse({
      ready: true,
      authenticated: false,
      data: undefined,
    });
    expect(result).toEqual({ status: "signed-out" });
  });

  it("returns loading when authenticated but probe hasn't returned yet", () => {
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: undefined,
    });
    expect(result).toEqual({ status: "loading" });
  });

  it("returns approved with email when whitelist allows the user", () => {
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: { signedIn: true, approved: true, email: "alice@example.com" },
    });
    expect(result).toEqual({
      status: "approved",
      email: "alice@example.com",
    });
  });

  it("returns approved without email field when none provided", () => {
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: { signedIn: true, approved: true },
    });
    expect(result).toEqual({ status: "approved" });
  });

  it("returns denied with reason when signed in but not whitelisted", () => {
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: {
        signedIn: true,
        approved: false,
        reason: "Your account is not authorized to use this app",
      },
    });
    expect(result).toEqual({
      status: "denied",
      reason: "Your account is not authorized to use this app",
    });
  });

  it("returns denied without reason field when none provided", () => {
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: { signedIn: false, approved: false },
    });
    expect(result).toEqual({ status: "denied" });
  });

  it("client trusts the server's approved flag over its own auth state", () => {
    // Defensive: if the server says approved, that's the source of truth
    // even in odd states. (No real scenario triggers this; just contract.)
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: { signedIn: false, approved: true },
    });
    expect(result.status).toBe("approved");
  });
});
