import { NextRequest, NextResponse } from "next/server";
import { verifyAndCheckWhitelist, isPrivyConfigured } from "@/lib/privy-server";

const SYSTEM_PROMPT = `You are a pharmaceutical information assistant. When given a medication name or active ingredient, respond with a JSON object containing information about the medication.

Return ONLY valid JSON with these fields:
{
  "brandNames": ["string array of common brand names"],
  "genericName": "active ingredient / generic name",
  "dosageStrengths": ["common dosage strengths, e.g. '75mg', '150mg'"],
  "commonIndications": ["what the medication is typically prescribed for"],
  "foodInstruction": "before" | "after" | "none",
  "foodNote": "optional detail about food interaction",
  "pillDescription": "typical physical appearance (shape, color)",
  "drugClass": "pharmacological class"
}

Be precise with medical information. If you're uncertain about food instructions, default to "none".
Always respond with valid JSON only.`;

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

export async function POST(request: NextRequest) {
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

    const authHeader = request.headers.get("authorization");
    const authToken = authHeader?.replace("Bearer ", "") || null;

    const body = await request.json();
    const { query, clientApiKey } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (isPrivyConfigured()) {
      const authResult = await verifyAndCheckWhitelist(authToken);
      if (!authResult.success) {
        return NextResponse.json(
          { error: authResult.error || "Unauthorized", requiresAuth: true },
          { status: 401 }
        );
      }
      if (apiKey) {
        return await searchWithKey(query.trim(), apiKey);
      }
    }

    if (!clientApiKey) {
      return NextResponse.json(
        { error: "AI not configured. Sign in or add your own API key in settings.", requiresAuth: !isPrivyConfigured() },
        { status: 503 }
      );
    }

    return await searchWithKey(query.trim(), clientApiKey);
  } catch (error) {
    console.error("Medicine search error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

async function searchWithKey(query: string, apiKey: string) {
  if (!apiKey || !apiKey.startsWith("pplx-")) {
    return NextResponse.json(
      { error: "Invalid API key format" },
      { status: 400 }
    );
  }

  const sanitized = query.slice(0, 200);

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
        {
          role: "user",
          content: `Look up this medication and provide detailed pharmaceutical information: "${sanitized}"`,
        },
      ],
      temperature: 0.1,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Perplexity API error [${response.status}]:`, errorText);
    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 502 }
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return NextResponse.json(
      { error: "No response from AI service" },
      { status: 502 }
    );
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No valid JSON found");
    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      brandNames: Array.isArray(parsed.brandNames) ? parsed.brandNames : [],
      genericName: typeof parsed.genericName === "string" ? parsed.genericName : "",
      dosageStrengths: Array.isArray(parsed.dosageStrengths) ? parsed.dosageStrengths : [],
      commonIndications: Array.isArray(parsed.commonIndications) ? parsed.commonIndications : [],
      foodInstruction: ["before", "after", "none"].includes(parsed.foodInstruction) ? parsed.foodInstruction : "none",
      foodNote: typeof parsed.foodNote === "string" ? parsed.foodNote : undefined,
      pillDescription: typeof parsed.pillDescription === "string" ? parsed.pillDescription : "",
      drugClass: typeof parsed.drugClass === "string" ? parsed.drugClass : "",
    });
  } catch {
    return NextResponse.json(
      { error: "Could not parse AI response" },
      { status: 422 }
    );
  }
}
