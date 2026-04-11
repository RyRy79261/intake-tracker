import { logAudit } from "./audit";

export interface ParsedIntake {
  water: number | null; // ml
  salt: number | null; // mg
  measurementType?: "sodium" | "salt"; // whether salt field is sodium (Na) or salt (NaCl)
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

export async function parseIntakeWithAI(
  input: string,
  options?: {
    authToken?: string; // Privy access token (legacy)
    authHeaders?: Record<string, string>; // Auth headers from useAuth().getAuthHeader()
  }
): Promise<ParsedIntake> {
  logAudit("ai_parse_request");

  try {
    // Build headers with auth token
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add auth headers (prefer authHeaders over legacy authToken)
    if (options?.authHeaders) {
      Object.assign(headers, options.authHeaders);
    } else if (options?.authToken) {
      headers["Authorization"] = `Bearer ${options.authToken}`;
    }

    // Use server-side route (API key in env only)
    const response = await fetch("/api/ai/parse", {
      method: "POST",
      headers,
      body: JSON.stringify({ input }),
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
      measurementType: result.measurement_type,
      reasoning: result.reasoning,
    };
  } catch (error) {
    logAudit("ai_parse_error", error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
