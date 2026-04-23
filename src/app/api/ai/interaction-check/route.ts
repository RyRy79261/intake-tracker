import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "../_shared/claude-client";

// --- Zod Schemas (co-located per project convention) ---

export const maxDuration = 60;

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

Check the queried substance against EACH active medication. Include an entry for every medication, even if the severity is OK.

Use web_search to verify current interaction data and contraindications. Prefer web-verified sources (drug interaction databases, FDA/EMA labels, pharmacology references) over your internal knowledge, especially for newer medications and substances.`;

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

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 5;
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

// --- Handler ---

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
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let client;
    try {
      client = getClaudeClient();
    } catch {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
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

    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 3072,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL, INTERACTION_CHECK_TOOL],
      tool_choice: { type: "tool", name: "interaction_check_result" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "tool_use" }> =>
        b.type === "tool_use" && b.name === "interaction_check_result"
    );
    if (!toolBlock) {
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number }).status;
    console.error("Interaction check error:", msg, status ? `(HTTP ${status})` : "");
    return NextResponse.json(
      { error: "Failed to check interactions", detail: msg },
      { status: status === 401 ? 503 : 500 }
    );
  }
});
