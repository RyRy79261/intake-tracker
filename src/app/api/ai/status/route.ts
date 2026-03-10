import { NextResponse } from "next/server";
import { isPrivyConfigured } from "@/lib/privy-server";

/**
 * Public endpoint to check AI service configuration status.
 * Returns only boolean config flags — no sensitive data (key length, format, etc.).
 */
export async function GET() {
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    config: {
      privyConfigured: isPrivyConfigured(),
      serverApiKeyConfigured: !!process.env.PERPLEXITY_API_KEY,
    },
    environment: process.env.NODE_ENV,
  });
}
