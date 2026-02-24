import { NextRequest, NextResponse } from "next/server";
import { verifyAndCheckWhitelist, isPrivyConfigured } from "@/lib/privy-server";

const SYSTEM_PROMPT = `You are a pharmaceutical information assistant. When given a medication name or active ingredient, respond with a JSON object containing information about the medication. Pay special attention to looking up the physical appearance of the pill (its color and shape) and country specific brand names.

If the user searches for a specific brand name, you MUST provide the physical description for that specific brand and include the searched brand name in the response. If you cannot find information for that exact brand and must fall back to generic information, explicitly mention that the physical description and details are for the generic equivalent.

Return ONLY valid JSON with these fields:
{
  "brandNames": ["string array of common brand names"],
  "localAlternatives": ["string array of local brand name alternatives if a country is provided in the prompt, otherwise empty array"],
  "genericName": "active ingredient / generic name",
  "dosageStrengths": ["common dosage strengths, e.g. '75mg', '150mg'"],
  "commonIndications": ["what the medication is typically prescribed for"],
  "foodInstruction": "before" | "after" | "none",
  "foodNote": "optional detail about food interaction",
  "pillColor": "most common color of the pill as a simple color name (e.g. 'pink', 'white', 'yellow', 'orange', 'blue', 'green', 'red', 'purple', 'brown', 'gray', 'black', 'beige')",
  "pillShape": "physical shape of the most common form (must be one of: 'round', 'oval', 'capsule', 'diamond', 'tablet')",
  "pillDescription": "brief description of the pill's physical appearance including color, shape, markings, and coating",
  "drugClass": "pharmacological class",
  "visualIdentification": "detailed notes on physical markings or imprints on the pill",
  "contraindications": ["array of notable contraindications or dangerous interactions"],
  "warnings": ["array of warning signs or side effects to look out for"],
  "isGenericFallback": true or false
}

Be precise with medical information. If you're uncertain about food instructions, default to "none".
For pill appearance, research the most common commercially available form of the medication.
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
    const { query, clientApiKey, country } = body;

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
        return await searchWithKey(query.trim(), apiKey, country);
      }
    }

    if (!clientApiKey) {
      return NextResponse.json(
        { error: "AI not configured. Sign in or add your own API key in settings.", requiresAuth: !isPrivyConfigured() },
        { status: 503 }
      );
    }

    return await searchWithKey(query.trim(), clientApiKey, country);
  } catch (error) {
    console.error("Medicine search error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

async function searchWithKey(query: string, apiKey: string, country?: string) {
  if (!apiKey || !apiKey.startsWith("pplx-")) {
    return NextResponse.json(
      { error: "Invalid API key format" },
      { status: 400 }
    );
  }

  const sanitized = query.slice(0, 200);

  const prompt = country 
    ? \`Look up this medication and provide detailed pharmaceutical information, focusing specifically on brands and availability in \${country}: "\${sanitized}"\`
    : \`Look up this medication and provide detailed pharmaceutical information: "\${sanitized}"\`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
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
      localAlternatives: Array.isArray(parsed.localAlternatives) ? parsed.localAlternatives : [],
      genericName: typeof parsed.genericName === "string" ? parsed.genericName : "",
      dosageStrengths: Array.isArray(parsed.dosageStrengths) ? parsed.dosageStrengths : [],
      commonIndications: Array.isArray(parsed.commonIndications) ? parsed.commonIndications : [],
      foodInstruction: ["before", "after", "none"].includes(parsed.foodInstruction) ? parsed.foodInstruction : "none",
      foodNote: typeof parsed.foodNote === "string" ? parsed.foodNote : undefined,
      pillColor: typeof parsed.pillColor === "string" ? parsed.pillColor : "",
      pillShape: typeof parsed.pillShape === "string" ? parsed.pillShape : "",
      pillDescription: typeof parsed.pillDescription === "string" ? parsed.pillDescription : "",
      drugClass: typeof parsed.drugClass === "string" ? parsed.drugClass : "",
      visualIdentification: typeof parsed.visualIdentification === "string" ? parsed.visualIdentification : undefined,
      contraindications: Array.isArray(parsed.contraindications) ? parsed.contraindications : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      isGenericFallback: typeof parsed.isGenericFallback === "boolean" ? parsed.isGenericFallback : false,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not parse AI response" },
      { status: 422 }
    );
  }
}
