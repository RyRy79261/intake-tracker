import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAndCheckWhitelist, isPrivyConfigured } from "@/lib/privy-server";

/**
 * Server-side API route for substance (caffeine/alcohol) AI enrichment via Perplexity.
 *
 * SECURITY:
 * - Privy authentication with whitelist enforcement
 * - API key stored in server environment only
 * - Rate limiting applied per IP
 * - Input validation and PII stripping
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

// --- System Prompts ---

const CAFFEINE_SYSTEM_PROMPT = `You are a nutritional analysis assistant specializing in caffeine content estimation.
Given a description of a caffeinated beverage or food, estimate the caffeine content.
Respond with valid JSON only, no additional text.

Example response:
{"caffeineMg": 95, "volumeMl": 250, "reasoning": "A standard cup of drip coffee (250ml) contains approximately 95mg of caffeine"}`;

const ALCOHOL_SYSTEM_PROMPT = `You are a nutritional analysis assistant specializing in alcohol content estimation.
Given a description of an alcoholic beverage, estimate the number of standard drinks and volume.
A standard drink contains approximately 14g (0.6 oz) of pure alcohol.
Respond with valid JSON only, no additional text.

Example response:
{"standardDrinks": 1, "volumeMl": 330, "reasoning": "A standard 330ml beer at 5% ABV contains approximately 1 standard drink"}`;

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

// Sanitize input - strip PII patterns
function sanitizeInput(input: string): string {
  return input
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email]")
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, "[ssn]")
    .trim()
    .slice(0, 500);
}

export async function POST(request: NextRequest) {
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

    const authHeader = request.headers.get("authorization");
    const authToken = authHeader?.replace("Bearer ", "") || null;

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

    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (isPrivyConfigured()) {
      const authResult = await verifyAndCheckWhitelist(authToken);

      if (!authResult.success) {
        return NextResponse.json(
          { error: authResult.error || "Unauthorized", requiresAuth: true },
          { status: 401 }
        );
      }

      console.log(`[AUDIT] Substance enrich request from user: ${authResult.userId}`);

      if (apiKey) {
        return await processEnrichment(description, type, apiKey);
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "AI not configured. Server API key required for substance enrichment." },
        { status: 503 }
      );
    }

    return await processEnrichment(description, type, apiKey);
  } catch (error) {
    console.error("Substance enrich error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to process request: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function callPerplexity(sanitizedInput: string, type: 'caffeine' | 'alcohol', apiKey: string) {
  const systemPrompt = type === "caffeine" ? CAFFEINE_SYSTEM_PROMPT : ALCOHOL_SYSTEM_PROMPT;
  const userPrompt = type === "caffeine"
    ? `Estimate caffeine content in mg for: "${sanitizedInput}". Return JSON: { caffeineMg: number, volumeMl: number, reasoning: string }`
    : `Estimate standard drinks and volume for: "${sanitizedInput}". Return JSON: { standardDrinks: number, volumeMl: number, reasoning: string }`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Perplexity API error [${response.status}]:`, errorText);
    return { ok: false as const, error: "AI service unavailable", status: response.status };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return { ok: false as const, error: "No response from AI service", status: 502 };
  }

  return { ok: true as const, content };
}

function parseAndValidateResponse(content: string, type: 'caffeine' | 'alcohol') {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const raw = JSON.parse(jsonMatch[0]);
    const schema = type === "caffeine" ? CaffeineResponseSchema : AlcoholResponseSchema;
    const validated = schema.safeParse(raw);

    if (!validated.success) {
      console.error("[VALIDATION] AI enrichment response validation failed:", JSON.stringify(validated.error.flatten()));
      return null;
    }

    return validated.data;
  } catch {
    return null;
  }
}

async function processEnrichment(description: string, type: 'caffeine' | 'alcohol', apiKey: string) {
  if (!apiKey.startsWith("pplx-")) {
    return NextResponse.json(
      { error: "Invalid API key format" },
      { status: 400 }
    );
  }

  const sanitized = sanitizeInput(description);
  if (!sanitized) {
    return NextResponse.json(
      { error: "Invalid input after sanitization" },
      { status: 400 }
    );
  }

  console.log(`[AUDIT] Substance enrich request at ${new Date().toISOString()}`);

  // First attempt
  const result1 = await callPerplexity(sanitized, type, apiKey);
  if (!result1.ok) {
    return NextResponse.json({ error: result1.error }, { status: 502 });
  }

  const validated1 = parseAndValidateResponse(result1.content, type);
  if (validated1) {
    return NextResponse.json(validated1);
  }

  // Retry once on validation failure
  console.log("[RETRY] Substance enrich response validation failed, retrying once...");
  const result2 = await callPerplexity(sanitized, type, apiKey);
  if (!result2.ok) {
    return NextResponse.json({ error: result2.error }, { status: 502 });
  }

  const validated2 = parseAndValidateResponse(result2.content, type);
  if (validated2) {
    return NextResponse.json(validated2);
  }

  return NextResponse.json(
    { error: "AI response format invalid", fallbackToManual: true },
    { status: 422 }
  );
}
