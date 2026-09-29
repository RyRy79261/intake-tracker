import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, rateLimitKey } from "@/app/api/_shared/rate-limit";
import { requestToolCall } from "@/app/api/ai/_shared/claude-call";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { SYSTEM_PROMPT, MEDICINE_ABOUT_TOOL } from "@intake/ai-prompts/medicine-about";

// Vercel function limit. The shared deadline stops short of it so a slow
// model call ends in a JSON 504 rather than the platform's own.
export const maxDuration = 60;
const DEADLINE_MS = 50_000;

// --- Zod Schemas (co-located per project convention) ---

const RequestSchema = z.object({
  genericName: z.string().trim().min(1, "Medicine name is required").max(200, "Name too long"),
  /** Active ingredient names of a combination tablet (names only). */
  compounds: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
});

const text = z.string().default("");
const textList = z.array(z.string()).default([]);

const ResponseSchema = z.object({
  drugClass: text,
  compounds: z
    .array(
      z.object({
        name: z.string(),
        drugClass: text,
        forText: text,
        howItWorks: text,
        sideEffects: textList,
      }),
    )
    .default([]),
  warnings: z.array(z.object({ risk: z.string(), whatToDo: text })).default([]),
  contraindications: textList,
  foodInstruction: z.enum(["before", "after", "none"]).default("none"),
  foodNote: text,
  pillDescription: text,
  visualIdentification: text,
});

// --- Rate Limiting ---

const rateLimiter = createRateLimiter(5);

// --- Handler ---

export const POST = withAuth(async ({ request, auth }) => {
  try {
    if (!rateLimiter.check(rateLimitKey(request, auth.userId))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;
    const parsed = RequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Medicine about request failed", parsed.error);
    }

    let client;
    let resolved;
    try {
      ({ client, resolved } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    const { genericName, compounds } = parsed.data;
    const parts = (compounds ?? []).map((c) => sanitizeForAI(c));
    const prompt =
      `Medicine: ${sanitizeForAI(genericName)}` +
      (parts.length > 1 ? `\nActive ingredients: ${parts.join(", ")}` : "");

    console.log(`[AUDIT] Medicine about request from user: ${auth.userId}`);

    // Premium tier (Claude Opus 5.5): no forced tool_choice (a 400 there) —
    // `auto` with a strict result tool, plus one unforced retry when the
    // reply is prose. No `temperature`/`top_p`/`top_k` either (also a 400).
    const { toolUse: toolBlock } = await requestToolCall(
      client,
      {
        model: CLAUDE_MODELS.premium,
        // Room for adaptive thinking AND the tool call: thinking can't be
        // turned off on the premium model and its tokens share this ceiling.
        max_tokens: 8192,
        // Opus 5.5 defaults to medium; medication safety is worth high.
        output_config: { effort: "high" },
        system: SYSTEM_PROMPT,
        tools: [MEDICINE_ABOUT_TOOL],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: prompt }],
      },
      {
        usage: { userId: auth.userId!, resolved, route: "/api/ai/medicine-about" },
        deadline: Date.now() + DEADLINE_MS,
        toolName: MEDICINE_ABOUT_TOOL.name,
        retryInstruction: "Now return the information via the medicine_about_result tool.",
        forceOnRetry: false,
      },
    );

    if (!toolBlock) {
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const validated = ResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error(
        "[VALIDATION] Medicine about response validation failed:",
        JSON.stringify(z.flattenError(validated.error)),
      );
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    // Nothing usable: say so rather than store an empty page.
    if (validated.data.compounds.length === 0 && !validated.data.drugClass) {
      return NextResponse.json(
        { error: "No information was found for this medicine.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("Medicine about error:", error);
    return NextResponse.json(
      { error: "Failed to look up the medicine" },
      { status: 500 },
    );
  }
});
