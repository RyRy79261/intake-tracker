import { NextResponse } from "next/server";
import { isPrivyConfigured } from "@/lib/privy-server";

/**
 * Debug endpoint to check AI service configuration status.
 * Returns configuration state without exposing sensitive data.
 */
export async function GET() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  const privyConfigured = isPrivyConfigured();
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    config: {
      privyConfigured,
      serverApiKeyConfigured: !!apiKey,
      serverApiKeyFormat: apiKey ? (apiKey.startsWith("pplx-") ? "valid" : "invalid") : "missing",
      serverApiKeyLength: apiKey?.length || 0,
    },
    environment: process.env.NODE_ENV,
  });
}
