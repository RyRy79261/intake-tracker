/**
 * MCP endpoint — Streamable HTTP transport.
 *
 * Reached at `/api/mcp/mcp` and `/api/mcp/sse` (the latter disabled). The
 * `[transport]` dynamic segment is required by `mcp-handler` — it derives
 * the transport name from the path.
 *
 * Auth: every request is wrapped by `withMcpAuth`, which expects an
 * `Authorization: Bearer <token>` header. The token is looked up in
 * `mcp_access_tokens` (hashed). On failure, the response carries a
 * `WWW-Authenticate: Bearer resource_metadata=...` header so MCP clients
 * (claude.ai) can discover our OAuth metadata and prompt the user to
 * reconnect.
 *
 * Whitelist enforcement: even after a valid bearer, we re-check
 * ALLOWED_EMAILS on every request. A user removed from the whitelist
 * loses access immediately (no need to wait for token expiry).
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import { usersSync } from "@/db/schema";
import { lookupAccessToken } from "@/lib/mcp/oauth";
import { registerReadOnlyTools } from "@/lib/mcp/tools";
import { isEmailAllowed } from "@/lib/mcp/whitelist";
import { withCors } from "@/lib/mcp/cors";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const baseHandler = createMcpHandler(
  (server) => {
    registerReadOnlyTools(server);
  },
  {
    serverInfo: { name: "intake-tracker", version: "1.0.0" },
  },
  {
    basePath: "/api/mcp",
    disableSse: true,
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const lookup = await lookupAccessToken(bearerToken);
  if (!lookup) return undefined;

  return {
    token: bearerToken,
    clientId: lookup.clientId,
    scopes: lookup.scope.split(/\s+/).filter(Boolean),
    expiresAt: Math.floor(lookup.expiresAt / 1000),
    extra: {
      userId: lookup.userId,
      clientId: lookup.clientId,
    },
  };
}

const authedHandler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

/**
 * Re-check ALLOWED_EMAILS on every request so removing a user from the
 * whitelist revokes access without waiting for token expiry.
 *
 * This runs OUTSIDE withMcpAuth because mcp-handler's verifyToken hook
 * only has two return shapes (AuthInfo | undefined) and collapses every
 * "undefined" into a 401. Whitelist denial is conceptually a 403
 * (authentication succeeded, authorization failed) — so we pre-flight
 * the bearer here and return an explicit 403 when the token is valid
 * but the user isn't allowed.
 */
async function checkWhitelist(
  request: Request,
): Promise<NextResponse | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const lookup = await lookupAccessToken(token);
  if (!lookup) return null; // let withMcpAuth render the 401

  const userRows = await db
    .select({ email: usersSync.email })
    .from(usersSync)
    .where(eq(usersSync.id, lookup.userId))
    .limit(1);
  const email = userRows[0]?.email ?? null;
  if (isEmailAllowed(email)) return null;

  return withCors(
    NextResponse.json(
      {
        error: "forbidden",
        error_description:
          "Your account is no longer on the access list for this connector.",
      },
      { status: 403 },
    ),
  );
}

async function handle(request: Request) {
  const denied = await checkWhitelist(request);
  if (denied) return denied;

  const res = await authedHandler(request);
  // Layer CORS on top so claude.ai (which calls from another origin) gets the
  // headers it needs.
  const next = new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  });
  return withCors(next);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
