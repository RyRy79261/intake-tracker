import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS } from "../_shared/claude-client";

// --- Zod Schemas (co-located per user decision) ---

const MedicineSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required").max(200, "Query too long"),
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

const SYSTEM_PROMPT = `You are a pharmaceutical information assistant. When given a medication name or active ingredient, respond with information about the medication using the medicine_search_result tool. Pay special attention to looking up the physical appearance of the pill (its color and shape) and country specific brand names.

If the user searches for a specific brand name, you MUST provide the physical description for that specific brand and include the searched brand name in the response. If you cannot find information for that exact brand and must fall back to generic information, explicitly mention that the physical description and details are for the generic equivalent.

Be precise with medical information. If you're uncertain about food instructions, default to "none".
For pill appearance, research the most common commercially available form of the medication.`;

// --- Tool Definition ---

const MEDICINE_SEARCH_TOOL = {
  name: "medicine_search_result",
  description: "Return pharmaceutical information for a medication",
  input_schema: {
    type: "object" as const,
    properties: {
      brandNames: { type: "array" as const, items: { type: "string" as const } },
      localAlternatives: { type: "array" as const, items: { type: "string" as const } },
      genericName: { type: "string" as const },
      dosageStrengths: { type: "array" as const, items: { type: "string" as const } },
      commonIndications: { type: "array" as const, items: { type: "string" as const } },
      foodInstruction: { type: "string" as const, enum: ["before", "after", "none"] },
      foodNote: { type: "string" as const, description: "Optional detail about food interaction" },
      pillColor: { type: "string" as const },
      pillShape: { type: "string" as const },
      pillDescription: { type: "string" as const },
      drugClass: { type: "string" as const },
      visualIdentification: { type: "string" as const, description: "Detailed notes on physical markings" },
      contraindications: { type: "array" as const, items: { type: "string" as const } },
      warnings: { type: "array" as const, items: { type: "string" as const } },
      isGenericFallback: { type: "boolean" as const },
    },
    required: [
      "brandNames", "localAlternatives", "genericName", "dosageStrengths",
      "commonIndications", "foodInstruction", "foodNote", "pillColor",
      "pillShape", "pillDescription", "drugClass", "visualIdentification",
      "contraindications", "warnings", "isGenericFallback",
    ] as const,
    additionalProperties: false,
  },
};

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

export const POST = withAuth(async ({ request, auth }) => {
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

    const { query, country } = parsed.data;

    console.log(`[AUDIT] Medicine search request from user: ${auth.userId}`);

    let client;
    try {
      client = getClaudeClient();
    } catch {
      return NextResponse.json(
        { error: "AI service not configured on server" },
        { status: 503 }
      );
    }

    const sanitized = sanitizeForAI(query.trim());

    const prompt = country
      ? `Look up this medication and provide detailed pharmaceutical information, focusing specifically on brands and availability in ${country}: "${sanitized}"`
      : `Look up this medication and provide detailed pharmaceutical information: "${sanitized}"`;

    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [MEDICINE_SEARCH_TOOL],
      tool_choice: { type: "tool", name: "medicine_search_result" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    const validated = MedicineSearchResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error("[VALIDATION] Medicine search response validation failed:", JSON.stringify(validated.error.flatten()));
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("Medicine search error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 502 }
    );
  }
});
