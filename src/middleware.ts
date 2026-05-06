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

const authHandler = auth.middleware({ loginUrl: "/auth" });

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    ...CORS_HEADERS,
  };
}

export default async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
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

  return authHandler(request);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!auth|_next/static|_next/image|favicon\\.ico|manifest\\.json|icons|.*\\..*).*)",
  ],
};
