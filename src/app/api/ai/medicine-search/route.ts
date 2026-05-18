import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS } from "../_shared/claude-client";
import { zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";

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
  name: "medicine_search_result" as const,
  description: "Return pharmaceutical information for a medication",
  input_schema: {
    type: "object" as const,
    properties: {
      brandNames: { type: "array", items: { type: "string" } },
      localAlternatives: { type: "array", items: { type: "string" } },
      genericName: { type: "string" },
      dosageStrengths: { type: "array", items: { type: "string" } },
      commonIndications: { type: "array", items: { type: "string" } },
      foodInstruction: { type: "string", enum: ["before", "after", "none"] },
      foodNote: { type: "string", description: "Optional detail about food interaction" },
      pillColor: { type: "string" },
      pillShape: { type: "string" },
      pillDescription: { type: "string" },
      drugClass: { type: "string" },
      visualIdentification: { type: "string", description: "Detailed notes on physical markings" },
      contraindications: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
      isGenericFallback: { type: "boolean" },
    },
    required: [
      "brandNames", "localAlternatives", "genericName", "dosageStrengths",
      "commonIndications", "foodInstruction", "foodNote", "pillColor",
      "pillShape", "pillDescription", "drugClass", "visualIdentification",
      "contraindications", "warnings", "isGenericFallback",
    ],
    additionalProperties: false,
  },
};

const rateLimiter = createRateLimiter(15);

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const ip = getClientIp(request);

    if (!rateLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Validate request body with Zod
    const parsed = MedicineSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return zodErrorResponse("Medicine search request validation failed", parsed.error);
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
      model: CLAUDE_MODELS.premium,
      max_tokens: 2048,
      temperature: 0,
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
