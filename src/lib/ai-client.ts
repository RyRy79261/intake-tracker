import { logAudit } from "./audit";

export interface ParsedIntake {
  water: number | null; // ml
  valueMg: number | null; // mg of sodium OR salt — measurementType says which
  measurementType: "sodium" | "salt";
  reasoning?: string;
}

/**
 * PRIVACY & SECURITY:
 * - Uses Neon Auth cookie session (attached automatically by the browser on
 *   same-origin fetch) to verify user identity server-side via withAuth().
 * - Server verifies user is on the whitelist before processing.
 * - API key stored in server environment only
 * - PII patterns are stripped before AI processing
 * - All requests are audit logged
 */

export async function parseIntakeWithAI(input: string): Promise<ParsedIntake> {
  logAudit("ai_parse_request");

  try {
    // Use server-side route (API key in env only). Auth travels as a same-origin
    // cookie set by Neon Auth — no manual Authorization header.
    const response = await fetch("/api/ai/parse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
      valueMg: result.value_mg,
      measurementType: result.measurement_type,
      reasoning: result.reasoning,
    };
  } catch (error) {
    logAudit("ai_parse_error", error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
