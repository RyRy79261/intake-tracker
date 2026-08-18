/**
 * Post-sign-in redirect rules.
 *
 * `signInReturnTarget` is the fix for the MCP connector login loop: a
 * social sign-in whose callbackURL was an API route returned the browser
 * to that route with `?neon_auth_session_verifier=` attached, where
 * nothing could exchange it, so no session cookie was ever set and the
 * authorize endpoint bounced the user back to /auth — forever.
 */
import { describe, it, expect } from "vitest";
import {
  NEON_AUTH_VERIFIER_PARAM,
  isApiRoute,
  safeCallbackUrl,
  signInReturnTarget,
} from "@/lib/auth-callback";

describe("safeCallbackUrl", () => {
  it("keeps a same-origin relative path", () => {
    expect(safeCallbackUrl("/history")).toBe("/history");
    expect(safeCallbackUrl("/api/mcp/oauth/authorize?state=x")).toBe(
      "/api/mcp/oauth/authorize?state=x",
    );
  });

  it("falls back to / for missing values", () => {
    expect(safeCallbackUrl(null)).toBe("/");
    expect(safeCallbackUrl(undefined)).toBe("/");
    expect(safeCallbackUrl("")).toBe("/");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeCallbackUrl("https://evil.example/steal")).toBe("/");
    expect(safeCallbackUrl("//evil.example")).toBe("/");
    expect(safeCallbackUrl("javascript:alert(1)")).toBe("/");
  });
});

describe("isApiRoute", () => {
  it("distinguishes API routes from pages", () => {
    expect(isApiRoute("/api/mcp/oauth/authorize")).toBe(true);
    expect(isApiRoute("/history")).toBe(false);
    expect(isApiRoute("/")).toBe(false);
    // No false positive on a page whose path merely starts with "/api".
    expect(isApiRoute("/apiary")).toBe(false);
  });
});

describe("signInReturnTarget", () => {
  const authPage = {
    pathname: "/auth",
    search: "?callbackURL=%2Fapi%2Fmcp%2Foauth%2Fauthorize%3Fstate%3Dxyz",
  };

  it("passes a page destination through untouched", () => {
    expect(signInReturnTarget("/history", authPage)).toBe("/history");
    expect(signInReturnTarget("/", authPage)).toBe("/");
  });

  it("returns the OAuth trip to the current page when the destination is an API route", () => {
    const target = signInReturnTarget(
      "/api/mcp/oauth/authorize?state=xyz",
      authPage,
    );
    expect(target.startsWith("/auth?")).toBe(true);
    // The real destination survives, so the page can forward to it.
    expect(
      new URLSearchParams(target.slice(target.indexOf("?"))).get("callbackURL"),
    ).toBe("/api/mcp/oauth/authorize?state=xyz");
  });

  it("drops a spent verifier from the return target", () => {
    const target = signInReturnTarget("/api/mcp/oauth/authorize?state=xyz", {
      pathname: "/auth",
      search: `?callbackURL=%2Fapi%2Fmcp&${NEON_AUTH_VERIFIER_PARAM}=spent-token`,
    });
    expect(target).not.toContain(NEON_AUTH_VERIFIER_PARAM);
    expect(target).not.toContain("spent-token");
  });

  it("handles a bare current URL with no query string", () => {
    expect(
      signInReturnTarget("/api/mcp/oauth/authorize", {
        pathname: "/auth",
        search: "",
      }),
    ).toBe("/auth");
  });
});
