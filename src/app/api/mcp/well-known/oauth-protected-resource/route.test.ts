import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /.well-known/oauth-protected-resource", () => {
  it("returns RFC 9728 metadata pointing at our AS", async () => {
    const req = new NextRequest(
      "https://app.test/.well-known/oauth-protected-resource",
    );
    const res = GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resource).toContain("/api/mcp");
    expect(Array.isArray(body.authorization_servers)).toBe(true);
    expect(body.authorization_servers[0]).toMatch(/^https?:\/\//);
    expect(body.bearer_methods_supported).toContain("header");
    expect(body.scopes_supported).toContain("intake-tracker:read");
  });
});
