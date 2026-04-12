import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS } from "../_shared/claude-client";

/**
 * Server-side API route for substance (caffeine/alcohol) AI enrichment via Anthropic Claude.
 *
 * SECURITY:
 * - Centralized auth middleware (withAuth) handles Neon Auth cookie verification + whitelist
 * - API key stored in server environment only
 * - Rate limiting applied per IP
 * - Input validation and PII stripping via sanitizeForAI
 */

// --- Zod Schemas ---

const SubstanceEnrichRequestSchema = z.object({
  description: z.string().min(1, "Description is required").max(500, "Description too long"),
  type: z.enum(["caffeine", "alcohol"]),
});

const CaffeineResponseSchema = z.object({
  caffeineMg: z.number().min(0).max(2000),
  volumeMl: z.number().min(0).max(5000),
  reasoning: z.string().max(500).optional(),
});

const AlcoholResponseSchema = z.object({
  standardDrinks: z.number().min(0).max(20),
  volumeMl: z.number().min(0).max(5000),
  reasoning: z.string().max(500).optional(),
});

// --- Tool Definitions ---

const CAFFEINE_ENRICH_TOOL = {
  name: "caffeine_enrichment" as const,
  description: "Return caffeine content estimate for a beverage",
  input_schema: {
    type: "object" as const,
    properties: {
      caffeineMg: { type: "number", description: "Estimated caffeine in mg" },
      volumeMl: { type: "number", description: "Estimated volume in ml" },
      reasoning: { type: "string", description: "Brief explanation" },
    },
    required: ["caffeineMg", "volumeMl", "reasoning"],
    additionalProperties: false,
  },
};

const ALCOHOL_ENRICH_TOOL = {
  name: "alcohol_enrichment" as const,
  description: "Return alcohol content estimate for a beverage",
  input_schema: {
    type: "object" as const,
    properties: {
      standardDrinks: { type: "number", description: "Estimated standard drinks" },
      volumeMl: { type: "number", description: "Estimated volume in ml" },
      reasoning: { type: "string", description: "Brief explanation" },
    },
    required: ["standardDrinks", "volumeMl", "reasoning"],
    additionalProperties: false,
  },
};

// --- System Prompts ---

const CAFFEINE_SYSTEM_PROMPT = `You are a nutritional analysis assistant specializing in caffeine content estimation.
Given a description of a caffeinated beverage or food, estimate the caffeine content.
Respond using the caffeine_enrichment tool with caffeineMg, volumeMl, and reasoning.`;

const ALCOHOL_SYSTEM_PROMPT = `You are a nutritional analysis assistant specializing in alcohol content estimation.
Given a description of an alcoholic beverage, estimate the number of standard drinks and volume.
A standard drink contains approximately 14g (0.6 oz) of pure alcohol.
Respond using the alcohol_enrichment tool with standardDrinks, volumeMl, and reasoning.`;

// Simple in-memory rate limiting (per IP, resets on server restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30; // requests per window
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
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ||
               request.headers.get("x-real-ip") ||
               "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

    const parsed = SubstanceEnrichRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[VALIDATION] Substance enrich request validation failed:", JSON.stringify(parsed.error.flatten()));
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { description, type } = parsed.data;

    console.log(`[AUDIT] Substance enrich request from user: ${auth.userId}`);

    let client;
    try {
      client = getClaudeClient();
    } catch {
      return NextResponse.json(
        { error: "AI service not configured on server" },
        { status: 503 }
      );
    }

    const sanitized = sanitizeForAI(description);
    if (!sanitized) {
      return NextResponse.json(
        { error: "Invalid input after sanitization" },
        { status: 400 }
      );
    }

    console.log(`[AUDIT] Substance enrich request at ${new Date().toISOString()}`);

    const systemPrompt = type === "caffeine" ? CAFFEINE_SYSTEM_PROMPT : ALCOHOL_SYSTEM_PROMPT;
    const tool = type === "caffeine" ? CAFFEINE_ENRICH_TOOL : ALCOHOL_ENRICH_TOOL;
    const schema = type === "caffeine" ? CaffeineResponseSchema : AlcoholResponseSchema;

    const userPrompt = type === "caffeine"
      ? `Estimate caffeine content in mg for: "${sanitized}". Return caffeineMg, volumeMl, and reasoning.`
      : `Estimate standard drinks and volume for: "${sanitized}". Return standardDrinks, volumeMl, and reasoning.`;

    const response = await client.messages.create({
      model: CLAUDE_MODELS.fast,
      max_tokens: 512,
      system: systemPrompt,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    const validated = schema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error("[VALIDATION] AI enrichment response validation failed:", JSON.stringify(validated.error.flatten()));
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("Substance enrich error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 502 }
    );
  }
});
