import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";

/**
 * Server-side API route for Perplexity AI parsing.
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

    // Get server API key
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "AI service not configured on server" },
        { status: 503 }
      );
    }

    return await processWithKey(input, apiKey);
  } catch (error) {
    console.error("AI parse error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to process request: ${errorMessage}` },
      { status: 500 }
    );
  }
});

async function callPerplexity(sanitizedInput: string, apiKey: string) {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Parse the following food/drink description and estimate water and salt content:\n\n"${sanitizedInput}"`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Perplexity API error [${response.status}]:`, errorText);

    // Parse error details if possible
    let errorDetail = "AI service unavailable";
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        errorDetail = `Perplexity API: ${errorJson.error.message}`;
      } else if (errorJson.detail) {
        errorDetail = `Perplexity API: ${errorJson.detail}`;
      }
    } catch {
      // Use status-based messages if we can't parse the error
      if (response.status === 401) {
        errorDetail = "Invalid API key";
      } else if (response.status === 429) {
        errorDetail = "Perplexity rate limit exceeded";
      } else if (response.status === 400) {
        errorDetail = "Invalid request to Perplexity API";
      }
    }

    return { ok: false as const, error: errorDetail, status: response.status };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return { ok: false as const, error: "No response from AI service", status: 502 };
  }

  return { ok: true as const, content };
}

function parseAndValidateAIResponse(content: string): z.infer<typeof AIParseResponseSchema> | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const rawParsed = JSON.parse(jsonMatch[0]);

    // Coerce numbers (AI sometimes returns strings)
    const toValidate = {
      water: typeof rawParsed.water === "number" ? rawParsed.water : (typeof rawParsed.water === "string" ? parseFloat(rawParsed.water) : null),
      salt: typeof rawParsed.salt === "number" ? rawParsed.salt : (typeof rawParsed.salt === "string" ? parseFloat(rawParsed.salt) : null),
      ...(typeof rawParsed.reasoning === "string" && { reasoning: rawParsed.reasoning.slice(0, 500) }),
    };

    const validated = AIParseResponseSchema.safeParse(toValidate);
    if (!validated.success) {
      console.error("[VALIDATION] AI response validation failed:", JSON.stringify(validated.error.flatten()));
      return null;
    }

    return validated.data;
  } catch {
    return null;
  }
}

async function processWithKey(input: string, apiKey: string) {
  // Validate API key format
  if (!apiKey || !apiKey.startsWith("pplx-")) {
    return NextResponse.json(
      { error: "Invalid API key format. Perplexity keys start with 'pplx-'" },
      { status: 400 }
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

  // First attempt
  const result1 = await callPerplexity(sanitizedInput, apiKey);
  if (!result1.ok) {
    return NextResponse.json(
      { error: result1.error },
      { status: 502 }
    );
  }

  const validated1 = parseAndValidateAIResponse(result1.content);
  if (validated1) {
    return NextResponse.json({
      water: validated1.water,
      salt: validated1.salt,
      ...(validated1.reasoning !== undefined && { reasoning: validated1.reasoning }),
    });
  }

  // Retry once on AI response validation failure
  console.log("[RETRY] AI response validation failed, retrying once...");
  const result2 = await callPerplexity(sanitizedInput, apiKey);
  if (!result2.ok) {
    return NextResponse.json(
      { error: result2.error },
      { status: 502 }
    );
  }

  const validated2 = parseAndValidateAIResponse(result2.content);
  if (validated2) {
    return NextResponse.json({
      water: validated2.water,
      salt: validated2.salt,
      ...(validated2.reasoning !== undefined && { reasoning: validated2.reasoning }),
    });
  }

  // Second failure — fallback to manual entry
  return NextResponse.json(
    { error: "AI response format invalid", fallbackToManual: true },
    { status: 422 }
  );
}
