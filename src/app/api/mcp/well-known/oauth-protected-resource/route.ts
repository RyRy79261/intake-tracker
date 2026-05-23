/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * Reached via the rewrite in next.config.js from
 * `/.well-known/oauth-protected-resource`. Tells MCP clients (claude.ai)
 * which authorization server to talk to.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildOAuthUrls, getPublicOrigin } from "@/lib/mcp/origin";
import { SUPPORTED_SCOPES } from "@/lib/mcp/scopes";
import { corsPreflight, withCors } from "@/lib/mcp/cors";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export function GET(req: NextRequest) {
  const origin = getPublicOrigin(req);
  const urls = buildOAuthUrls(origin);

  return withCors(
    NextResponse.json({
      resource: urls.resource,
      authorization_servers: [urls.issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: [...SUPPORTED_SCOPES],
      resource_documentation: `${origin}/docs/mcp-connector.md`,
    }),
  );
}
