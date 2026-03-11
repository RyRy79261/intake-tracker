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
      }),
    )
    .min(1),
  title: z.string().max(200).optional(),
});

const ResponseSchema = z.object({
  warnings: z.array(z.string()),
});

const SYSTEM_PROMPT = `You are a clinical pharmacist assistant. Given a list of medications involved in a dosage titration, provide a concise list of warning signs the patient should watch for during the titration period.

Focus on:
- Symptoms that indicate the new dosage is too high or causing adverse effects
- Drug interaction concerns when multiple medications change simultaneously
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

    const { prescriptions, title } = parsed.data;

    const rxList = prescriptions
      .map((rx) => {
        const parts = [sanitizeForAI(rx.genericName)];
        if (rx.currentDosage) parts.push(`current: ${sanitizeForAI(rx.currentDosage)}`);
        if (rx.newDosage) parts.push(`new: ${sanitizeForAI(rx.newDosage)}`);
        return `- ${parts.join(", ")}`;
      })
      .join("\n");

    const prompt = title
      ? `Titration plan "${sanitizeForAI(title)}" involves these medications:\n${rxList}\n\nWhat warning signs should the patient watch for?`
      : `A dosage titration involves these medications:\n${rxList}\n\nWhat warning signs should the patient watch for?`;

    console.log(`[AUDIT] Titration warnings request from user: ${auth.userId}`);

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 502 },
      );
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Invalid AI response format" },
        { status: 422 },
      );
    }

    const validated = ResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid AI response format" },
        { status: 422 },
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("Titration warnings error:", error);
    return NextResponse.json(
      { error: "Failed to generate warnings" },
      { status: 500 },
    );
  }
});
