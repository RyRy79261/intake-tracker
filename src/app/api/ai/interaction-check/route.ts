import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";

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

const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. Given a patient's current medications and a substance to check, identify drug interactions. Return JSON with an interactions array, drugClass (of the queried substance), and summary.

Severity levels:
- AVOID: Dangerous combination, should not be taken together
- CAUTION: Monitor closely, potential interaction that may require dose adjustment or timing separation
- OK: No significant interaction known

Be precise and evidence-based. Err on the side of CAUTION when uncertain.

Return ONLY valid JSON with this format:
{
  "interactions": [
    {
      "substance": "the queried substance",
      "medication": "the interacting medication name",
      "severity": "AVOID" | "CAUTION" | "OK",
      "description": "brief description of the interaction"
    }
  ],
  "drugClass": "pharmacological class of the queried substance",
  "summary": "one-line overall safety summary"
}

Check the queried substance against EACH active medication. Include an entry for every medication, even if the severity is OK.`;

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

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
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

    const callApi = async () => {
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-reasoning-pro",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data.choices?.[0]?.message?.content as string | undefined;
    };

    const parseContent = (content: string) => {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const validated = InteractionResultSchema.safeParse(
            JSON.parse(jsonMatch[0])
          );
          if (validated.success) return validated.data;
        } catch {
          // Fall through to retry
        }
      }
      return null;
    };

    // First attempt
    const content1 = await callApi();
    if (content1) {
      const result1 = parseContent(content1);
      if (result1) return NextResponse.json(result1);
    }

    // Retry once
    console.log("[RETRY] Interaction check first attempt failed, retrying...");
    const content2 = await callApi();
    if (content2) {
      const result2 = parseContent(content2);
      if (result2) return NextResponse.json(result2);
    }

    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 502 }
    );
  } catch (error) {
    console.error("Interaction check error:", error);
    return NextResponse.json(
      { error: "Failed to check interactions" },
      { status: 500 }
    );
  }
});
