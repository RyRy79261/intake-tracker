import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export const CLAUDE_MODELS = {
  fast: "claude-haiku-4-5-20251001" as const,
  quality: "claude-sonnet-4-5-20250514" as const,
} as const;
