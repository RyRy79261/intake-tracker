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

/**
 * Server-side AI parsing for food / drink descriptions.
 *
 * Always returns sodium in mg (no salt/sodium ambiguity). Uses Opus + web_search
 * for high-quality lookups, with temperature 0 for deterministic numeric answers.
 */

const ParseRequestSchema = z.object({
  input: z.string().min(1, "Input is required").max(500, "Input too long"),
});

const AIParseResponseSchema = z.object({
  water: z.number().min(0).max(10000).nullable(),
  sodiumMg: z.number().min(0).max(20000).nullable(),
  sugarG: z.number().min(0).max(1000).nullable(),
  potassiumMg: z.number().min(0).max(20000).nullable(),
  reasoning: z.string().max(1000).optional(),
});

const SYSTEM_PROMPT = `You are a nutrition lookup assistant. Given a food or drink description, return:
- water_ml: fluid/water content in millilitres (ml). For a DRINK (anything consumed as a liquid — water, juice, cordial, soft drinks, an ice lolly/popsicle, a smoothie), this is the TOTAL liquid volume consumed. Dissolved sugar, sodium and other solutes are carried *within* that liquid and do NOT displace it — never subtract them from the volume. A "60 ml ice lolly" is ~60 ml of fluid that happens to contain ~10 g of dissolved sugar, NOT 50 ml of water plus 10 ml of sugar. Report water_ml ≈ 60 and sugar_g ≈ 10 independently.
- sodium_mg: sodium content in milligrams (mg) -- NOT salt (NaCl). If a label or source reports salt in grams, convert: sodium_mg = salt_g * 1000 / 2.5.
- sugar_g: total sugars in grams (g) -- the sum of naturally-occurring and added sugars, as reported on a nutrition label's "of which sugars" line. A rough estimate is fine.
- potassium_mg: potassium content in milligrams (mg). Many labels do not report potassium; estimate from typical food composition tables (USDA / EFSA) when no label value is available. A rough estimate is fine -- potassium varies widely between foods and exact values are unattainable.
- reasoning: 1-3 sentence explanation citing the values used.

Units (metric only, no US units):
- All volumes in millilitres (ml).
- All masses in milligrams (mg) for sodium and potassium, grams (g) for portion weight and for sugar.
- Sodium, never salt. A "pinch of salt" is ~0.4 g of NaCl, which is ~155 mg sodium.
- Sugar is total sugars in grams, never teaspoons.
- Potassium in mg of elemental potassium (K+), as reported on nutrition labels.

Process:
1. If the item is a branded product, regional dish, restaurant menu item, or anything where you are not highly confident of the typical nutritional values, USE THE web_search TOOL to look up authoritative data (manufacturer site, supermarket listing, USDA / EFSA / national food database). Prefer per-100g or per-100ml figures and scale to the described portion.
2. If the item is a basic generic item with well-known values (plain water, milk, espresso, etc.), you may answer from your own knowledge.
3. After research, call the parse_food_result tool with the final numbers. The tool MUST be called -- do not return free text only.

Water content — IMPORTANT distinction between drinks and solid foods:
- DRINKS (you swallow a defined volume of liquid): water_ml = the FULL liquid volume. The body receives that whole volume as fluid; dissolved sugar, salt, caffeine or alcohol travel inside it and do not reduce it. A 250 ml glass of juice → water_ml ≈ 250 (NOT ~215), a 330 ml can of cola → ~330, a 60 ml ice lolly → ~60, a 250 ml glass of milk → ~250. The only common drink where the volume genuinely overstates hydration is high-proof spirits (the ethanol fraction is not water) — for neat spirits use roughly volume × water-fraction (~60% for 40% ABV).
- SOLID / SEMI-SOLID FOODS (no defined liquid volume — fruit, bread, a cooked dish): estimate the water they contribute from their mass and typical water-by-weight fraction. Watermelon ~92%, cucumber ~96%, apple ~86%, bread ~35%, cooked rice ~70%.
- Never carve dissolved sugar or sodium out of a drink's volume. Track them as separate masses (sugar_g, sodium_mg) over the SAME liquid.

Reference values for sodium (per typical serving):
- Plain fresh produce: 1-10 mg / 100 g
- A "pinch of salt" (~0.4 g NaCl): ~155 mg sodium
- Bread slice: ~150-250 mg
- Restaurant entrée: 800-2000 mg
- Salty snack (chips): ~150-250 mg per ~30 g serving

Reference values for sugar (total sugars per typical serving):
- Plain water, black coffee/tea, eggs, plain meat: ~0 g
- One teaspoon of table sugar: ~4 g
- A 330 ml can of regular cola / soft drink: ~35 g
- A medium apple: ~19 g; a banana: ~14 g
- A glass of milk (250 ml): ~12 g; fruit juice (250 ml): ~22 g
- A chocolate bar (~45 g): ~25 g

Reference values for potassium (per typical serving, rough):
- Medium banana (~120 g): ~420 mg
- Medium baked potato with skin (~170 g): ~900 mg
- Avocado (half, ~100 g): ~485 mg
- Glass of orange juice (250 ml): ~500 mg
- Glass of milk (250 ml): ~380 mg
- Cooked spinach (1 cup, ~180 g): ~840 mg
- Cooked lentils (1 cup, ~200 g): ~730 mg
- Plain chicken breast (100 g): ~250 mg
- Plain water / black coffee / tea: ~0-100 mg

If you cannot estimate a value, return null for that field.`;

const PARSE_RESULT_TOOL = {
  name: "parse_food_result" as const,
  description: "Return parsed water (ml), sodium (mg), total sugar (g) and potassium (mg) for a food or drink description.",
  input_schema: {
    type: "object" as const,
    properties: {
      water_ml: {
        type: ["number", "null"],
        description:
          "Fluid content in millilitres. For a drink, this is the FULL liquid volume consumed — dissolved sugar/sodium do not reduce it (a 60 ml lolly with 10 g sugar is ~60 ml, not 50). For solid food, estimate water contributed by its mass. Null if it cannot be estimated.",
      },
      sodium_mg: {
        type: ["number", "null"],
        description:
          "Sodium content in milligrams (NOT NaCl). If the source reports salt, divide by 2.5 before returning. Null if it cannot be estimated.",
      },
      sugar_g: {
        type: ["number", "null"],
        description:
          "Total sugars in grams (naturally-occurring plus added). Null if it cannot be estimated.",
      },
      potassium_mg: {
        type: ["number", "null"],
        description:
          "Potassium content in milligrams (elemental K+). Estimate from typical food composition tables when not labelled. Null if it cannot be estimated.",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of the estimate, including any sources consulted.",
      },
    },
    required: ["water_ml", "sodium_mg", "sugar_g", "potassium_mg", "reasoning"],
    additionalProperties: false,
  },
};

const rateLimiter = createRateLimiter(20);

type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: "tool_use" }>;

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  toolName: string
): ToolUseBlock | undefined {
  return content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === toolName
  );
}

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
    const parsed = ParseRequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("Parse request failed", parsed.error);
    }

    const { input } = parsed.data;
    console.log(`[AUDIT] AI parse from user: ${auth.userId}`);

    let client;
    let resolved;
    try {
      ({ client, resolved } = await getClaudeClientForUser(auth.userId!, auth.email));
    } catch (e) {
      const mapped = aiErrorResponse(e);
      if (mapped) return mapped;
      throw e;
    }

    const sanitizedInput = sanitizeForAI(input);
    if (!sanitizedInput) {
      return NextResponse.json(
        { error: "Invalid input after sanitization" },
        { status: 400 }
      );
    }

    const userMessage = `Estimate water (ml), sodium (mg), total sugar (g) and potassium (mg) for: "${sanitizedInput}". Use web_search for branded or regional items, then call parse_food_result.`;

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL, PARSE_RESULT_TOOL],
      messages: [{ role: "user", content: userMessage }],
    });
    recordUsage({
      userId: auth.userId!,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.quality,
      route: "/api/ai/parse",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
    });

    let toolBlock = findToolUse(response.content, PARSE_RESULT_TOOL.name);

    // If the model finished with text instead of calling the structured tool,
    // run a second turn that forces the tool with the prior context.
    if (!toolBlock) {
      const followupStartedAt = Date.now();
      const followup = await client.messages.create({
        model: CLAUDE_MODELS.quality,
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM_PROMPT,
        // WEB_SEARCH_TOOL must stay declared because the prior assistant turn
        // may contain server_tool_use blocks; tool_choice still forces the
        // structured tool.
        tools: [WEB_SEARCH_TOOL, PARSE_RESULT_TOOL],
        tool_choice: { type: "tool", name: PARSE_RESULT_TOOL.name },
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: "Now return the final estimate via the parse_food_result tool.",
          },
        ],
      });
      recordUsage({
        userId: auth.userId!,
        keyOwnerId: resolved.keyOwnerId,
        keySource: resolved.source,
        provider: "anthropic",
        model: CLAUDE_MODELS.quality,
        route: "/api/ai/parse",
        status: "success",
        durationMs: Date.now() - followupStartedAt,
        ...tokensFromAnthropic(followup.usage),
      });
      toolBlock = findToolUse(followup.content, PARSE_RESULT_TOOL.name);
    }

    if (!toolBlock) {
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    const toolInput = toolBlock.input as Record<string, unknown>;
    const validated = AIParseResponseSchema.safeParse({
      water: toolInput.water_ml,
      sodiumMg: toolInput.sodium_mg,
      sugarG: toolInput.sugar_g,
      potassiumMg: toolInput.potassium_mg,
      reasoning: toolInput.reasoning,
    });
    if (!validated.success) {
      console.error("[VALIDATION] AI response validation failed:", JSON.stringify(validated.error.flatten()));
      return NextResponse.json(
        { error: "AI response format invalid", fallbackToManual: true },
        { status: 422 }
      );
    }

    return NextResponse.json({
      water: validated.data.water,
      // Backwards-compatible field name; value is always sodium in mg.
      salt: validated.data.sodiumMg,
      measurement_type: "sodium" as const,
      sugar: validated.data.sugarG,
      potassium: validated.data.potassiumMg,
      ...(validated.data.reasoning !== undefined && { reasoning: validated.data.reasoning }),
    });
  } catch (error) {
    const mapped = aiErrorResponse(error);
    if (mapped) return mapped;
    console.error("AI parse error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 502 }
    );
  }
});
