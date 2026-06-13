import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { SYSTEM_PROMPT, MEDICINE_SEARCH_TOOL } from "@intake/ai-prompts/medicine-search";

// --- Zod Schemas (co-located per user decision) ---

const MedicineSearchRequestSchema = z.object({
  query: z.string().min(1, "Query is required").max(200, "Query too long"),
  country: z.string().max(100).optional(),
});

const CompoundStrengthSchema = z.object({
  name: z.string(),
  strength: z.number(),
});

const StrengthOptionSchema = z.object({
  label: z.string(),
  compounds: z.array(CompoundStrengthSchema).default([]),
});

const MedicineSearchResponseSchema = z.object({
  brandNames: z.array(z.string()).default([]),
  localAlternatives: z.array(z.string()).default([]),
  genericName: z.string().default(""),
  dosageStrengths: z.array(z.string()).default([]),
  activeIngredients: z.array(z.string()).default([]),
  strengthOptions: z.array(StrengthOptionSchema).default([]),
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

    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;

    // Validate request body with Zod
    const parsed = MedicineSearchRequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Medicine search request validation failed", parsed.error);
    }

    const { query, country } = parsed.data;

    console.log(`[AUDIT] Medicine search request from user: ${auth.userId}`);

    let client;
    let resolved;
    try {
      ({ client, resolved } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    const sanitized = sanitizeForAI(query.trim());
    const sanitizedCountry = country ? sanitizeForAI(country.trim()) : "";

    const prompt = sanitizedCountry
      ? `Look up this medication and provide detailed pharmaceutical information, focusing specifically on brands and availability in ${sanitizedCountry}: "${sanitized}"`
      : `Look up this medication and provide detailed pharmaceutical information: "${sanitized}"`;

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODELS.premium,
      max_tokens: 2048,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [MEDICINE_SEARCH_TOOL],
      tool_choice: { type: "tool", name: "medicine_search_result" },
      messages: [{ role: "user", content: prompt }],
    });
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.premium,
      route: "/api/ai/medicine-search",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
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
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("Medicine search error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 502 }
    );
  }
});
