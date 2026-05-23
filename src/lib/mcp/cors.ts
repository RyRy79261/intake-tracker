/**
 * CORS helpers for the MCP endpoints.
 *
 * claude.ai (and similar MCP clients) call these endpoints cross-origin.
 * The OAuth metadata routes, DCR endpoint, and MCP JSON-RPC endpoint all
 * need to allow that. Tokens move via the Authorization header, not
 * cookies, so wildcard origin is safe.
 */
import { NextResponse } from "next/server";

export const MCP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  // DELETE is part of the MCP Streamable HTTP spec for session termination.
  // The [transport] route handler registers DELETE — if it's missing from the
  // preflight allow-list, browsers (claude.ai) block the request before it
  // reaches the server.
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-protocol-version, mcp-session-id",
  // WWW-Authenticate carries the MCP `Bearer resource_metadata=` hint that
  // browser-based MCP clients need to discover the protected-resource
  // metadata URL after a 401. Without exposing it, the fetch() consumer
  // can't read it across origins.
  "Access-Control-Expose-Headers": "WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
} as const;

export function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(MCP_CORS_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

export function corsPreflight(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}
