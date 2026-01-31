import { NextRequest, NextResponse } from "next/server";
import { verifyAndCheckWhitelist, isPrivyConfigured } from "@/lib/privy-server";

/**
 * Server-side API route for Perplexity AI parsing.
 * 
 * SECURITY:
 * - Privy authentication with whitelist enforcement
 * - API key stored in server environment only (never sent to client)
 * - Rate limiting applied per IP
 * - Input validation and PII stripping
 * - Audit logging
 */

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

// Sanitize input - strip PII patterns
function sanitizeInput(input: string): string {
  return input
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email]")
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, "[ssn]")
    .trim()
    .slice(0, 500);
}

// Validate numeric output
function sanitizeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || isNaN(value) || !isFinite(value)) {
    return null;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

export async function POST(request: NextRequest) {
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

    // Get the Authorization header (Bearer token from Privy)
    const authHeader = request.headers.get("authorization");
    const authToken = authHeader?.replace("Bearer ", "") || null;

    const body = await request.json();
    const { input, clientApiKey } = body;

    // Get server API key
    const apiKey = process.env.PERPLEXITY_API_KEY;
    
    // Check if Privy is configured for authentication
    if (isPrivyConfigured()) {
      // Verify Privy token and check whitelist
      const authResult = await verifyAndCheckWhitelist(authToken);
      
      if (!authResult.success) {
        return NextResponse.json(
          { 
            error: authResult.error || "Unauthorized", 
            requiresAuth: true 
          },
          { status: 401 }
        );
      }
      
      // User is authenticated and on whitelist
      console.log(`[AUDIT] AI request from user: ${authResult.userId} (${authResult.email || authResult.wallet})`);
      
      // Use server API key for authenticated users
      if (apiKey) {
        return await processWithKey(input, apiKey);
      }
    }
    
    // Fallback: No Privy configured, or no server API key
    // Allow client to use their own API key
    if (!clientApiKey) {
      return NextResponse.json(
        { 
          error: "AI not configured. Sign in or add your own API key in settings.", 
          requiresAuth: !isPrivyConfigured() 
        },
        { status: 503 }
      );
    }
    
    // Use client's own API key
    return await processWithKey(input, clientApiKey);
  } catch (error) {
    console.error("AI parse error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to process request: ${errorMessage}` },
      { status: 500 }
    );
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

  const sanitizedInput = sanitizeInput(input);
  
  if (!sanitizedInput) {
    return NextResponse.json(
      { error: "Invalid input after sanitization" },
      { status: 400 }
    );
  }

  // Log for audit (in production, send to proper logging service)
  console.log(`[AUDIT] AI parse request at ${new Date().toISOString()}`);

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-sonar-small-128k-online",
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
    
    return NextResponse.json(
      { error: errorDetail, status: response.status },
      { status: 502 }
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return NextResponse.json(
      { error: "No response from AI service" },
      { status: 502 }
    );
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      water: sanitizeNumber(parsed.water, 0, 10000),
      salt: sanitizeNumber(parsed.salt, 0, 50000),
      reasoning: typeof parsed.reasoning === "string" 
        ? parsed.reasoning.slice(0, 200) 
        : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not parse AI response" },
      { status: 422 }
    );
  }
}
