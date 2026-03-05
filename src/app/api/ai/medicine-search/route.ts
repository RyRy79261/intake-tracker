import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAndCheckWhitelist, isPrivyConfigured } from "@/lib/privy-server";

// --- Zod Schemas (co-located per user decision) ---

const MedicineSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required").max(200, "Query too long"),
  clientApiKey: z.string().startsWith("pplx-").optional(),
  country: z.string().max(100).optional(),
});

const MedicineSearchResponseSchema = z.object({
  brandNames: z.array(z.string()).default([]),
  localAlternatives: z.array(z.string()).default([]),
  genericName: z.string().default(""),
  dosageStrengths: z.array(z.string()).default([]),
  commonIndications: z.array(z.string()).default([]),
  foodInstruction: z.enum(["before", "after", "none"]).default("none"),
  foodNote: z.string().optional(),
  pillColor: z.string().default(""),
  pillShape: z.string().default(""),
  pillDescription: z.string().default(""),
  drugClass: z.string().default(""),
  visualIdentification: z.string().optional(),
  contraindications: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  isGenericFallback: z.boolean().default(false),
});

// --- System Prompt ---

const SYSTEM_PROMPT = `You are a pharmaceutical information assistant. When given a medication name or active ingredient, respond with a JSON object containing information about the medication. Pay special attention to looking up the physical appearance of the pill (its color and shape) and country specific brand names.

If the user searches for a specific brand name, you MUST provide the physical description for that specific brand and include the searched brand name in the response. If you cannot find information for that exact brand and must fall back to generic information, explicitly mention that the physical description and details are for the generic equivalent.

Return ONLY valid JSON with these fields:
{
  "brandNames": ["string array of common brand names"],
  "localAlternatives": ["string array of local brand name alternatives if a country is provided in the prompt, otherwise empty array"],
  "genericName": "active ingredient / generic name",
  "dosageStrengths": ["common dosage strengths, e.g. '75mg', '150mg'"],
  "commonIndications": ["what the medication is typically prescribed for"],
  "foodInstruction": "before" | "after" | "none",
  "foodNote": "optional detail about food interaction",
  "pillColor": "most common color of the pill as a simple color name (e.g. 'pink', 'white', 'yellow', 'orange', 'blue', 'green', 'red', 'purple', 'brown', 'gray', 'black', 'beige')",
  "pillShape": "physical shape of the most common form (must be one of: 'round', 'oval', 'capsule', 'diamond', 'tablet')",
  "pillDescription": "brief description of the pill's physical appearance including color, shape, markings, and coating",
  "drugClass": "pharmacological class",
  "visualIdentification": "detailed notes on physical markings or imprints on the pill",
  "contraindications": ["array of notable contraindications, dangerous interactions, and specifically what other medications the user should avoid"],
  "warnings": ["array of warning signs or side effects to look out for"],
  "isGenericFallback": true or false
}

Be precise with medical information. If you're uncertain about food instructions, default to "none".
For pill appearance, research the most common commercially available form of the medication.
Always respond with valid JSON only.`;

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 15;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
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

    // Validate request body with Zod
    const parsed = MedicineSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[VALIDATION] Medicine search request validation failed:", JSON.stringify(parsed.error.flatten()));
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { query, clientApiKey, country } = parsed.data;

    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (isPrivyConfigured()) {
      const authResult = await verifyAndCheckWhitelist(authToken);
      if (!authResult.success) {
        return NextResponse.json(
          { error: authResult.error || "Unauthorized", requiresAuth: true },
          { status: 401 }
        );
      }
      if (apiKey) {
        return await searchWithKey(query.trim(), apiKey, country);
      }
    }

    if (!clientApiKey) {
      return NextResponse.json(
        { error: "AI not configured. Sign in or add your own API key in settings.", requiresAuth: !isPrivyConfigured() },
        { status: 503 }
      );
    }

    return await searchWithKey(query.trim(), clientApiKey, country);
  } catch (error) {
    console.error("Medicine search error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

async function callPerplexityMedicine(query: string, apiKey: string, country?: string) {
  const sanitized = query.slice(0, 200);

  const prompt = country
    ? `Look up this medication and provide detailed pharmaceutical information, focusing specifically on brands and availability in ${country}: "${sanitized}"`
    : `Look up this medication and provide detailed pharmaceutical information: "${sanitized}"`;

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
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 800,
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

function parseAndValidateMedicineResponse(content: string): z.infer<typeof MedicineSearchResponseSchema> | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const rawParsed = JSON.parse(jsonMatch[0]);
    const validated = MedicineSearchResponseSchema.safeParse(rawParsed);

    if (!validated.success) {
      console.error("[VALIDATION] Medicine search response validation failed:", JSON.stringify(validated.error.flatten()));
      return null;
    }

    return validated.data;
  } catch {
    return null;
  }
}

async function searchWithKey(query: string, apiKey: string, country?: string) {
  if (!apiKey || !apiKey.startsWith("pplx-")) {
    return NextResponse.json(
      { error: "Invalid API key format" },
      { status: 400 }
    );
  }

  // First attempt
  const result1 = await callPerplexityMedicine(query, apiKey, country);
  if (!result1.ok) {
    return NextResponse.json(
      { error: result1.error },
      { status: 502 }
    );
  }

  const validated1 = parseAndValidateMedicineResponse(result1.content);
  if (validated1) {
    return NextResponse.json(validated1);
  }

  // Retry once on AI response validation failure
  console.log("[RETRY] Medicine search response validation failed, retrying once...");
  const result2 = await callPerplexityMedicine(query, apiKey, country);
  if (!result2.ok) {
    return NextResponse.json(
      { error: result2.error },
      { status: 502 }
    );
  }

  const validated2 = parseAndValidateMedicineResponse(result2.content);
  if (validated2) {
    return NextResponse.json(validated2);
  }

  // Second failure — fallback to manual entry
  return NextResponse.json(
    { error: "AI response format invalid", fallbackToManual: true },
    { status: 422 }
  );
}
