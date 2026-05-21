import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";

// --- Zod Schemas (co-located per project convention) ---

const ActivePrescriptionSchema = z.object({
  genericName: z.string(),
  drugClass: z.string().optional(),
});

const ConflictRequestSchema = z.object({
  mode: z.literal("conflict"),
  newMedication: z.string(),
  activePrescriptions: z.array(ActivePrescriptionSchema).min(1),
});

const LookupRequestSchema = z.object({
  mode: z.literal("lookup"),
  substance: z.string(),
  activePrescriptions: z.array(ActivePrescriptionSchema).min(1),
});

const RequestSchema = z.discriminatedUnion("mode", [
  ConflictRequestSchema,
  LookupRequestSchema,
]);

const InteractionResultSchema = z.object({
  interactions: z.array(
    z.object({
      substance: z.string(),
      medication: z.string(),
      severity: z.enum(["AVOID", "CAUTION", "OK"]),
      description: z.string(),
    })
  ),
  drugClass: z.string().optional(),
  summary: z.string().optional(),
});

// --- System Prompt ---

const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. Given a patient's current medications and a substance to check, identify drug interactions. Return the results using the interaction_check_result tool.

Severity levels:
- AVOID: Dangerous combination, should not be taken together
- CAUTION: Monitor closely, potential interaction that may require dose adjustment or timing separation
- OK: No significant interaction known

Be precise and evidence-based. Err on the side of CAUTION when uncertain.

Check the queried substance against EACH active medication. Include an entry for every medication, even if the severity is OK.`;

// --- Tool Definition ---

const INTERACTION_CHECK_TOOL = {
  name: "interaction_check_result" as const,
  description: "Return drug interaction analysis for a substance against current medications",
  input_schema: {
    type: "object" as const,
    properties: {
      interactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            substance: { type: "string" },
            medication: { type: "string" },
            severity: { type: "string", enum: ["AVOID", "CAUTION", "OK"] },
            description: { type: "string" },
          },
          required: ["substance", "medication", "severity", "description"],
          additionalProperties: false,
        },
      },
      drugClass: { type: "string", description: "Pharmacological class of the queried substance" },
      summary: { type: "string", description: "One-line overall safety summary" },
    },
    required: ["interactions", "drugClass", "summary"],
    additionalProperties: false,
  },
};

// --- Rate Limiting ---

const rateLimiter = createRateLimiter(5);

// --- Handler ---

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
    const parsed = RequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Interaction check request failed", parsed.error);
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

    const { activePrescriptions } = parsed.data;
    const querySubstance =
      parsed.data.mode === "conflict"
        ? parsed.data.newMedication
        : parsed.data.substance;

    // Build user prompt
    const rxList = activePrescriptions
      .map(
        (rx) =>
          `- ${sanitizeForAI(rx.genericName)}${rx.drugClass ? ` (${sanitizeForAI(rx.drugClass)})` : ""}`
      )
      .join("\n");

    const prompt = `Currently taking:\n${rxList}\n\nCheck interactions for: ${sanitizeForAI(querySubstance)}`;

    console.log(`[AUDIT] Interaction check request from user: ${auth.userId}, mode: ${parsed.data.mode}`);

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODELS.premium,
      max_tokens: 2048,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [INTERACTION_CHECK_TOOL],
      tool_choice: { type: "tool", name: "interaction_check_result" },
      messages: [{ role: "user", content: prompt }],
    });
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.premium,
      route: "/api/ai/interaction-check",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
    });

    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 }
      );
    }

    const validated = InteractionResultSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error("[VALIDATION] Interaction check response validation failed:", JSON.stringify(validated.error.flatten()));
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 }
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("Interaction check error:", error);
    return NextResponse.json(
      { error: "Failed to check interactions" },
      { status: 500 }
    );
  }
});
