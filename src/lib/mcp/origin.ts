/**
 * Resolve the public origin of this app for use in OAuth metadata,
 * redirect URIs, etc.
 *
 * Priority (request headers MUST win over VERCEL_URL — see below):
 *   1. MCP_PUBLIC_URL (explicit override for prod / staging)
 *   2. Request `x-forwarded-host` + `x-forwarded-proto` (what the user
 *      actually hit, including custom domains)
 *   3. Request `host` header (less reliable, but still real)
 *   4. VERCEL_URL (deployment-hash fallback; useful only when no
 *      request is available, e.g. background jobs)
 *   5. localhost (dev fallback)
 *
 * Why VERCEL_URL is NOT preferred: Vercel auto-sets it to the
 * deployment-hash URL (e.g. intake-tracker-ooptvrqpl-…vercel.app),
 * which is gated by Vercel SSO on production deployments. Using it as
 * the OAuth issuer means claude.ai's connector tries to redirect users
 * there and hits a 403. The custom domain (delivered via forwarded
 * headers) is the URL the user actually configured, and is the right
 * issuer for every OAuth document.
 */
import type { NextRequest } from "next/server";

function tryParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function getPublicOrigin(req?: NextRequest | Request): string {
  const override = process.env.MCP_PUBLIC_URL?.trim();
  if (override) return override.replace(/\/$/, "");

  if (req) {
    const headers = "headers" in req ? req.headers : null;
    if (headers) {
      const fwdHost = headers.get("x-forwarded-host");
      const fwdProto = headers.get("x-forwarded-proto");
      // Derive the scheme from the request itself as the last-resort
      // proto fallback — better than hard-coding "http" behind a proxy
      // that terminates TLS upstream but strips x-forwarded-proto.
      const requestProto = (() => {
        const url =
          "nextUrl" in req
            ? (req as NextRequest).nextUrl
            : tryParseUrl(req.url);
        return url?.protocol.replace(/:$/, "");
      })();

      if (fwdHost) {
        const proto = fwdProto ?? requestProto ?? "https";
        return `${proto}://${fwdHost}`;
      }
      const host = headers.get("host");
      if (host) {
        const proto = fwdProto ?? requestProto ?? "http";
        return `${proto}://${host}`;
      }
    }
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;

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
