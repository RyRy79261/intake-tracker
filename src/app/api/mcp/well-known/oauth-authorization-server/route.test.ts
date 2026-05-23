import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /.well-known/oauth-authorization-server", () => {
  it("returns RFC 8414 metadata with the expected endpoints", async () => {
    const req = new NextRequest(
      "https://app.test/.well-known/oauth-authorization-server",
    );
    const res = GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issuer).toMatch(/^https?:\/\//);
    expect(body.authorization_endpoint).toContain("/api/mcp/oauth/authorize");
    expect(body.token_endpoint).toContain("/api/mcp/oauth/token");
    expect(body.registration_endpoint).toContain("/api/mcp/oauth/register");
    expect(body.response_types_supported).toContain("code");
    expect(body.grant_types_supported).toEqual(
      expect.arrayContaining(["authorization_code", "refresh_token"]),
    );
    expect(body.code_challenge_methods_supported).toContain("S256");
    expect(body.scopes_supported).toContain("intake-tracker:read");
  });

  it("returns CORS headers so claude.ai can fetch cross-origin", async () => {
    const req = new NextRequest(
      "https://app.test/.well-known/oauth-authorization-server",
    );
    const res = GET(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
