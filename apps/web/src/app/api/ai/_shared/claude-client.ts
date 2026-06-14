import "server-only";
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

// The pinned model registry + shared web-search tool now live in the
// SDK-free @intake/ai-prompts package; re-exported here so every route's
// `import { ..., CLAUDE_MODELS, WEB_SEARCH_TOOL } from ".../claude-client"`
// resolves unchanged.
export { CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@intake/ai-prompts/models";

export {
  GRAMS_PER_STANDARD_DRINK,
  ETHANOL_DENSITY_G_PER_ML,
} from "@intake/core/alcohol";
