import { describe, it, expect } from "vitest";
import { isAllowedRedirectUri } from "@/lib/mcp/oauth";

describe("mcp/oauth isAllowedRedirectUri", () => {
  it("allows claude.ai over https", () => {
    expect(
      isAllowedRedirectUri(
        "https://claude.ai/api/organizations/abc/mcp/callback",
      ),
    ).toBe(true);
  });

  it("allows arbitrary subdomains of claude.ai", () => {
    expect(isAllowedRedirectUri("https://api.claude.ai/cb")).toBe(true);
  });

  it("allows anthropic.com", () => {
    expect(isAllowedRedirectUri("https://anthropic.com/cb")).toBe(true);
  });

  it("allows localhost for dev", () => {
    expect(isAllowedRedirectUri("http://localhost:3000/cb")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:5173/cb")).toBe(true);
  });

  it("rejects an arbitrary external domain", () => {
    expect(isAllowedRedirectUri("https://evil.example.com/cb")).toBe(false);
  });

  it("rejects http for non-localhost hosts", () => {
    expect(isAllowedRedirectUri("http://claude.ai.fake.test/cb")).toBe(false);
  });

  it("rejects garbage", () => {
    expect(isAllowedRedirectUri("not a url")).toBe(false);
    expect(isAllowedRedirectUri("ftp://claude.ai/cb")).toBe(false);
  });

  it("does not match domains that merely contain 'claude.ai'", () => {
    expect(isAllowedRedirectUri("https://claude.ai.evil.example/cb")).toBe(
      false,
    );
  });
});
