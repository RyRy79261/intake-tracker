import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS, WEB_SEARCH_TOOL } from "../_shared/claude-client";
import { SubstanceLookupResponseSchema, SUBSTANCE_LOOKUP_TOOL } from "./schema";

export const maxDuration = 60;

const RequestSchema = z.object({
  query: z.string().min(1).max(200),
  type: z.enum(["caffeine", "alcohol"]),
});

// Rate limiting: 15 requests/min (same as other AI routes)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 15;
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

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ||
               request.headers.get("x-real-ip") || "unknown";

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

    const { query, type } = parsed.data;
    const sanitized = sanitizeForAI(query);
    if (!sanitized) {
      return NextResponse.json({ error: "Invalid input after sanitization" }, { status: 400 });
    }

    console.log(`[AUDIT] Substance lookup from user: ${auth.userId}, type: ${type}`);

    let client;
    try {
      client = getClaudeClient();
    } catch {
      return NextResponse.json({ error: "AI service not configured on server" }, { status: 503 });
    }

    const systemPrompt = type === "caffeine"
      ? `You are a beverage nutrition expert. Given a beverage name, estimate its caffeine content per 100ml and typical serving size. Also estimate the beverage's water content as a percentage (0-100). Reference points: black coffee ~99%, beer ~93%, wine ~87%, spirits ~60%.

When to use web_search: if the item is a specific brand/product (e.g. "Mio Mio Mate Original", "Monster Energy", "Coca-Cola 330ml") where the actual label value matters, call web_search to look it up. For generic items ("black coffee", "green tea") you can estimate directly.`
      : `You are a beverage nutrition expert. Given a beverage name, estimate its ABV (alcohol by volume) percentage and typical serving size. Return the ABV as a percentage (e.g. 5 for beer, 12 for wine, 40 for spirits). Also estimate the beverage's water content as a percentage (0-100). Reference points: black coffee ~99%, beer ~93%, wine ~87%, spirits ~60%.

When to use web_search: if the item is a specific brand/product (e.g. "Heineken 0.0", "Jack Daniel's", "Aperol Spritz") where the actual label value matters, call web_search to look it up. For generic items ("light beer", "red wine") you can estimate directly.`;

    const response = await client.messages.create({
      model: CLAUDE_MODELS.quality,
      max_tokens: 1024,
      system: systemPrompt,
      tools: [WEB_SEARCH_TOOL, SUBSTANCE_LOOKUP_TOOL],
      tool_choice: { type: "tool", name: SUBSTANCE_LOOKUP_TOOL.name },
      messages: [{ role: "user", content: `Estimate ${type} content per 100ml for: "${sanitized}"` }],
    });

    const toolBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "tool_use" }> =>
        b.type === "tool_use" && b.name === SUBSTANCE_LOOKUP_TOOL.name
    );
    if (!toolBlock) {
      return NextResponse.json({ error: "AI response format invalid" }, { status: 422 });
    }

    const validated = SubstanceLookupResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      return NextResponse.json({ error: "AI response validation failed" }, { status: 422 });
    }

    return NextResponse.json(validated.data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number }).status;
    console.error("Substance lookup error:", msg, status ? `(HTTP ${status})` : "");
    return NextResponse.json(
      { error: "Failed to process request", detail: msg },
      { status: status === 401 ? 503 : 500 }
    );
  }
});
