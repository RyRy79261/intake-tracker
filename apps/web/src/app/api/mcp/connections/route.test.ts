/**
 * /api/mcp/connections — the signed-in user's view of their Claude
 * connector grants, and the in-app way to disconnect them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type * as RouteMod from "@/app/api/mcp/connections/route";

vi.mock("@/lib/auth-middleware", () => ({
  withAuth:
    (
      handler: (ctx: {
        request: NextRequest;
        auth: { success: true; userId: string };
      }) => Promise<Response>,
    ) =>
    (request: NextRequest) =>
      handler({ request, auth: { success: true, userId: "user-1" } }),
}));

const listUserConnections = vi.fn();
const revokeUserTokens = vi.fn();
vi.mock("@/lib/mcp/oauth", () => ({
  listUserConnections: (...a: unknown[]) => listUserConnections(...a),
  revokeUserTokens: (...a: unknown[]) => revokeUserTokens(...a),
}));

let route: typeof RouteMod;

beforeEach(async () => {
  listUserConnections.mockReset().mockResolvedValue([]);
  revokeUserTokens.mockReset().mockResolvedValue(2);
  route = await import("@/app/api/mcp/connections/route");
});

function req(url: string, method = "GET") {
  return new NextRequest(`https://app.test${url}`, { method });
}

describe("/api/mcp/connections", () => {
  it("lists the caller's live connections", async () => {
    listUserConnections.mockResolvedValue([
      { clientId: "c1", clientName: "claude.ai", tokenCount: 1, connectedAt: 1, lastUsedAt: 2 },
    ]);

    const res = await route.GET(req("/api/mcp/connections"));

    expect(res.status).toBe(200);
    expect(listUserConnections).toHaveBeenCalledWith("user-1");
    expect((await res.json()).connections).toHaveLength(1);
  });

  it("revokes all of the caller's connections", async () => {
    const res = await route.DELETE(req("/api/mcp/connections", "DELETE"));

    expect(res.status).toBe(200);
    expect(revokeUserTokens).toHaveBeenCalledWith("user-1", undefined);
    expect(await res.json()).toEqual({ revoked: 2 });
  });

  it("revokes one client's connection when clientId is given", async () => {
    await route.DELETE(req("/api/mcp/connections?clientId=c1", "DELETE"));

    expect(revokeUserTokens).toHaveBeenCalledWith("user-1", "c1");
  });
});
