import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "../_shared/claude-client";

export const maxDuration = 60;

const RequestSchema = z.object({
  prescriptions: z
    .array(
      z.object({
        genericName: z.string(),
        currentDosage: z.string().optional(),
        newDosage: z.string().optional(),
        newSchedule: z.array(z.string()).optional(),
        newTotalDaily: z.string().optional(),
        frequency: z.string().optional(),
      }),
    )
    .min(1),
  otherMedications: z
    .array(
      z.object({
        genericName: z.string(),
      }),
    )
    .optional(),
  title: z.string().max(200).optional(),
});

const ResponseSchema = z.object({
  warnings: z.array(z.string()),
});

// --- Tool Definition ---

const TITRATION_WARNINGS_TOOL = {
  name: "titration_warnings_result" as const,
  description: "Return warning signs to watch during medication titration",
  input_schema: {
    type: "object" as const,
    properties: {
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["warnings"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. Given a list of medications involved in a dosage titration (with schedule details including times, amounts, and frequency), provide a concise list of warning signs the patient should watch for during the titration period.

Focus on:
- Symptoms that indicate the new dosage is too high or causing adverse effects
- Timing-specific concerns (e.g., evening doses causing insomnia, morning doses causing drowsiness)
- Drug interaction concerns when multiple medications change simultaneously or are taken at the same time
- Frequency changes (e.g., going from 1x to 2x daily -- peak/trough effects)
- Vital sign thresholds to watch (blood pressure, heart rate, etc.)
- Symptoms requiring immediate medical attention

Use the titration_warnings_result tool to return the warnings.
Keep each warning to one short sentence. Aim for 4-8 warnings. Be practical and patient-friendly, not overly clinical.

Use web_search to verify current clinical guidance, side-effect profiles, and interaction concerns for the specific medications involved. Prefer web-verified information over your internal knowledge, especially for less common medications or recent dosing updates.`;

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    let client;
    try {
      client = getClaudeClient();
    } catch {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 },
      );
    }

    const { prescriptions, otherMedications, title } = parsed.data;

    const rxList = prescriptions
      .map((rx) => {
        const lines = [`- ${sanitizeForAI(rx.genericName)} (CHANGING)`];
        if (rx.currentDosage) lines.push(`    Current: ${sanitizeForAI(rx.currentDosage)}`);
        if (rx.newTotalDaily) lines.push(`    New total: ${sanitizeForAI(rx.newTotalDaily)}, ${sanitizeForAI(rx.frequency ?? "")}`);
        if (rx.newSchedule && rx.newSchedule.length > 0) {
          lines.push(`    New schedule:`);
          for (const s of rx.newSchedule) {
            lines.push(`      - ${sanitizeForAI(s)}`);
          }
        } else if (rx.newDosage) {
          lines.push(`    New: ${sanitizeForAI(rx.newDosage)}`);
        }
        return lines.join("\n");
      })
      .join("\n");

    const otherRxList = otherMedications && otherMedications.length > 0
      ? "\n\nThe patient is also currently taking:\n" + otherMedications
          .map((rx) => `- ${sanitizeForAI(rx.genericName)} (unchanged)`)
          .join("\n")
      : "";

    const prompt = title
      ? `Titration plan "${sanitizeForAI(title)}" involves these medication changes:\n${rxList}${otherRxList}\n\nConsidering all medications, what warning signs should the patient watch for? Pay special attention to interactions between changing and unchanged medications.`
      : `A dosage titration involves these medication changes:\n${rxList}${otherRxList}\n\nConsidering all medications, what warning signs should the patient watch for? Pay special attention to interactions between changing and unchanged medications.`;

    console.log(`[AUDIT] Titration warnings request from user: ${auth.userId}`);

    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 2560,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL, TITRATION_WARNINGS_TOOL],
      tool_choice: { type: "tool", name: "titration_warnings_result" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "tool_use" }> =>
        b.type === "tool_use" && b.name === "titration_warnings_result"
    );
    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 },
      );
    }

    const validated = ResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error("[VALIDATION] Titration warnings response validation failed:", JSON.stringify(validated.error.flatten()));
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 },
      );
    }

    return NextResponse.json(validated.data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number }).status;
    console.error("Titration warnings error:", msg, status ? `(HTTP ${status})` : "");
    return NextResponse.json(
      { error: "Failed to generate warnings", detail: msg },
      { status: status === 401 ? 503 : 500 },
    );
  }
});
