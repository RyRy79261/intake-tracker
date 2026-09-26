import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { rejectsForcedToolChoice } from "@intake/ai-prompts/models";
import type { ResolvedKey } from "@/lib/ai-key-resolver";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";

/**
 * Shared synchronous Claude call for the `api/ai/**` routes.
 *
 * Every route used to call `client.messages.create` and go straight to
 * `content.find(tool_use)`, so a refusal, a truncated tool call or a paused
 * web-search turn all surfaced as "AI response format invalid" — and the
 * user retried, paying again for the same refusal. This branches on
 * `stop_reason` first:
 *
 *   - `refusal`    → {@link AiRefusalError}, mapped to a clear 422.
 *   - `max_tokens` → one retry with double the budget (up to a ceiling),
 *                    then {@link AiTruncatedError}.
 *   - `pause_turn` → resumed with the paused content (a server-side tool
 *                    loop hit its iteration limit), up to `maxResumes` times.
 *
 * It also records usage for every upstream response — including failed
 * calls, as `status: "error"` rows — and gives each call a per-request
 * timeout drawn from a route-wide deadline, so a slow model call can't run
 * into the platform's function limit and come back as a non-JSON 504.
 */

type MessageParams = Anthropic.Messages.MessageCreateParamsNonStreaming;
type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: "tool_use" }>;

/** The model declined the request (HTTP 200, `stop_reason: "refusal"`). */
export class AiRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(`Model refused the request${category ? ` (${category})` : ""}`);
    this.name = "AiRefusalError";
  }
}

/** Output hit `max_tokens` even after the budget was raised. */
export class AiTruncatedError extends Error {
  constructor() {
    super("Model response was cut off at max_tokens");
    this.name = "AiTruncatedError";
  }
}

/** A paused server-tool turn was still paused after every allowed resume. */
export class AiIncompleteError extends Error {
  constructor() {
    super("Model turn was still paused after the resume limit");
    this.name = "AiIncompleteError";
  }
}

/** The route-wide deadline ran out before the next upstream call. */
export class AiTimeoutError extends Error {
  constructor() {
    super("AI request ran out of time");
    this.name = "AiTimeoutError";
  }
}

export interface UsageContext {
  userId: string;
  resolved: Pick<ResolvedKey, "keyOwnerId" | "source">;
  route: string;
}

export interface CallOptions {
  usage: UsageContext;
  /**
   * Absolute epoch-ms deadline shared by every upstream call this request
   * makes. Each call's SDK timeout is whatever is left of it. Set it a few
   * seconds under the route's `maxDuration` so the route can still answer.
   */
  deadline: number;
  /** SDK retries per upstream call (429/5xx/connection). Defaults to 1. */
  maxRetries?: number;
  /** Largest `max_tokens` a truncated response may be retried with. */
  maxTokensCeiling?: number;
  /** How many times a `pause_turn` may be resumed. Defaults to 2. */
  maxResumes?: number;
}

/** Don't start an upstream call with less than this left on the deadline. */
const MIN_ATTEMPT_MS = 2_000;
const DEFAULT_MAX_TOKENS_CEILING = 32_000;
const DEFAULT_MAX_RESUMES = 2;

/**
 * One logical Claude call: a `messages.create` plus whatever resumes and
 * budget retries its `stop_reason` calls for. The returned message's
 * `content` spans every resumed segment, so a caller can scan it (or replay
 * it as the assistant turn of a follow-up) exactly as if it were one reply.
 */
export async function createMessage(
  client: Anthropic,
  params: MessageParams,
  opts: CallOptions,
): Promise<Anthropic.Message> {
  const ceiling = Math.max(params.max_tokens, opts.maxTokensCeiling ?? DEFAULT_MAX_TOKENS_CEILING);
  const maxResumes = opts.maxResumes ?? DEFAULT_MAX_RESUMES;

  let request = params;
  let paused: Anthropic.Messages.ContentBlock[] = [];
  let resumes = 0;
  let grewBudget = false;

  for (;;) {
    const remaining = opts.deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) throw new AiTimeoutError();

    const startedAt = Date.now();
    let message: Anthropic.Message;
    try {
      message = await client.messages.create(request, {
        timeout: remaining,
        maxRetries: opts.maxRetries ?? 1,
      });
    } catch (error) {
      recordUsage({
        userId: opts.usage.userId,
        keyOwnerId: opts.usage.resolved.keyOwnerId,
        keySource: opts.usage.resolved.source,
        provider: "anthropic",
        model: request.model,
        route: opts.usage.route,
        status: "error",
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
    recordUsage({
      userId: opts.usage.userId,
      keyOwnerId: opts.usage.resolved.keyOwnerId,
      keySource: opts.usage.resolved.source,
      provider: "anthropic",
      model: request.model,
      route: opts.usage.route,
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(message.usage),
    });

    switch (message.stop_reason) {
      case "refusal":
        throw new AiRefusalError(message.stop_details?.category ?? null);

      case "max_tokens":
        if (!grewBudget && request.max_tokens < ceiling) {
          grewBudget = true;
          request = { ...request, max_tokens: Math.min(ceiling, request.max_tokens * 2) };
          continue;
        }
        throw new AiTruncatedError();

      case "pause_turn":
        if (resumes >= maxResumes) throw new AiIncompleteError();
        resumes++;
        // Resume by sending the paused content back as the assistant turn;
        // the API picks the server-tool loop up where it stopped. The turn
        // grows append-only, which keeps replayed thinking blocks valid.
        paused = [...paused, ...message.content];
        request = {
          ...request,
          messages: [...params.messages, { role: "assistant", content: paused }],
        };
        continue;

      default:
        return paused.length > 0
          ? { ...message, content: [...paused, ...message.content] }
          : message;
    }
  }
}

export function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  toolName: string,
): ToolUseBlock | undefined {
  return content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === toolName,
  );
}

export interface ToolCallOptions extends CallOptions {
  /** The structured-result tool the route needs a call to. */
  toolName: string;
  /** User turn appended when the first reply didn't call the tool. */
  retryInstruction: string;
  /** `max_tokens` for the retry turn. Defaults to the first request's. */
  retryMaxTokens?: number;
  /**
   * Force the tool on the retry turn via `tool_choice` (default true).
   * Premium routes pass false: Claude Opus 5.5 rejects a forced tool_choice,
   * and saying so at the call site keeps them safe even if the model check
   * below doesn't know a future premium id.
   */
  forceOnRetry?: boolean;
}

export interface ToolCallResult {
  toolUse: ToolUseBlock | undefined;
  /** Every final response, in order (one, or two when the retry ran). */
  responses: Anthropic.Message[];
}

/**
 * {@link createMessage}, then one retry if the reply didn't call `toolName`.
 *
 * The retry carries the first reply as the assistant turn (so earlier
 * `server_tool_use` blocks stay valid — which is why the request's `tools`
 * must still declare web_search) and asks for the tool. It forces the tool
 * via `tool_choice` only where the model accepts that: Claude Opus 5.5
 * rejects a forced tool_choice with a 400, so there the retry stays on
 * `auto` and relies on the instruction plus the tool's `strict` schema.
 */
export async function requestToolCall(
  client: Anthropic,
  params: MessageParams,
  opts: ToolCallOptions,
): Promise<ToolCallResult> {
  const first = await createMessage(client, params, opts);
  const toolUse = findToolUse(first.content, opts.toolName);
  if (toolUse) return { toolUse, responses: [first] };

  const forced = (opts.forceOnRetry ?? true) && !rejectsForcedToolChoice(params.model);
  const retry = await createMessage(
    client,
    {
      ...params,
      max_tokens: opts.retryMaxTokens ?? params.max_tokens,
      tool_choice: forced
        ? { type: "tool", name: opts.toolName }
        : { type: "auto" },
      messages: [
        ...params.messages,
        ...(first.content.length > 0
          ? [{ role: "assistant" as const, content: first.content }]
          : []),
        { role: "user", content: opts.retryInstruction },
      ],
    },
    opts,
  );
  return {
    toolUse: findToolUse(retry.content, opts.toolName),
    responses: [first, retry],
  };
}

/**
 * Did any response run a web search that actually returned results? An
 * errored search's `content` is an error object, not an array.
 */
export function hasCompletedWebSearch(responses: Anthropic.Message[]): boolean {
  return responses.some((r) =>
    r.content.some(
      (b) =>
        b.type === "web_search_tool_result" &&
        Array.isArray(b.content) &&
        b.content.length > 0,
    ),
  );
}
