import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "../_shared/claude-client";

/**
 * Server-side API route for AI parsing via Anthropic Claude.
 *
 * SECURITY:
 * - Centralized auth middleware (withAuth) handles Neon Auth cookie verification + whitelist
 * - API key stored in server environment only (never sent to client)
 * - Rate limiting applied per IP
 * - Input validation and PII stripping via sanitizeForAI
 * - Audit logging
 */

// --- Zod Schemas (co-located per user decision) ---

const ParseRequestSchema = z.object({
  input: z.string().min(1, "Input is required").max(500, "Input too long"),
});

const AIParseResponseSchema = z.object({
  water: z.number().min(0).max(10000).nullable(),
  value_mg: z.number().min(0).max(50000).nullable(),
  measurement_type: z.enum(["sodium", "salt"]),
  reasoning: z.string().max(500).optional(),
});

// --- System Prompt ---

const SYSTEM_PROMPT = `You are a nutrition parsing assistant. Given a food or drink description, estimate its water content and its sodium/salt content.

You must return two numeric fields and one unit flag:
- water: estimated water content in milliliters (ml)
- value_mg: the numeric content in milligrams, EITHER of sodium (Na) OR of salt (NaCl) — pick one
- measurement_type: "sodium" if value_mg is sodium (Na) mass, "salt" if value_mg is salt (NaCl) mass

CRITICAL: sodium and salt are NOT the same. Salt (NaCl) is ~2.5× heavier than the sodium it contains. Never conflate them. If a nutrition label gives sodium, return that number with measurement_type="sodium". If it gives salt, return that with measurement_type="salt". Do not silently convert — the app does the conversion client-side.

When to use web_search: if the item is a specific brand/product (e.g. "Mio Mio Mate Original", "Coca-Cola 330ml", "McDonald's Big Mac") where the actual label value matters, call web_search to look it up. For generic items ("glass of water", "pinch of salt") you can estimate directly.

Guidelines for water content:
- Plain water, tea, coffee (no additions): 100% of stated volume
- Milk: ~87% · Juice: ~85-90% · Soft drinks: ~90%
- Fresh produce: watermelon ~92%, cucumber ~96%, apple ~86%

Guidelines for sodium content (when estimating, not looking up):
- Fresh produce: 1-10 mg sodium per 100 g
- A "pinch of salt": ~100-150 mg sodium (~300-400 mg salt)
- Restaurant meals: typically 800-2000 mg sodium
- Chips/snacks: 150-200 mg sodium per serving

Example response for "a glass of water":
{"water": 250, "value_mg": 5, "measurement_type": "sodium", "reasoning": "250 ml of tap water, ~5 mg sodium"}

Example for "1 tsp of table salt":
{"water": 0, "value_mg": 5700, "measurement_type": "salt", "reasoning": "1 tsp = ~5.7 g of salt (NaCl), contains ~2250 mg sodium"}`;

// --- Tool Definition ---

const PARSE_RESULT_TOOL = {
  name: "parse_result" as const,
  description: "Return parsed water and sodium/salt content from a food/drink description",
  input_schema: {
    type: "object" as const,
    properties: {
      water: { type: ["number", "null"], description: "Water content in ml, null if cannot estimate" },
      value_mg: { type: ["number", "null"], description: "Sodium OR salt content in mg, null if cannot estimate. The measurement_type field says which." },
      measurement_type: { type: "string", enum: ["sodium", "salt"], description: "'sodium' if value_mg is sodium (Na) mass; 'salt' if value_mg is salt (NaCl) mass. Do not silently convert between them — salt ≈ 2.5× sodium by mass." },
      reasoning: { type: "string", description: "Brief explanation of the estimate and which unit was used" },
    },
    required: ["water", "value_mg", "measurement_type", "reasoning"],
    additionalProperties: false,
  },
};

// Simple in-memory rate limiting (per IP, resets on server restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 20; // requests per window
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export const POST = withAuth(async ({ request, auth }) => {
  try {
    // Get client IP for rate limiting
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ||
               request.headers.get("x-real-ip") ||
               "unknown";

    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Validate request body with Zod
    const parsed = ParseRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[VALIDATION] Parse request validation failed:", JSON.stringify(parsed.error.flatten()));
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { input } = parsed.data;

    // User is authenticated and on whitelist (handled by withAuth)
    console.log(`[AUDIT] AI request from user: ${auth.userId} (${auth.email ?? "unknown"})`);

    let client;
    try {
      client = getClaudeClient();
    } catch {
      return NextResponse.json(
        { error: "AI service not configured on server" },
        { status: 503 }
      );
    }

    const sanitizedInput = sanitizeForAI(input);

    if (!sanitizedInput) {
      return NextResponse.json(
        { error: "Invalid input after sanitization" },
        { status: 400 }
      );
    }

    // Log for audit (in production, send to proper logging service)
    console.log(`[AUDIT] AI parse request at ${new Date().toISOString()}`);

    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL, PARSE_RESULT_TOOL],
      tool_choice: { type: "tool", name: "parse_result" },
      messages: [{ role: "user", content: `Parse the following food/drink description and estimate water and sodium/salt content:\n\n"${sanitizedInput}"` }],
    });

    const toolBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "tool_use" }> =>
        b.type === "tool_use" && b.name === "parse_result"
    );
    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    const validated = AIParseResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error("[VALIDATION] AI response validation failed:", JSON.stringify(validated.error.flatten()));
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    return NextResponse.json({
      water: validated.data.water,
      value_mg: validated.data.value_mg,
      measurement_type: validated.data.measurement_type,
      ...(validated.data.reasoning !== undefined && { reasoning: validated.data.reasoning }),
    });
  } catch (error) {
    console.error("AI parse error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 502 }
    );
  }
});
