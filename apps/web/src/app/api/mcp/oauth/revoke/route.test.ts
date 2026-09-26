/**
 * POST /api/mcp/oauth/revoke — RFC 7009 token revocation.
 *
 * The oauth primitives are mocked; their Postgres behaviour is covered in
 * mcp-oauth-integration.test.ts. This pins the endpoint contract: client
 * authentication, the 200-for-unknown-token rule, and no caching.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const revokeToken = vi.fn();
const verifyClientCredentials = vi.fn();
vi.mock("@/lib/mcp/oauth", () => ({
  revokeToken: (...a: unknown[]) => revokeToken(...a),
  verifyClientCredentials: (...a: unknown[]) => verifyClientCredentials(...a),
}));

let POST: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  revokeToken.mockReset().mockResolvedValue(1);
  verifyClientCredentials.mockReset().mockResolvedValue({ valid: true });
  POST = (await import("@/app/api/mcp/oauth/revoke/route")).POST;
});

function form(body: Record<string, string>, headers: Record<string, string> = {}) {
  return new NextRequest("https://app.test/api/mcp/oauth/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body).toString(),
  });
}

describe("POST /api/mcp/oauth/revoke", () => {
  it("revokes the presented token for the authenticated client", async () => {
    const res = await POST(form({ token: "mcp_at_x", client_id: "c1" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(verifyClientCredentials).toHaveBeenCalledWith("c1", undefined);
    expect(revokeToken).toHaveBeenCalledWith("mcp_at_x", "c1");
  });

  it("answers 200 for a token it doesn't know (RFC 7009 §2.2)", async () => {
    revokeToken.mockResolvedValue(0);

    const res = await POST(form({ token: "unknown", client_id: "c1" }));

    expect(res.status).toBe(200);
  });

  it("accepts client credentials from a Basic header", async () => {
    const basic = Buffer.from("c1:secret").toString("base64");

    await POST(form({ token: "t" }, { authorization: `Basic ${basic}` }));

    expect(verifyClientCredentials).toHaveBeenCalledWith("c1", "secret");
    expect(revokeToken).toHaveBeenCalledWith("t", "c1");
  });

  it("rejects a failed client authentication without revoking", async () => {
    verifyClientCredentials.mockResolvedValue({ valid: false });

    const res = await POST(form({ token: "t", client_id: "c1" }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_client");
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it("rejects a request with no token", async () => {
    const res = await POST(form({ client_id: "c1" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });
});
