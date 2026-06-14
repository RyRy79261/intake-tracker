/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata.
 *
 * Reached via the rewrite in next.config.js from
 * `/.well-known/oauth-authorization-server`.
 */
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
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
      issuer: urls.issuer,
      authorization_endpoint: urls.authorizationEndpoint,
      token_endpoint: urls.tokenEndpoint,
      registration_endpoint: urls.registrationEndpoint,
      scopes_supported: [...SUPPORTED_SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_basic",
        "client_secret_post",
      ],
      code_challenge_methods_supported: ["S256"],
      // Point at the in-repo design doc on GitHub — the markdown isn't
      // served from the app, so this must be an externally reachable URL
      // rather than `${origin}/docs/mcp-connector.md` (which 404s).
      service_documentation:
        "https://github.com/RyRy79261/intake-tracker/blob/main/docs/mcp-connector.md",
    }),
  );
}
