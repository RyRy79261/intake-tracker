import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// Model selection: fast for lightweight tasks, quality for complex reasoning
export const CLAUDE_MODELS = {
  fast: "claude-haiku-4-5-20251001" as const,
  quality: "claude-sonnet-4-5-20250514" as const,
} as const;
