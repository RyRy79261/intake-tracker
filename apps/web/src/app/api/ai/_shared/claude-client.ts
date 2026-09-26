import "server-only";
// getClaudeClientForUser lives in lib/server so lib code can import it without
// reaching into app/api (which the Capacitor export removes).
export { getClaudeClientForUser } from "@/lib/server/claude-client";

// The pinned model registry + shared web-search tool now live in the
// SDK-free @intake/ai-prompts package; re-exported here so every route's
// `import { ..., CLAUDE_MODELS, WEB_SEARCH_TOOL } from ".../claude-client"`
// resolves unchanged.
export { CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@intake/ai-prompts/models";

export {
  GRAMS_PER_STANDARD_DRINK,
  ETHANOL_DENSITY_G_PER_ML,
} from "@intake/core/alcohol";
