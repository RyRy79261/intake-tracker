import Anthropic from "@anthropic-ai/sdk";
import { resolveAiKey, type ResolvedKey } from "@/lib/ai-key-resolver";

/**
 * Build an Anthropic SDK client for a given authenticated user.
 *
 * Resolves the key via priority chain (own stored → shared → env-var
 * whitelist; see ai-key-resolver.ts). Returns the resolved-key metadata
 * alongside the client so the route can record token usage against the
 * correct owner.
 *
 * No process-wide caching: different users have different keys. Constructing
 * a new SDK instance per request is cheap (~ms); decrypting the stored key
 * via `node:crypto` is also cheap (~µs).
 */
export async function getClaudeClientForUser(
  userId: string,
  email: string | undefined,
): Promise<{ client: Anthropic; resolved: ResolvedKey }> {
  const resolved = await resolveAiKey(userId, email, "anthropic");
  const client = new Anthropic({ apiKey: resolved.apiKey });
  return { client, resolved };
}

export const CLAUDE_MODELS = {
  fast: "claude-haiku-4-5-20251001" as const,
  quality: "claude-sonnet-4-6" as const,
  premium: "claude-opus-4-8" as const,
} as const;

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 5,
};

export {
  GRAMS_PER_STANDARD_DRINK,
  ETHANOL_DENSITY_G_PER_ML,
} from "@/lib/alcohol-units";
