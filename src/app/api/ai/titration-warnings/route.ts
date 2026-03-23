import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";

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

const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. Given a list of medications involved in a dosage titration (with schedule details including times, amounts, and frequency), provide a concise list of warning signs the patient should watch for during the titration period.

Focus on:
- Symptoms that indicate the new dosage is too high or causing adverse effects
- Timing-specific concerns (e.g., evening doses causing insomnia, morning doses causing drowsiness)
- Drug interaction concerns when multiple medications change simultaneously or are taken at the same time
- Frequency changes (e.g., going from 1x to 2x daily — peak/trough effects)
- Vital sign thresholds to watch (blood pressure, heart rate, etc.)
- Symptoms requiring immediate medical attention

Return ONLY valid JSON with this format:
{
  "warnings": ["warning 1", "warning 2", ...]
}

Keep each warning to one short sentence. Aim for 4-8 warnings. Be practical and patient-friendly, not overly clinical.`;

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

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
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
          max_tokens: 1500,
        }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data.choices?.[0]?.message?.content as string | undefined;
    };

    const parseContent = (content: string) => {
      // Try JSON extraction first
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const validated = ResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
          if (validated.success) return validated.data;
        } catch {
          // Fall through
        }
      }

      // Fallback: extract warnings from markdown bullet points
      const bulletWarnings = content
        .split("\n")
        .map((line: string) => line.replace(/^[\s]*[-*•]\s*\**/, "").replace(/\*+$/, "").trim())
        .filter((line: string) => line.length > 10 && line.length < 200 && !line.startsWith("#") && !line.startsWith("{"))
        .slice(0, 10);

      if (bulletWarnings.length > 0) return { warnings: bulletWarnings };
      return null;
    };

    // First attempt
    const content1 = await callApi();
    if (content1) {
      const result1 = parseContent(content1);
      if (result1) return NextResponse.json(result1);
    }

    // Retry once (reasoning models can be flaky on first call)
    console.log("[RETRY] Titration warnings first attempt failed, retrying...");
    const content2 = await callApi();
    if (content2) {
      const result2 = parseContent(content2);
      if (result2) return NextResponse.json(result2);
    }

    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 502 },
    );
  } catch (error) {
    console.error("Titration warnings error:", error);
    return NextResponse.json(
      { error: "Failed to generate warnings" },
      { status: 500 },
    );
  }
});
