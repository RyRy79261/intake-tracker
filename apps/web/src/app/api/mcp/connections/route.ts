/**
 * GET    /api/mcp/connections
 *   → { connections: McpConnection[] }  — the signed-in user's live grants
 *
 * DELETE /api/mcp/connections[?clientId=...]
 *   → { revoked: number }  — revokes every grant, or one client's
 *
 * Session-authenticated (not bearer): this is the in-app "disconnect Claude"
 * control. Revoked tokens stop working on the next MCP request — the bearer
 * lookup checks revokedAt — and can't be refreshed.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { listUserConnections, revokeUserTokens } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export const GET = withAuth(async ({ auth }) => {
  const connections = await listUserConnections(auth.userId!);
  return NextResponse.json({ connections });
});

export const DELETE = withAuth(async ({ request, auth }) => {
  const clientId = request.nextUrl.searchParams.get("clientId") || undefined;
  const revoked = await revokeUserTokens(auth.userId!, clientId);
  return NextResponse.json({ revoked });
});
