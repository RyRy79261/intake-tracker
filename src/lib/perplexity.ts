import { logAudit } from "./audit";

export interface ParsedIntake {
  water: number | null; // ml
  salt: number | null; // mg
  reasoning?: string;
}

/**
 * PRIVACY & SECURITY:
 * - Uses Privy authentication to verify user identity
 * - Server verifies user is on whitelist before processing
 * - API key stored in server environment only
 * - PII patterns are stripped before AI processing
 * - All requests are audit logged
 */

export async function parseIntakeWithPerplexity(
  input: string,
  options?: {
    clientApiKey?: string;
    authToken?: string; // Privy access token
  }
): Promise<ParsedIntake> {
  logAudit("ai_parse_request");

  try {
    // Build headers with optional auth token
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Add Privy auth token if available
    if (options?.authToken) {
      headers["Authorization"] = `Bearer ${options.authToken}`;
    }

    // Use server-side route (API key in env, more secure)
    const response = await fetch("/api/ai/parse", {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        input,
        // Fallback: client's own API key (if not using Privy auth)
        clientApiKey: options?.clientApiKey,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed: ${response.status}`);
    }

    const result = await response.json();
    
    logAudit("ai_parse_success");
    
    return {
      water: result.water,
      salt: result.salt,
      reasoning: result.reasoning,
    };
  } catch (error) {
    logAudit("ai_parse_error", error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
