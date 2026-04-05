import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS } from "../_shared/claude-client";

/**
 * Server-side API route for AI parsing via Anthropic Claude.
 *
 * SECURITY:
 * - Centralized auth middleware (withAuth) handles Privy verification + whitelist
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
  salt: z.number().min(0).max(50000).nullable(),
  reasoning: z.string().max(500).optional(),
});

// --- System Prompt ---

const SYSTEM_PROMPT = `You are a nutrition parsing assistant. Your job is to analyze food and drink descriptions and estimate their water and sodium (salt) content.

When given a description of food or drink, respond with a JSON object containing:
- water: estimated water content in milliliters (ml)
- salt: estimated sodium content in milligrams (mg)
- reasoning: brief explanation of your estimation

Guidelines for estimation:
- Plain water, tea, coffee (without additions): 100% of stated volume is water
- Milk: ~87% water content
- Juice: ~85-90% water content
- Soft drinks: ~90% water content
- Fresh fruits/vegetables: refer to their typical water content (e.g., watermelon 92%, cucumber 96%, apple 86%)
- Cooked foods: estimate based on typical recipes
- For salt/sodium, use typical nutritional data:
  - Fresh fruits/vegetables: very low sodium (1-10mg per 100g)
  - Processed foods: check typical sodium content
  - A "pinch of salt": ~300-400mg
  - Restaurant meals: typically 1000-2000mg sodium
  - Chips/snacks: ~150-200mg per serving

Always respond with valid JSON only, no additional text.

Example response:
{"water": 250, "salt": 5, "reasoning": "A glass of water (250ml) contains 250ml water and negligible sodium"}`;

// --- Tool Definition ---

const PARSE_RESULT_TOOL = {
  name: "parse_result" as const,
  description: "Return parsed water and salt content from a food/drink description",
  input_schema: {
    type: "object" as const,
    properties: {
      water: { type: ["number", "null"], description: "Water content in ml, null if cannot estimate" },
      salt: { type: ["number", "null"], description: "Sodium content in mg, null if cannot estimate" },
      reasoning: { type: "string", description: "Brief explanation of the estimate" },
    },
    required: ["water", "salt", "reasoning"],
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
    console.log(`[AUDIT] AI request from user: ${auth.userId} (${auth.email || auth.wallet})`);

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
      model: CLAUDE_MODELS.fast,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [PARSE_RESULT_TOOL],
      tool_choice: { type: "tool", name: "parse_result" },
      messages: [{ role: "user", content: `Parse the following food/drink description and estimate water and salt content:\n\n"${sanitizedInput}"` }],
    });

    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
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
      salt: validated.data.salt,
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
