/**
 * Pinned Claude model registry + the shared web-search tool definition.
 *
 * These are SDK-free `as const` literals consumed by every `api/ai/**` route
 * (and `api/bug-report`) via the `claude-client` re-export. Keeping them here —
 * not co-located with the Anthropic SDK client — lets pure/client code and the
 * route handlers reference the canonical model ids without dragging the SDK,
 * the API-key vault, or `server-only` into the dependency graph.
 *
 * Which tier a route uses is a deliberate choice:
 *   - fast (Haiku 4.5): bug-report restructuring only — cheap prose tidying.
 *   - quality (Sonnet 5.5): food parse, voice parse, caffeine lookup,
 *     nutrient analysis and fast insights. These are high-volume nutrition
 *     estimates, most backed by web_search, where Sonnet's accuracy is near
 *     Opus at about half the price.
 *   - premium (Opus 5.5): medicine search, interaction checks, titration
 *     warnings and deep insights — the medication-safety routes, where the
 *     answer matters more than the per-call cost.
 */

export const CLAUDE_MODELS = {
  // Claude Haiku 4.5. Still accepts sampling parameters, forced tool_choice
  // and `budget_tokens` thinking, but NOT `output_config.effort` (a 400).
  fast: "claude-haiku-4-5-20251001" as const,
  // Claude Sonnet 5.5 (same price, context and tokenizer as the Sonnet 5 it
  // replaced). What the quality routes are built around:
  //   - Forced `tool_choice` ({type:"tool"} / {type:"any"}) returns a 400.
  //     Routes send `auto` + `strict: true` tools, say in the prompt when
  //     the tool applies, and retry once when no call comes back.
  //   - Thinking can't be turned off: `{type:"disabled"}` and
  //     `budget_tokens` are both a 400 (`{type:"between_tools"}` is the
  //     lowest setting). Adaptive thinking runs when `thinking` is omitted
  //     and its tokens count against `max_tokens`, so budgets need headroom.
  //   - Effort is recalibrated against Sonnet 5 and defaults to `high`.
  //     Every quality request sets `output_config.effort` itself: `medium`
  //     where the user is waiting on a quick parse, `high` for analysis.
  //   - A thinking block is signed over the conversation before it. A retry
  //     turn must replay the assistant content unchanged and only append —
  //     an edited system prompt, tool list or earlier message can be a 400.
  //   - Longer notes between tool calls come back as `thinking` blocks
  //     (empty text by default), so read `tool_use` blocks by type and never
  //     assume a `text` block exists.
  //   - `temperature`/`top_p`/`top_k` return a 400 when set to anything but
  //     the default — `temperature: 0` included.
  //   - It declines in more categories (`stop_reason: "refusal"`), which
  //     `_shared/claude-call.ts` turns into a clear 422.
  quality: "claude-sonnet-5-5" as const,
  // Claude Opus 5.5. Differs from the Opus 5 this replaced in ways the
  // premium routes are built around:
  //   - Forced `tool_choice` ({type:"tool"} / {type:"any"}) returns a 400.
  //     Routes use `auto` + `strict: true` tools + one retry instead.
  //   - Thinking can't be disabled, and its tokens count against
  //     `max_tokens`. Effort is the only control and defaults to `medium`
  //     (Opus 5 defaulted to `high`), so every premium request sets it.
  //   - Sampling parameters stay removed (400), as on Opus 4.7 onwards.
  premium: "claude-opus-5-5" as const,
} as const;

export type ClaudeModelId = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

/**
 * Models that reject a forced `tool_choice` with a 400. Shared retry code
 * checks this before forcing the structured tool on a follow-up turn, so a
 * future tier bump onto such a model degrades to `auto` instead of failing.
 */
const REJECTS_FORCED_TOOL_CHOICE: ReadonlySet<string> = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-fable-5-1",
  "claude-mythos-5-1",
]);

export function rejectsForcedToolChoice(model: string): boolean {
  return REJECTS_FORCED_TOOL_CHOICE.has(model);
}

/**
 * Dynamic-filtering web search. Supported on Opus 4.6+ and Sonnet 4.6+
 * (Sonnet 5.5 and Opus 5.5 included) — every tier that declares it (quality and premium). It filters results in a
 * server-side code-execution step before they enter the context, so the
 * response can carry extra server-tool blocks; routes that replay a prior
 * assistant turn must keep declaring this tool. An errored search comes back
 * as a `web_search_tool_result` whose `content` is an error OBJECT, not an
 * array — branch on `Array.isArray` before reading results.
 */
export const WEB_SEARCH_TOOL = {
  type: "web_search_20260209" as const,
  name: "web_search" as const,
  max_uses: 5,
};
