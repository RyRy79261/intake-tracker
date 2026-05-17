import { describe, it, expect } from "vitest";
import { interpretAccessResponse } from "@/hooks/use-ai-access";

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

  it("returns denied without reason field when none provided (server-confirmed denial)", () => {
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: { signedIn: true, approved: false },
    });
    expect(result).toEqual({ status: "denied" });
  });

  it("server signedIn:false collapses to signed-out, not denied (don't conflate token failure with whitelist denial)", () => {
    // The client thinks it's authenticated but the server rejected the
    // token. "Contact admin" would be the wrong message — re-auth is.
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: { signedIn: false, approved: false },
    });
    expect(result).toEqual({ status: "signed-out" });
  });

  it("server signedIn:false collapses to signed-out even if approved is somehow true", () => {
    // Defensive: trust signedIn first. Without a valid session we can't
    // claim approval, regardless of what the approved flag says.
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: { signedIn: false, approved: true },
    });
    expect(result).toEqual({ status: "signed-out" });
  });

  it("network/fetch error collapses to signed-out (don't show stale or wrong state)", () => {
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: undefined,
      isError: true,
    });
    expect(result).toEqual({ status: "signed-out" });
  });

  it("error takes precedence over data — surface the failure rather than stale data", () => {
    const result = interpretAccessResponse({
      ready: true,
      authenticated: true,
      data: { signedIn: true, approved: true },
      isError: true,
    });
    expect(result).toEqual({ status: "signed-out" });
  });
});
