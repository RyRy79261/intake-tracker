import { NextResponse } from "next/server";

/**
 * Public endpoint to check AI service configuration status. Reports only
 * whether the server has fallback env-var keys configured — never anything
 * about a specific user's stored keys (those go through /api/user/api-keys
 * which is auth-gated).
 */
export async function GET() {
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    config: {
      authConfigured: !!process.env.DATABASE_URL,
      serverAnthropicKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
      serverGroqKeyConfigured: !!process.env.GROQ_API_KEY,
    },
    environment: process.env.NODE_ENV,
  });
}
