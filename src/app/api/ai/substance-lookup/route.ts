import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeForAI } from "@/lib/security";
import { getClaudeClient, CLAUDE_MODELS } from "../_shared/claude-client";
import { SubstanceLookupResponseSchema, SUBSTANCE_LOOKUP_TOOL } from "./schema";

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
      ? "You are a beverage nutrition expert. Given a beverage name, estimate its caffeine content per 100ml and typical serving size. Be as accurate as possible based on known beverage data. Also estimate the beverage's water content as a percentage (0-100). Reference points: black coffee ~99%, beer ~93%, wine ~87%, spirits ~60%."
      : "You are a beverage nutrition expert. Given a beverage name, estimate its alcohol content in standard drinks per 100ml and typical serving size. A standard drink contains approximately 14g (0.6 oz) of pure alcohol. Also estimate the beverage's water content as a percentage (0-100). Reference points: black coffee ~99%, beer ~93%, wine ~87%, spirits ~60%.";

    const response = await client.messages.create({
      model: CLAUDE_MODELS.fast,
      max_tokens: 512,
      system: systemPrompt,
      tools: [SUBSTANCE_LOOKUP_TOOL],
      tool_choice: { type: "tool", name: "substance_lookup_result" },
      messages: [{ role: "user", content: `Estimate ${type} content per 100ml for: "${sanitized}"` }],
    });

    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "AI response format invalid" }, { status: 422 });
    }

    const validated = SubstanceLookupResponseSchema.safeParse(toolBlock.input);
    if (!validated.success) {
      return NextResponse.json({ error: "AI response validation failed" }, { status: 422 });
    }

    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("Substance lookup error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
});
