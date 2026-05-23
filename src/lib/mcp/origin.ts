/**
 * Resolve the public origin of this app for use in OAuth metadata,
 * redirect URIs, etc.
 *
 * Priority:
 *   1. MCP_PUBLIC_URL (explicit override for prod / staging)
 *   2. VERCEL_URL (Vercel auto-set, no protocol)
 *   3. Request `x-forwarded-host` + `x-forwarded-proto`
 *   4. Request `host` + `x-forwarded-proto` / req.protocol
 */
import type { NextRequest } from "next/server";

export function getPublicOrigin(req?: NextRequest | Request): string {
  const override = process.env.MCP_PUBLIC_URL?.trim();
  if (override) return override.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;

  if (req) {
    const headers = "headers" in req ? req.headers : null;
    if (headers) {
      const fwdHost = headers.get("x-forwarded-host");
      const fwdProto = headers.get("x-forwarded-proto");
      if (fwdHost) {
        const proto = fwdProto ?? "https";
        return `${proto}://${fwdHost}`;
      }
      const host = headers.get("host");
      if (host) {
        const proto = fwdProto ?? "http";
        return `${proto}://${host}`;
      }
    }
  }

  return "http://localhost:3000";
}

export const MCP_BASE_PATH = "/api/mcp";

export function buildOAuthUrls(origin: string) {
  return {
    issuer: origin,
    authorizationEndpoint: `${origin}${MCP_BASE_PATH}/oauth/authorize`,
    tokenEndpoint: `${origin}${MCP_BASE_PATH}/oauth/token`,
    registrationEndpoint: `${origin}${MCP_BASE_PATH}/oauth/register`,
    resource: `${origin}${MCP_BASE_PATH}`,
    authServerMetadata: `${origin}/.well-known/oauth-authorization-server`,
    resourceMetadata: `${origin}/.well-known/oauth-protected-resource`,
    mcpEndpoint: `${origin}${MCP_BASE_PATH}/mcp`,
  };
}
