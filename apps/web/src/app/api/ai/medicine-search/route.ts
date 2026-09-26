import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, rateLimitKey } from "@/app/api/_shared/rate-limit";
import { hasCompletedWebSearch, requestToolCall } from "@/app/api/ai/_shared/claude-call";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { SYSTEM_PROMPT, MEDICINE_SEARCH_TOOL } from "@intake/ai-prompts/medicine-search";

// Vercel function limit. The shared deadline stops short of it so a slow
// model call ends in a JSON 504 rather than the platform's own.
export const maxDuration = 90;
const DEADLINE_MS = 80_000;

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
    if (!rateLimiter.check(rateLimitKey(request, auth.userId))) {
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

    // Premium tier (Claude Opus 5.5): no forced tool_choice (a 400 there) —
    // `auto` with a strict result tool, plus one unforced retry when the
    // reply is prose. No `temperature`/`top_p`/`top_k` either (also a 400).
    // web_search grounds brand names and pill appearance, which the model
    // would otherwise recall.
    const { toolUse: toolBlock, responses } = await requestToolCall(
      client,
      {
        model: CLAUDE_MODELS.premium,
        // Room for adaptive thinking, the search traffic AND the tool call:
        // thinking can't be turned off on the premium model and its tokens
        // share this ceiling.
        max_tokens: 8192,
        // Opus 5.5 defaults to medium; a medication lookup is worth high.
        output_config: { effort: "high" },
        system: SYSTEM_PROMPT,
        tools: [WEB_SEARCH_TOOL, MEDICINE_SEARCH_TOOL],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: prompt }],
      },
      {
        usage: { userId: auth.userId!, resolved, route: "/api/ai/medicine-search" },
        deadline: Date.now() + DEADLINE_MS,
        toolName: MEDICINE_SEARCH_TOOL.name,
        retryInstruction: "Now return the result via the medicine_search_result tool.",
        forceOnRetry: false,
      },
    );

    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    const validated = MedicineSearchResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error("[VALIDATION] Medicine search response validation failed:", JSON.stringify(z.flattenError(validated.error)));
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    // The wizard pre-fills colour, shape and markings from these fields. If
    // no web search actually returned results, they came from model memory
    // (often the reference product, not the local generic), so drop them
    // rather than autofill a guess. The free-text description stays for the
    // result card.
    const appearanceVerified = hasCompletedWebSearch(responses);
    const { visualIdentification, ...rest } = validated.data;
    return NextResponse.json({
      ...rest,
      ...(appearanceVerified
        ? { visualIdentification }
        : { pillColor: "", pillShape: "" }),
      appearanceVerified,
    });
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
