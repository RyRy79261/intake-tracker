import { NextResponse } from "next/server";

/**
 * Public endpoint to check AI service configuration status.
 * Returns only boolean config flags — no sensitive data (key length, format, etc.).
 *
 * As of phase 41 (Neon Auth replacement), Privy is removed entirely. Auth is
 * now enforced server-side via withAuth() reading the Neon Auth cookie session.
 */
export async function GET() {
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    config: {
      authConfigured: !!process.env.DATABASE_URL,
      serverApiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    },
    environment: process.env.NODE_ENV,
  });
}
