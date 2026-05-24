import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/neon-auth";

const ALLOWED_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400",
} as const;

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    ...CORS_HEADERS,
  };
}

/**
 * Neon Auth middleware — REQUIRED for the OAuth verifier exchange.
 *
 * When a user completes social sign-in (Google), Neon Auth's hosted callback
 * redirects back to the app with `?neon_auth_session_verifier=<token>` on
 * the URL. The session cookie is NOT set at this point — the verifier has
 * to be exchanged server-side for the real session cookie on our origin.
 *
 * That exchange (`exchangeOAuthToken` in @neondatabase/auth/next/server)
 * runs inside `auth.middleware()` — it is NOT in `auth.handler()` and
 * cannot be triggered from a route handler. Without this middleware
 * installed, the user lands back on /auth with the verifier in the URL
 * but no session cookie ever materialises and every subsequent request
 * gets a 401. This was the root cause of the MCP connector flow failing
 * to return the user to claude.ai after Google sign-in.
 *
 * The middleware also redirects unauthenticated requests on protected
 * routes to `loginUrl`. We scope it narrowly via the matcher below
 * because most of this app's pages handle auth client-side and our
 * public MCP endpoints (DCR, well-known, token, the MCP endpoint
 * itself) must remain unauthenticated.
 */
const neonAuthMiddleware = auth.middleware({ loginUrl: "/auth" });

export default async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Route the Neon Auth middleware ONLY for paths where the verifier
  // exchange (and matching session-protection) is relevant: the /auth
  // page itself (where social-login returns the user with the verifier
  // appended) and any /auth/* subroute.
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return neonAuthMiddleware(request);
  }

  // Existing capacitor CORS handling for /api/* requests from the
  // Android/iOS shell. No change in behaviour for those paths.
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    const response = NextResponse.next();
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      response.headers.set(key, value);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // /auth + /auth/* added so Neon Auth's verifier-exchange middleware
  // runs on the OAuth return trip. /api/* preserved for the existing
  // capacitor CORS layer.
  matcher: ["/api/:path*", "/auth", "/auth/:path*"],
};
