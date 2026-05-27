import { NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";

const FoodItemSchema = z.object({
  description: z.string().min(1).max(300),
  grams: z.number().min(0).max(10000).optional(),
});

// Shape mirrors MedicationSchema in analytics-insights.ts — duplicated here
// rather than imported so the two routes stay independent.
const MedicationSchema = z.object({
  name: z.string().min(1).max(120),
  phaseType: z.enum(["maintenance", "titration"]),
  dose: z.string().min(1).max(80),
  frequency: z.string().min(1).max(120),
  daysOnPhase: z.number().int().nonnegative(),
});

const NutrientAnalysisRequestSchema = z.object({
  windowDays: z.number().int().min(1).max(90),
  focus: z.string().max(200).optional(),
  foods: z.array(FoodItemSchema).min(1).max(500),
  // Both only reach the route when the user has opted in on the profile page.
  conditions: z.array(z.string().min(1).max(120)).max(20).optional(),
  medications: z.array(MedicationSchema).max(40).optional(),
});

const NutrientFindingSchema = z.object({
  nutrient: z.string().min(1).max(80),
  status: z.enum(["high", "low", "balanced"]),
  detail: z.string().max(500),
  exampleFoods: z.array(z.string().max(120)).max(8).default([]),
});

const NutrientAnalysisResponseSchema = z.object({
  summary: z.string().max(1500),
  findings: z.array(NutrientFindingSchema).max(15).default([]),
  caveats: z.array(z.string().max(300)).max(5).default([]),
});

const SYSTEM_PROMPT = `You are a nutrition pattern analyst. The user will send a list of food and drink descriptions they consumed over a recent time window. Your job is to identify nutrient biases — nutrients they may be over- or under-consuming based on the foods listed.

You MUST call the report_nutrient_analysis tool to return your findings. Do not return free text only.

Tool use:
- If the food list contains BRANDED products, regional dishes, restaurant menu items, or anything you are not highly confident about the nutritional profile of, USE THE web_search TOOL to look up authoritative data (manufacturer, supermarket, USDA / national food database). Prefer per-100g figures.
- For generic/common items (banana, white rice, plain milk, etc.) you may answer from your own knowledge.
- After at most a few targeted lookups, call report_nutrient_analysis with your synthesis. Don't search for every item — only the ones you're uncertain about.

How to analyze:
1. Group the foods mentally by the dominant nutrients they provide (e.g. bananas/potatoes/spinach → potassium; red meat/lentils → iron; dairy → calcium; whole grains/legumes → fiber; oily fish/walnuts → omega-3; processed foods → sodium; sugary drinks → added sugar).
2. Look for patterns where a single nutrient appears very frequently (potential excess) OR where major nutrient groups are conspicuously absent (potential gap).
3. Focus on macro patterns and meaningful micronutrients (potassium, sodium, iron, calcium, magnesium, fiber, protein, vitamin C, vitamin D, B12, folate, omega-3, saturated fat, added sugar). Do not invent precise milligram totals — you only have descriptions, not measured quantities.
4. Be cautious: a list of food descriptions is not a complete diet record. Note this in caveats when relevant (missing portion sizes, missing days, single-meal-type bias).
5. If the user provides a focus area (e.g. "potassium"), prioritize findings about that nutrient but still mention other obvious patterns.
6. Give 3-7 findings. Each finding needs:
   - nutrient: the nutrient name
   - status: "high" (appears excessive), "low" (appears insufficient), or "balanced" (worth noting it looks ok)
   - detail: 1-3 sentence plain explanation of why you flagged it, referencing what was eaten
   - exampleFoods: 2-5 specific items from the input that drove this finding
7. Keep summary to 2-4 sentences — a friendly overview, not a clinical diagnosis.
8. NEVER give medical advice or recommend supplements. Phrase findings as observations ("your intake leans heavily on potassium-rich foods like bananas and potatoes"), not prescriptions.

Personalisation:
- The user may share their reported conditions and/or active medications. When present, USE this context to calibrate which nutrients matter and which way a bias is concerning. Examples (non-exhaustive): potassium-sparing diuretics and ACE inhibitors raise serum potassium so a potassium-heavy diet warrants stronger framing; loop diuretics deplete potassium so dietary potassium is desirable; chronic kidney disease usually means restricting potassium, phosphorus, and sodium; warfarin needs consistent (not low) vitamin K rather than avoidance; hypertension means sodium matters more.
- Reference the relevant condition or medication by name in the finding's detail when it changes your read of a nutrient. Keep it factual ("with [condition], a high-potassium pattern is more notable"), never prescriptive.
- If conditions or medications are absent, do NOT speculate about them.

If the input is too sparse or off-topic to analyze, return a single finding with status "balanced" explaining that.`;

const NUTRIENT_ANALYSIS_TOOL = {
  name: "report_nutrient_analysis" as const,
  description: "Report nutrient bias findings for a list of recent foods.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description: "2-4 sentence plain-language overview of nutrient patterns observed.",
      },
      findings: {
        type: "array",
        description: "3-7 nutrient findings, each flagging a potential bias or noteworthy balance.",
        items: {
          type: "object",
          properties: {
            nutrient: { type: "string" },
            status: { type: "string", enum: ["high", "low", "balanced"] },
            detail: { type: "string" },
            exampleFoods: {
              type: "array",
              items: { type: "string" },
              description: "2-5 specific food items from the user's log that drove this finding.",
            },
          },
          required: ["nutrient", "status", "detail", "exampleFoods"],
          additionalProperties: false,
        },
      },
      caveats: {
        type: "array",
        items: { type: "string" },
        description: "0-3 short caveats about data quality (e.g. missing portion sizes, sparse log).",
      },
    },
    required: ["summary", "findings", "caveats"],
    additionalProperties: false,
  },
};

const rateLimiter = createRateLimiter(10);

type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: "tool_use" }>;

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  toolName: string,
): ToolUseBlock | undefined {
  return content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === toolName,
  );
}

function buildFoodListText(
  foods: { description: string; grams?: number | undefined }[],
): string {
  return foods
    .map((f, i) => {
      const safe = sanitizeForAI(f.description);
      const portion = f.grams ? ` (~${Math.round(f.grams)} g)` : "";
      return `${i + 1}. ${safe}${portion}`;
    })
    .filter((line) => line.length > 3)
    .join("\n");
}

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const ip = getClientIp(request);
    if (!rateLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;
    const parsed = NutrientAnalysisRequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Nutrient analysis request failed", parsed.error);
    }

    const { windowDays, focus, foods, conditions, medications } = parsed.data;
    console.log(`[AUDIT] AI nutrient-analysis from user: ${auth.userId} (${foods.length} foods, ${windowDays}d)`);

    let client;
    let resolved;
    try {
      ({ client, resolved } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    const foodListText = buildFoodListText(foods);
    if (!foodListText) {
      return NextResponse.json(
        { error: "No analyzable food entries after sanitization." },
        { status: 400 },
      );
    }

    const sanitizedFocus = focus ? sanitizeForAI(focus) : "";
    const focusLine = sanitizedFocus
      ? `\n\nThe user has asked you to focus on: ${sanitizedFocus}`
      : "";

    const contextSections: string[] = [];
    if (conditions && conditions.length > 0) {
      const safeConditions = conditions
        .map((c) => sanitizeForAI(c))
        .filter((c) => c.length > 0);
      if (safeConditions.length > 0) {
        contextSections.push(
          `Reported conditions: ${safeConditions.join(", ")}`,
        );
      }
    }
    if (medications && medications.length > 0) {
      const lines = medications.map((m) => {
        const name = sanitizeForAI(m.name);
        const dose = sanitizeForAI(m.dose);
        const freq = sanitizeForAI(m.frequency);
        return `- ${name} (${m.phaseType}, ${dose}, ${freq}, day ${m.daysOnPhase})`;
      });
      contextSections.push(`Active medications:\n${lines.join("\n")}`);
    }
    const contextBlock =
      contextSections.length > 0
        ? `\n\nMedical context (user opted in — use to calibrate findings):\n${contextSections.join("\n")}`
        : "";

    const userMessage = `Below are the user's logged food and drink entries from the last ${windowDays} days. Some have approximate portions (in grams) shown in parentheses; many will not. Use web_search if you need to look up specific branded or regional items, then call the report_nutrient_analysis tool with your synthesis.${focusLine}${contextBlock}\n\nFoods:\n${foodListText}`;

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 4096,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL, NUTRIENT_ANALYSIS_TOOL],
      messages: [{ role: "user", content: userMessage }],
    });
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.quality,
      route: "/api/ai/nutrient-analysis",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
    });

    let toolBlock = findToolUse(response.content, NUTRIENT_ANALYSIS_TOOL.name);

    // Claude may finish with prose if web_search satisfied it. Force the
    // structured tool on a second turn, carrying the prior context so the
    // earlier server_tool_use blocks remain valid.
    if (!toolBlock) {
      const followupStartedAt = Date.now();
      const followup = await client.messages.create({
        model: CLAUDE_MODELS.quality,
        max_tokens: 2048,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        tools: [WEB_SEARCH_TOOL, NUTRIENT_ANALYSIS_TOOL],
        tool_choice: { type: "tool", name: NUTRIENT_ANALYSIS_TOOL.name },
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: response.content },
          {
            role: "user",
            content:
              "Now return your nutrient bias findings via the report_nutrient_analysis tool.",
          },
        ],
      });
      recordUsage({
        userId: auth.userId!,
        keyOwnerId: resolved.keyOwnerId,
        keySource: resolved.source,
        provider: "anthropic",
        model: CLAUDE_MODELS.quality,
        route: "/api/ai/nutrient-analysis",
        status: "success",
        durationMs: Date.now() - followupStartedAt,
        ...tokensFromAnthropic(followup.usage),
      });
      toolBlock = findToolUse(followup.content, NUTRIENT_ANALYSIS_TOOL.name);
    }

    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 422 },
      );
    }

    const validated = NutrientAnalysisResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      console.error(
        "[VALIDATION] Nutrient analysis response validation failed:",
        JSON.stringify(validated.error.flatten()),
      );
      return NextResponse.json(
        { error: "AI response format invalid" },
        { status: 422 },
      );
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("AI nutrient-analysis error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 502 },
    );
  }
});
