import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import {
  INSIGHT_TOOL,
  DEEP_SYSTEM_PROMPT,
  buildInsightsPrompt,
  type AnalyticsInsightsRequest,
} from "@intake/ai-prompts/analytics-insights";
// Straight from the SDK-free registry, NOT the claude-client re-export:
// the Capacitor static export stashes out `src/app/api`, and a module
// under `src/lib` that reaches into it dangles when the routes disappear.
import { CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@intake/ai-prompts/models";

/**
 * The single definition of a deep-research insight batch request.
 *
 * Two routes submit one: `/api/analytics/insights/deep` starts the turn,
 * and the polling endpoint resumes it when Anthropic pauses the
 * server-side tool loop. A continuation MUST carry the same model, system
 * prompt and tool set as the turn it continues — a paused turn can end on
 * a `server_tool_use` block whose tool hasn't run yet, and the API rejects
 * a resume request that no longer declares that tool. Building both from
 * here is what keeps them from drifting apart.
 */

/**
 * Output-token ceiling for the whole turn — not just the final answer.
 *
 * Everything the model emits counts against this: each `server_tool_use`
 * block carrying a search query, the running commentary between searches,
 * and the closing `analytics_insight` call. The fast route already needs
 * 2048 for that tool call *alone* (see the note there — 1024 truncated the
 * JSON mid-object), and deep mode asks for strictly more: a longer
 * summary, 4-8 observations instead of 3-6, inline citations, and a
 * `sources` array of up to 30 URLs.
 *
 * At the old 4096 the searches ate the budget the answer needed, the turn
 * stopped with `stop_reason: "max_tokens"` part-way through the tool call,
 * and the job was failed as "cut off" — every time the research ran to any
 * depth. 16384 clears the response schema's own worst case (4000-char
 * summary + 16 × 2000-char observations + 30 URLs ≈ 9-10k tokens) with the
 * search traffic on top. It is a ceiling, not a spend: a short answer
 * still bills short.
 */
export const DEEP_MAX_TOKENS = 16384;

/**
 * Cap web-search invocations so a runaway plan can't fan out. ~12 is enough
 * to cover the 5-7 metric domains the snapshot can contain plus a couple of
 * follow-ups, but not so high it explodes cost.
 */
export const DEEP_WEB_SEARCH_MAX_USES = 12;

/**
 * How many times a paused turn may be resumed before we give up.
 *
 * Each resume is another batch, so this bounds both cost and wall-clock.
 * One is enough for the research depth this prompt asks for; a turn still
 * paused after that is not converging and the user is better served by an
 * honest failure than by an unbounded chain.
 */
export const DEEP_CONTINUATION_LIMIT = 1;

/**
 * Batch `custom_id` for a job's Nth request. Depth is encoded in the id
 * itself so the polling endpoint can tell an original submission from a
 * resumed one without another column to migrate and keep in sync — the
 * value comes back on the result, which is the only place it's read.
 */
export function deepCustomId(jobId: string, depth = 0): string {
  return depth === 0 ? `insight-${jobId}` : `insight-${jobId}-c${depth}`;
}

/** Inverse of {@link deepCustomId}; unknown shapes read as depth 0. */
export function continuationDepth(customId: string | undefined): number {
  if (!customId) return 0;
  const match = /-c(\d+)$/.exec(customId);
  if (!match) return 0;
  const depth = Number(match[1]);
  return Number.isFinite(depth) ? depth : 0;
}

/**
 * Message list for a deep request. The opening user turn is rebuilt from
 * the stored request payload rather than persisted separately, so an
 * assistant turn returned by a paused batch is the only thing a
 * continuation has to carry.
 *
 * Consecutive assistant messages are intentional when more than one turn
 * is passed: the API folds them back into the single turn being resumed.
 */
export function buildDeepMessages(
  payload: AnalyticsInsightsRequest,
  priorAssistantTurns: Anthropic.Messages.ContentBlock[][] = [],
): Anthropic.Messages.MessageParam[] {
  return [
    { role: "user", content: buildInsightsPrompt(payload) },
    ...priorAssistantTurns.map(
      (content): Anthropic.Messages.MessageParam => ({
        role: "assistant",
        content: content as unknown as Anthropic.Messages.ContentBlockParam[],
      }),
    ),
  ];
}

/**
 * The `params` half of a Message Batches request entry.
 *
 * `tool_choice: "auto"` is required, not incidental: forcing
 * `analytics_insight` would stop the model reaching for `web_search`
 * first, and deep mode's whole value is the searches that precede the
 * answer.
 */
export function buildDeepBatchParams(
  payload: AnalyticsInsightsRequest,
  priorAssistantTurns: Anthropic.Messages.ContentBlock[][] = [],
) {
  return {
    model: CLAUDE_MODELS.premium,
    max_tokens: DEEP_MAX_TOKENS,
    // No `temperature`: the premium model rejects a non-default sampling
    // parameter with a 400. This request carried temperature 0.3, so the
    // batch entry errored before the model ever ran — which is what made
    // deep analysis fail every single time.
    system: DEEP_SYSTEM_PROMPT,
    tools: [
      { ...WEB_SEARCH_TOOL, max_uses: DEEP_WEB_SEARCH_MAX_USES },
      INSIGHT_TOOL,
    ],
    tool_choice: { type: "auto" as const },
    messages: buildDeepMessages(payload, priorAssistantTurns),
  };
}
