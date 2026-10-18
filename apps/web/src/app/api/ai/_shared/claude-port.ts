import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { ResolvedKey } from "@/lib/ai-key-resolver";
import { getClaudeClientForUser } from "@/app/api/ai/_shared/claude-client";
import type { ClaudeClient } from "@/app/api/ai/_shared/claude-call";

/**
 * The seam between an AI task and Claude.
 *
 * `connect` resolves the caller's key and hands back a client. The real
 * adapter builds an Anthropic SDK client; {@link createFakeClaude} answers
 * from a script and records every request, so a test can run a whole task
 * (rate limit, validation, retries, search gate, error table) offline.
 */
export interface ClaudePort {
  connect(userId: string, email: string | undefined): Promise<ClaudeConnection>;
}

export interface ClaudeConnection {
  client: ClaudeClient;
  resolved: Pick<ResolvedKey, "keyOwnerId" | "source">;
}

/** The real adapter: the caller's own, shared or env key (ai-key-resolver). */
export const realClaudePort: ClaudePort = {
  connect: (userId, email) => getClaudeClientForUser(userId, email),
};

type MessageParams = Anthropic.Messages.MessageCreateParamsNonStreaming;

/** One scripted reply: a message (missing fields filled in) or an error to throw. */
export type FakeReply = Partial<Anthropic.Message> | Error;

export interface FakeClaude {
  port: ClaudePort;
  /** Every request the task sent, in order. */
  requests: MessageParams[];
  /** The SDK options sent with each request (`timeout` is the deadline left). */
  options: { timeout?: number; maxRetries?: number }[];
}

/**
 * A fake Claude that answers each request with the next scripted reply.
 * Running out of replies throws, so a test can't pass by accident on a
 * request it didn't expect. `connectError` makes key resolution fail (a
 * NoAiKeyError, say).
 */
export function createFakeClaude(
  replies: FakeReply[],
  { connectError }: { connectError?: Error } = {},
): FakeClaude {
  const queue = [...replies];
  const requests: MessageParams[] = [];
  const options: FakeClaude["options"] = [];
  const client: ClaudeClient = {
    messages: {
      async create(params, opts = {}) {
        requests.push(params);
        options.push(opts);
        const next = queue.shift();
        if (next === undefined) throw new Error("FakeClaude: no reply scripted for this request");
        if (next instanceof Error) throw next;
        return {
          id: `msg_fake_${requests.length}`,
          type: "message",
          role: "assistant",
          model: params.model,
          content: [],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 },
          ...next,
        } as Anthropic.Message;
      },
    },
  };
  return {
    requests,
    options,
    port: {
      async connect() {
        if (connectError) throw connectError;
        return { client, resolved: { keyOwnerId: null, source: "env_var" } };
      },
    },
  };
}

/** Content block helpers for scripted replies. */
export const fakeBlocks = {
  toolUse: (name: string, input: unknown) =>
    ({ type: "tool_use", id: `toolu_${name}`, name, input }) as unknown as Anthropic.ContentBlock,
  text: (text: string) => ({ type: "text", text, citations: null }) as Anthropic.ContentBlock,
  /** A web search that returned results (what the search gate counts). */
  searchResult: () =>
    ({
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_1",
      content: [{ type: "web_search_result", url: "https://example.test", title: "Source" }],
    }) as unknown as Anthropic.ContentBlock,
};
