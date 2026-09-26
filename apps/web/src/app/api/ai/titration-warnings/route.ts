import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, rateLimitKey } from "@/app/api/_shared/rate-limit";
import { requestToolCall } from "@/app/api/ai/_shared/claude-call";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { TITRATION_WARNINGS_TOOL, SYSTEM_PROMPT } from "@intake/ai-prompts/titration-warnings";

// Vercel function limit. The shared deadline stops short of it so a slow
// model call ends in a JSON 504 rather than the platform's own.
export const maxDuration = 60;
const DEADLINE_MS = 50_000;

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

// Every call is a premium-model request, often on a shared key: cap a
// looping or scripted client per user.
const rateLimiter = createRateLimiter(5);

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
      return zodErrorResponse("Titration warnings request failed", parsed.error);
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
        tools: [TITRATION_WARNINGS_TOOL],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: prompt }],
      },
      {
        usage: { userId: auth.userId!, resolved, route: "/api/ai/titration-warnings" },
        deadline: Date.now() + DEADLINE_MS,
        toolName: TITRATION_WARNINGS_TOOL.name,
        retryInstruction: "Now return the warnings via the titration_warnings_result tool.",
        forceOnRetry: false,
      },
    );

    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 },
      );
    }

    const validated = ResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error("[VALIDATION] Titration warnings response validation failed:", JSON.stringify(z.flattenError(validated.error)));
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 },
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("Titration warnings error:", error);
    return NextResponse.json(
      { error: "Failed to generate warnings" },
      { status: 500 },
    );
  }
});
