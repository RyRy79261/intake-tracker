/**
 * Tests for the shared stop_reason-aware Claude call.
 *
 * The SDK client is a hand-rolled stub (only `messages.create` is used) and
 * the usage tracker is mocked so each upstream call's bookkeeping can be
 * asserted without a database.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { ToolCallOptions } from "@/app/api/ai/_shared/claude-call";

const recordUsage = vi.fn();
vi.mock("@/app/api/ai/_shared/usage-tracker", () => ({
  recordUsage: (...args: unknown[]) => recordUsage(...args),
  tokensFromAnthropic: () => ({ inputTokens: 1, outputTokens: 1 }),
}));

const {
  createMessage,
  requestToolCall,
  hasCompletedWebSearch,
  AiRefusalError,
  AiTruncatedError,
  AiIncompleteError,
  AiTimeoutError,
} = await import("@/app/api/ai/_shared/claude-call");

const create = vi.fn();
const client = { messages: { create } } as unknown as Anthropic;

const usage = {
  userId: "user-1",
  resolved: { keyOwnerId: null, source: "env_var" as const },
  route: "/api/ai/test",
};

function opts(extra: Record<string, unknown> = {}) {
  return { usage, deadline: Date.now() + 60_000, ...extra };
}

function reply(
  stop_reason: string,
  content: unknown[] = [{ type: "text", text: "hi" }],
  extra: Record<string, unknown> = {},
) {
  return { content, stop_reason, usage: { input_tokens: 1, output_tokens: 1 }, ...extra };
}

const toolUse = { type: "tool_use", id: "t1", name: "result_tool", input: { ok: true } };

const baseParams = {
  model: "claude-sonnet-5",
  max_tokens: 1000,
  messages: [{ role: "user" as const, content: "hello" }],
};

beforeEach(() => {
  create.mockReset();
  recordUsage.mockReset();
});

describe("createMessage", () => {
  it("returns an end_turn reply and records one success row", async () => {
    create.mockResolvedValueOnce(reply("end_turn"));
    const message = await createMessage(client, baseParams, opts());
    expect(message.content).toEqual([{ type: "text", text: "hi" }]);
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage.mock.calls[0]![0]).toMatchObject({
      status: "success",
      model: "claude-sonnet-5",
      route: "/api/ai/test",
    });
  });

  it("passes a per-request timeout drawn from the deadline", async () => {
    create.mockResolvedValueOnce(reply("end_turn"));
    await createMessage(client, baseParams, opts({ deadline: Date.now() + 30_000 }));
    const requestOptions = create.mock.calls[0]![1] as { timeout: number; maxRetries: number };
    expect(requestOptions.timeout).toBeGreaterThan(25_000);
    expect(requestOptions.timeout).toBeLessThanOrEqual(30_000);
    expect(requestOptions.maxRetries).toBe(1);
  });

  it("throws AiTimeoutError without calling upstream once the deadline has passed", async () => {
    await expect(
      createMessage(client, baseParams, opts({ deadline: Date.now() - 1 })),
    ).rejects.toBeInstanceOf(AiTimeoutError);
    expect(create).not.toHaveBeenCalled();
  });

  it("turns a refusal into AiRefusalError carrying the category", async () => {
    create.mockResolvedValueOnce(
      reply("refusal", [], { stop_details: { type: "refusal", category: "bio", explanation: null } }),
    );
    const error = await createMessage(client, baseParams, opts()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiRefusalError);
    expect((error as InstanceType<typeof AiRefusalError>).category).toBe("bio");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries a max_tokens reply once with double the budget", async () => {
    create
      .mockResolvedValueOnce(reply("max_tokens"))
      .mockResolvedValueOnce(reply("end_turn", [toolUse]));
    const message = await createMessage(client, baseParams, opts());
    expect(create).toHaveBeenCalledTimes(2);
    expect((create.mock.calls[1]![0] as { max_tokens: number }).max_tokens).toBe(2000);
    expect(message.content).toEqual([toolUse]);
  });

  it("throws AiTruncatedError when the raised budget is cut off too", async () => {
    create.mockResolvedValue(reply("max_tokens"));
    await expect(createMessage(client, baseParams, opts())).rejects.toBeInstanceOf(
      AiTruncatedError,
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("resumes a pause_turn with the paused content and returns the joined turn", async () => {
    const search = { type: "server_tool_use", id: "s1", name: "web_search", input: {} };
    create
      .mockResolvedValueOnce(reply("pause_turn", [search]))
      .mockResolvedValueOnce(reply("end_turn", [toolUse]));
    const message = await createMessage(client, baseParams, opts());

    const resumed = create.mock.calls[1]![0] as { messages: unknown[] };
    expect(resumed.messages).toEqual([
      ...baseParams.messages,
      { role: "assistant", content: [search] },
    ]);
    expect(message.content).toEqual([search, toolUse]);
  });

  it("gives up with AiIncompleteError once the resume limit is spent", async () => {
    create.mockResolvedValue(reply("pause_turn"));
    await expect(
      createMessage(client, baseParams, opts({ maxResumes: 1 })),
    ).rejects.toBeInstanceOf(AiIncompleteError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("records a failed upstream call as an error row and rethrows", async () => {
    const boom = new Error("overloaded");
    create.mockRejectedValueOnce(boom);
    await expect(createMessage(client, baseParams, opts())).rejects.toBe(boom);
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage.mock.calls[0]![0]).toMatchObject({
      status: "error",
      model: "claude-sonnet-5",
    });
  });
});

describe("requestToolCall", () => {
  const toolOpts = (extra: Partial<ToolCallOptions> = {}): ToolCallOptions => ({
    usage,
    deadline: Date.now() + 60_000,
    toolName: "result_tool",
    retryInstruction: "Call result_tool now.",
    ...extra,
  });

  it("returns the tool call from the first reply without a retry", async () => {
    create.mockResolvedValueOnce(reply("tool_use", [toolUse]));
    const result = await requestToolCall(client, baseParams, toolOpts());
    expect(result.toolUse).toEqual(toolUse);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries with a forced tool_choice on a model that accepts one", async () => {
    create
      .mockResolvedValueOnce(reply("end_turn"))
      .mockResolvedValueOnce(reply("tool_use", [toolUse]));
    const result = await requestToolCall(client, baseParams, toolOpts({ retryMaxTokens: 500 }));

    const retry = create.mock.calls[1]![0] as {
      tool_choice: unknown;
      max_tokens: number;
      messages: unknown[];
    };
    expect(retry.tool_choice).toEqual({ type: "tool", name: "result_tool" });
    expect(retry.max_tokens).toBe(500);
    expect(retry.messages).toEqual([
      ...baseParams.messages,
      { role: "assistant", content: [{ type: "text", text: "hi" }] },
      { role: "user", content: "Call result_tool now." },
    ]);
    expect(result.toolUse).toEqual(toolUse);
    expect(result.responses).toHaveLength(2);
  });

  it("retries on tool_choice auto for Claude Opus 5.5, which rejects forcing", async () => {
    create
      .mockResolvedValueOnce(reply("end_turn"))
      .mockResolvedValueOnce(reply("tool_use", [toolUse]));
    await requestToolCall(
      client,
      { ...baseParams, model: "claude-opus-5-5" },
      toolOpts(),
    );
    const retry = create.mock.calls[1]![0] as { tool_choice: unknown };
    expect(retry.tool_choice).toEqual({ type: "auto" });
  });

  it("never forces the retry when the caller opts out", async () => {
    create
      .mockResolvedValueOnce(reply("end_turn"))
      .mockResolvedValueOnce(reply("tool_use", [toolUse]));
    await requestToolCall(client, baseParams, toolOpts({ forceOnRetry: false }));
    const retry = create.mock.calls[1]![0] as { tool_choice: unknown };
    expect(retry.tool_choice).toEqual({ type: "auto" });
  });

  it("reports no tool call when the retry also answers in prose", async () => {
    create.mockResolvedValue(reply("end_turn"));
    const result = await requestToolCall(client, baseParams, toolOpts());
    expect(result.toolUse).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("hasCompletedWebSearch", () => {
  it("counts only searches that returned an array of results", () => {
    const ok = reply("end_turn", [
      { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result" }] },
    ]) as unknown as Anthropic.Message;
    const errored = reply("end_turn", [
      {
        type: "web_search_tool_result",
        tool_use_id: "s1",
        content: { type: "web_search_tool_result_error", error_code: "unavailable" },
      },
    ]) as unknown as Anthropic.Message;
    expect(hasCompletedWebSearch([ok])).toBe(true);
    expect(hasCompletedWebSearch([errored])).toBe(false);
    expect(hasCompletedWebSearch([errored, ok])).toBe(true);
  });
});
