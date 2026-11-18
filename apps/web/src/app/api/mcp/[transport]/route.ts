/**
 * MCP endpoint — Streamable HTTP transport.
 *
 * Reached at `/api/mcp/mcp`, the URL claude.ai is configured with. mcp-handler
 * 2 serves every request it gets and has no HTTP+SSE transport, so any other
 * `[transport]` value (the old `/api/mcp/sse`) answers 404 here.
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
import type { AuthInfo } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { db } from "@intake/db/client";
import { usersSync } from "@intake/db/schema";
import { lookupAccessToken } from "@/lib/mcp/oauth";
import { registerReadOnlyTools, registerWriteTools } from "@/lib/mcp/tools";
import { isEmailAllowed } from "@/lib/mcp/whitelist";
import { withCors } from "@/lib/mcp/cors";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const baseHandler = createMcpHandler(
  (server) => {
    registerReadOnlyTools(server);
    registerWriteTools(server);
  },
  {
    serverInfo: { name: "intake-tracker", version: "1.0.0" },
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

/**
 * Per-request memo of the bearer-token lookup. The preflight whitelist
 * check below populates this; verifyToken (called by withMcpAuth shortly
 * after) reads from it instead of issuing a second `lookupAccessToken`
 * round-trip. WeakMap so entries vanish with the Request — no manual
 * eviction needed.
 */
const lookupByRequest = new WeakMap<
  Request,
  Awaited<ReturnType<typeof lookupAccessToken>>
>();

async function resolveBearer(request: Request) {
  if (lookupByRequest.has(request)) {
    return lookupByRequest.get(request) ?? null;
  }
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    lookupByRequest.set(request, null);
    return null;
  }
  const token = header.slice(7).trim();
  if (!token) {
    lookupByRequest.set(request, null);
    return null;
  }
  const lookup = await lookupAccessToken(token);
  lookupByRequest.set(request, lookup);
  return lookup;
}

async function verifyToken(
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const lookup = await resolveBearer(req);
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
  const lookup = await resolveBearer(request);
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

type RouteContext = { params: Promise<{ transport: string }> };

async function handle(request: Request, { params }: RouteContext) {
  if ((await params).transport !== "mcp") {
    return withCors(new NextResponse(null, { status: 404 }));
  }

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

/**
 * GET is refused at once, never held open as a stream.
 *
 * In Streamable HTTP a GET opens a standalone server-to-client SSE stream
 * for notifications the server sends unprompted. This server sends none:
 * every answer rides on the POST that asked for it. mcp-handler 1.x answered
 * GET with 405 itself; 2.x hands it to the SDK, which opens the stream and
 * leaves it open. Since the 2.x bump (18 Oct 2026) every connected client
 * held a function idle until `maxDuration` cut it off, reconnected and did
 * it again, around the clock, and each reconnect looked the bearer up in
 * Neon. Fluid compute bills that idle time; with noble-notations doing the
 * same, the Hobby allowance went in a week and the account was paused.
 *
 * The spec makes 405 the answer for a server that offers no GET stream, and
 * clients carry on with POST alone. No auth or whitelist check first: there
 * is nothing here to protect, and skipping them keeps a GET off the database.
 */
async function handleGet(_request: Request, { params }: RouteContext) {
  if ((await params).transport !== "mcp") {
    return withCors(new NextResponse(null, { status: 404 }));
  }
  return withCors(
    new NextResponse(null, {
      status: 405,
      headers: { Allow: "POST, DELETE, OPTIONS" },
    }),
  );
}

export const GET = handleGet;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
