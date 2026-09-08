/**
 * Pinned Claude model registry + the shared web-search tool definition.
 *
 * These are SDK-free `as const` literals consumed by every `api/ai/**` route
 * (and `api/bug-report`) via the `claude-client` re-export. Keeping them here —
 * not co-located with the Anthropic SDK client — lets pure/client code and the
 * route handlers reference the canonical model ids without dragging the SDK,
 * the API-key vault, or `server-only` into the dependency graph.
 */

export const CLAUDE_MODELS = {
  fast: "claude-haiku-4-5-20251001" as const,
  quality: "claude-sonnet-4-6" as const,
  // Claude Opus 5. Two behaviours differ from the Opus 4.8 this replaced, and
  // both are load-bearing for the routes below:
  //   - Thinking is ON by default. Omitting `thinking` runs adaptive thinking
  //     (on 4.8, omitting it meant no thinking at all), and those tokens count
  //     against `max_tokens` — which is why the premium routes budget for it.
  //   - Sampling parameters stay removed: `temperature`/`top_p`/`top_k` return
  //     a 400, exactly as on 4.8/4.7.
  premium: "claude-opus-5" as const,
} as const;

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 5,
};
