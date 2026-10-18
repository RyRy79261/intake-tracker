import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { withAuth } from "@/lib/auth-middleware";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, rateLimitKey } from "@/app/api/_shared/rate-limit";
import { CLAUDE_MODELS, WEB_SEARCH_TOOL } from "@/app/api/ai/_shared/claude-client";
import {
  AiRefusalError,
  AiTruncatedError,
  hasCompletedWebSearch,
  requestToolCall,
} from "@/app/api/ai/_shared/claude-call";
import { aiErrorResponse } from "@/app/api/ai/_shared/ai-error-response";
import { realClaudePort, type ClaudePort } from "@/app/api/ai/_shared/claude-port";

/**
 * One AI task module for the `api/ai/**` routes and `api/analytics/insights`.
 *
 * A route declares an {@link AiTaskSpec} (request schema, prompt, result
 * tool, tier, token budget, search rule, output reader, response mapping)
 * and exports `POST = aiRoute(spec, maxDuration)`. This module runs the
 * rest, the same way for every route:
 *
 *   rate limit → JSON body → request schema → prompt → key → Claude call
 *   (one deadline, retries, tool follow-up) → search gate → output check →
 *   response, with every failure answered from one error table.
 *
 * `export const maxDuration` stays a literal in each route file: Next.js
 * reads it statically. The route passes the same constant in, and the task
 * deadline is {@link DEADLINE_MARGIN_MS} under it, so a slow model call ends
 * in a JSON 504 rather than the platform's own non-JSON one.
 */

// ── Tier policy ──────────────────────────────────────────────────────────

export type AiTier = "quality" | "premium";

/**
 * What a tier means for a request. Both tiers are Claude Opus 5.5 today
 * (see @intake/ai-prompts/models), so the rules are the same: accuracy
 * first, so effort is `high`, set explicitly (Opus 5.5 defaults to
 * medium); `tool_choice` is `auto` (a forced choice is a 400) and the
 * follow-up turn is not forced either; no `temperature`/`top_p`/`top_k`
 * and no `thinking` (each a 400, adaptive thinking is always on); and a
 * budget of at least {@link MIN_MAX_TOKENS}, because thinking shares it.
 * The tier-policy test pins these per route.
 */
export const TIER_POLICY = {
  quality: { effort: "high" },
  premium: { effort: "high" },
} as const satisfies Record<AiTier, { effort: "low" | "medium" | "high" }>;

/** Smallest first-turn `max_tokens` that leaves room for adaptive thinking. */
export const MIN_MAX_TOKENS = 4096;

/** The task deadline stops this far short of the route's maxDuration. */
export const DEADLINE_MARGIN_MS = 10_000;

// ── Spec ─────────────────────────────────────────────────────────────────

/** A reply a spec hands back instead of carrying on (a 400, a 404 …). */
export interface AiReply {
  readonly reply: true;
  status: number;
  body: Record<string, unknown>;
}

export function reply(status: number, body: Record<string, unknown>): AiReply {
  return { reply: true, status, body };
}

function isReply(value: unknown): value is AiReply {
  return typeof value === "object" && value !== null && (value as AiReply).reply === true;
}

export interface AiPrompt {
  system: string;
  user: string;
}

/** Whether a request may, or must, search the web. */
export type SearchRule =
  | { mode: "off" }
  | { mode: "allowed" }
  /**
   * The answer must come from a completed web search. A reply without one
   * gets one fresh try with `insist` appended to the user message; still
   * none and the task answers 422 SEARCH_REQUIRED with `message`.
   */
  | { mode: "required"; insist: string; message: string };

export type OutputRead<Out> = { ok: true; value: Out } | { ok: false; detail: string };

export interface AiTaskSpec<Req, Out, Res> {
  /** The route path, for usage rows and logs. */
  route: string;
  /** Requests per minute per user. */
  rateLimit: number;
  request: z.ZodType<Req>;
  tier: AiTier;
  /** First-turn `max_tokens` (the shared helper doubles it once on a cut-off). */
  maxTokens: number | ((req: Req) => number);
  /** `max_tokens` for the turn that asks for the tool. Defaults to `maxTokens`. */
  retryMaxTokens?: number;
  /** The strict result tool the model answers through. */
  tool: Anthropic.Messages.Tool;
  /** User turn appended when the first reply didn't call the tool. */
  retryInstruction: string;
  search: SearchRule | ((req: Req) => SearchRule);
  /** Build the prompt, or answer early (input empty after sanitising, say). */
  prompt(req: Req): AiPrompt | AiReply;
  /** Check the tool input. A failure answers 502 AI_BAD_OUTPUT. */
  output(toolInput: unknown, req: Req): OutputRead<Out>;
  /** Map the checked output to the response body, or answer otherwise. */
  respond(out: Out, ctx: { req: Req; searched: boolean }): Res | AiReply;
  /** Wording for this route's failures. */
  messages: {
    /** Anything not in the error table (502 AI_FAILED). */
    failed: string;
    /**
     * A refusal on a route with no manual entry to fall back to (an
     * analysis, a summary). Unset: the shared "enter it manually" text.
     */
    refused?: string;
    /** A cut-off answer, when this route has a better hint than "try again". */
    truncated?: string;
  };
}

/** A zod schema as an output reader, optionally after renaming tool fields. */
export function zodOutput<Out>(
  schema: z.ZodType<Out>,
  map: (toolInput: Record<string, unknown>) => unknown = (x) => x,
): (toolInput: unknown) => OutputRead<Out> {
  return (toolInput) => {
    const raw =
      typeof toolInput === "object" && toolInput !== null
        ? (toolInput as Record<string, unknown>)
        : {};
    const parsed = schema.safeParse(map(raw));
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, detail: JSON.stringify(z.flattenError(parsed.error)) };
  };
}

// ── Error table ──────────────────────────────────────────────────────────

/**
 * Every failure an AI task answers, in one place. Codes the client acts on:
 *
 *   429 RATE_LIMITED       too many requests from this user.
 *   400 (no code)          the request body failed its schema.
 *   402 NO_AI_KEY / 400 KEY_UNREADABLE / 400 INVALID_KEY   key problems,
 *                          from ai-error-response.ts.
 *   422 AI_REFUSED         the model declined; retrying won't help.
 *   422 SEARCH_REQUIRED    the answer could not be sourced from the web.
 *   502 AI_BAD_OUTPUT      the model never called the tool, or its output
 *                          failed the route's schema. Retrying may help.
 *   502 RESPONSE_TRUNCATED / 502 AI_INCOMPLETE / 504 AI_TIMEOUT
 *   502 AI_FAILED          anything else (an upstream 5xx, a bug).
 *
 * 422 means "the AI answered, and the answer can't be used: enter it
 * yourself"; 502 means "the AI call went wrong: try again". Every 422 and
 * AI_BAD_OUTPUT carries `fallbackToManual: true`.
 */
export const AI_TASK_ERRORS = {
  rateLimited: () =>
    NextResponse.json(
      { error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMITED" },
      { status: 429 },
    ),
  searchRequired: (message: string) =>
    NextResponse.json(
      { error: message, code: "SEARCH_REQUIRED", fallbackToManual: true },
      { status: 422 },
    ),
  badOutput: () =>
    NextResponse.json(
      {
        error: "The AI answer could not be read. Try again.",
        code: "AI_BAD_OUTPUT",
        fallbackToManual: true,
      },
      { status: 502 },
    ),
  failed: (message: string) =>
    NextResponse.json({ error: message, code: "AI_FAILED" }, { status: 502 }),
};

function errorResponse(
  error: unknown,
  messages: AiTaskSpec<unknown, unknown, unknown>["messages"],
): NextResponse | null {
  if (error instanceof AiRefusalError && messages.refused) {
    return NextResponse.json(
      { error: messages.refused, code: "AI_REFUSED" },
      { status: 422 },
    );
  }
  if (error instanceof AiTruncatedError && messages.truncated) {
    return NextResponse.json(
      { error: messages.truncated, code: "RESPONSE_TRUNCATED" },
      { status: 502 },
    );
  }
  return aiErrorResponse(error);
}

// ── Runner ───────────────────────────────────────────────────────────────

export interface AiTaskCaller {
  userId: string;
  email: string | undefined;
}

/**
 * Run one task request. `limiter` is per route (made once by
 * {@link aiRoute}); `port` is the Claude adapter.
 */
async function runAiTask<Req, Out, Res>(
  spec: AiTaskSpec<Req, Out, Res>,
  maxDuration: number,
  request: NextRequest,
  caller: AiTaskCaller,
  port: ClaudePort,
  limiter: ReturnType<typeof createRateLimiter>,
): Promise<NextResponse> {
  if (!limiter.check(rateLimitKey(request, caller.userId))) {
    return AI_TASK_ERRORS.rateLimited();
  }

  const json = await parseJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = spec.request.safeParse(json.body);
  if (!parsed.success) {
    return zodErrorResponse(`${spec.route} request invalid`, parsed.error);
  }
  const req = parsed.data;

  const prompt = spec.prompt(req);
  if (isReply(prompt)) return NextResponse.json(prompt.body, { status: prompt.status });

  console.log(`[AUDIT] ${spec.route} from user: ${caller.userId}`);

  const { client, resolved } = await port.connect(caller.userId, caller.email);

  const search = typeof spec.search === "function" ? spec.search(req) : spec.search;
  const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: CLAUDE_MODELS[spec.tier],
    max_tokens: typeof spec.maxTokens === "function" ? spec.maxTokens(req) : spec.maxTokens,
    output_config: { effort: TIER_POLICY[spec.tier].effort },
    system: prompt.system,
    // web_search stays declared on the follow-up turn too: the replayed
    // assistant turn may hold server_tool_use blocks.
    tools: search.mode === "off" ? [spec.tool] : [WEB_SEARCH_TOOL, spec.tool],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: prompt.user }],
  };
  const options = {
    usage: { userId: caller.userId, resolved, route: spec.route },
    deadline: Date.now() + maxDuration * 1000 - DEADLINE_MARGIN_MS,
    toolName: spec.tool.name,
    retryInstruction: spec.retryInstruction,
    ...(spec.retryMaxTokens !== undefined && { retryMaxTokens: spec.retryMaxTokens }),
    // Neither tier accepts a forced tool_choice.
    forceOnRetry: false,
  };

  let { toolUse, responses } = await requestToolCall(client, params, options);
  let searched = hasCompletedWebSearch(responses);

  // Declaring web_search does not make the model use it. An answer from
  // memory gets one fresh try that insists on a search: a fresh turn, not a
  // continuation, since the unsourced answer is being thrown away (and a
  // bare tool_use can't be replayed without a tool_result). The result is
  // then taken from that try only.
  if (search.mode === "required" && !searched) {
    ({ toolUse, responses } = await requestToolCall(
      client,
      { ...params, messages: [{ role: "user", content: `${prompt.user} ${search.insist}` }] },
      options,
    ));
    searched = hasCompletedWebSearch(responses);
    if (!searched) {
      console.warn(`[${spec.route}] answer rejected: no web search completed`);
      return AI_TASK_ERRORS.searchRequired(search.message);
    }
  }

  if (!toolUse) {
    console.error(`[VALIDATION] ${spec.route}: the model never called ${spec.tool.name}`, {
      stopReason: responses.at(-1)?.stop_reason,
    });
    return AI_TASK_ERRORS.badOutput();
  }

  const out = spec.output(toolUse.input, req);
  if (!out.ok) {
    console.error(`[VALIDATION] ${spec.route}: tool output failed validation:`, out.detail);
    return AI_TASK_ERRORS.badOutput();
  }

  const body = spec.respond(out.value, { req, searched });
  if (isReply(body)) return NextResponse.json(body.body, { status: body.status });
  return NextResponse.json(body);
}

/**
 * The route handler for a spec. `maxDuration` is the route's exported
 * literal; `port` is the Claude adapter (the fake one in tests).
 */
export function aiRoute<Req, Out, Res>(
  spec: AiTaskSpec<Req, Out, Res>,
  maxDuration: number,
  port: ClaudePort = realClaudePort,
) {
  const limiter = createRateLimiter(spec.rateLimit);
  return withAuth(async ({ request, auth }) => {
    try {
      return await runAiTask(
        spec,
        maxDuration,
        request,
        { userId: auth.userId!, email: auth.email },
        port,
        limiter,
      );
    } catch (error) {
      const mapped = errorResponse(error, spec.messages);
      if (mapped) return mapped;
      console.error(`[${spec.route}] error:`, error);
      return AI_TASK_ERRORS.failed(spec.messages.failed);
    }
  });
}
