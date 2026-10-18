/**
 * The AI task module at its interface: a spec, `aiRoute`, and the fake
 * Claude port. Covers the pipeline every AI route shares (rate limit, body
 * and schema checks, early replies, key errors, the tool follow-up, the
 * search gate, output checks) and its one error table. Per-route choices
 * (tier, budget, deadline) are pinned in __tests__/ai-tier-policy.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

vi.mock("@/lib/auth-middleware", () => ({
  withAuth:
    (
      handler: (ctx: {
        request: NextRequest;
        auth: { success: true; userId: string; email: string };
      }) => Promise<Response>,
    ) =>
    (request: NextRequest) =>
      handler({ request, auth: { success: true, userId: "user-1", email: "u@example.test" } }),
}));

vi.mock("@/lib/server/claude-client", () => ({
  getClaudeClientForUser: vi.fn(async () => {
    throw new Error("the real port must not be used in this test");
  }),
}));

vi.mock("@/app/api/ai/_shared/usage-tracker", () => ({
  recordUsage: vi.fn(),
  tokensFromAnthropic: vi.fn(() => ({})),
}));

import { aiRoute, reply, zodOutput, type AiTaskSpec } from "@/app/api/ai/_shared/ai-task";
import { createFakeClaude, fakeBlocks, type FakeReply } from "@/app/api/ai/_shared/claude-port";
import { NoAiKeyError } from "@/lib/ai-key-resolver";

const TOOL = {
  name: "echo_result",
  description: "Return the answer.",
  input_schema: { type: "object" as const, properties: { value: { type: "number" } } },
} satisfies Anthropic.Messages.Tool;

const Request = z.object({ q: z.string().min(1), search: z.boolean().optional() });

function spec(
  overrides: Partial<AiTaskSpec<z.infer<typeof Request>, { value: number }, unknown>> = {},
): AiTaskSpec<z.infer<typeof Request>, { value: number }, unknown> {
  return {
    route: "/api/ai/test",
    rateLimit: 100,
    request: Request,
    tier: "quality",
    maxTokens: 4096,
    tool: TOOL,
    retryInstruction: "Use the tool now.",
    search: ({ search }) =>
      search
        ? { mode: "required", insist: "Search first.", message: "Could not verify it." }
        : { mode: "off" },
    prompt: ({ q }) => (q === "empty" ? reply(400, { error: "Empty" }) : { system: "sys", user: `Q: ${q}` }),
    output: zodOutput(z.object({ value: z.number().max(10) })),
    respond: (out, { searched }) =>
      out.value === 0 ? reply(404, { error: "Nothing", code: "NOT_FOUND" }) : { ...out, searched },
    messages: { failed: "Failed to test" },
    ...overrides,
  };
}

function post(body: unknown, raw = false) {
  return new NextRequest("https://example.test/api/ai/test", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const tool = (value: unknown): FakeReply => ({ content: [fakeBlocks.toolUse(TOOL.name, { value })] });
const prose: FakeReply = { content: [fakeBlocks.text("no tool here")] };
const searchedTool = (value: unknown): FakeReply => ({
  content: [fakeBlocks.searchResult(), fakeBlocks.toolUse(TOOL.name, { value })],
});

async function run(replies: FakeReply[], body: unknown = { q: "x" }, s = spec(), opts = {}) {
  const fake = createFakeClaude(replies, opts);
  const res = await aiRoute(s, 60, fake.port)(post(body));
  return { res, json: (await res.json()) as Record<string, unknown>, fake };
}

describe("aiRoute", () => {
  it("answers with the mapped output", async () => {
    const { res, json, fake } = await run([tool(3)]);
    expect(res.status).toBe(200);
    expect(json).toEqual({ value: 3, searched: false });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]!.messages).toEqual([{ role: "user", content: "Q: x" }]);
    expect(fake.requests[0]!.system).toBe("sys");
  });

  it("rate-limits per user with 429 RATE_LIMITED", async () => {
    const fake = createFakeClaude([tool(1), tool(1)]);
    const POST = aiRoute(spec({ rateLimit: 1 }), 60, fake.port);
    expect((await POST(post({ q: "x" }))).status).toBe(200);
    const limited = await POST(post({ q: "x" }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("answers 400 for a non-JSON body or a body that fails the schema, without calling Claude", async () => {
    const fake = createFakeClaude([]);
    const POST = aiRoute(spec(), 60, fake.port);
    expect((await POST(post("{not json", true))).status).toBe(400);
    expect((await POST(post({ q: "" }))).status).toBe(400);
    expect(fake.requests).toHaveLength(0);
  });

  it("lets the prompt answer early, without calling Claude", async () => {
    const { res, json, fake } = await run([], { q: "empty" });
    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Empty" });
    expect(fake.requests).toHaveLength(0);
  });

  it("maps a missing key to 402 NO_AI_KEY", async () => {
    const { res, json } = await run([], { q: "x" }, spec(), {
      connectError: new NoAiKeyError("anthropic"),
    });
    expect(res.status).toBe(402);
    expect(json.code).toBe("NO_AI_KEY");
  });

  it("asks once more for the tool when the first reply is prose, on an unforced append-only turn", async () => {
    const { res, fake } = await run([prose, tool(2)]);
    expect(res.status).toBe(200);
    expect(fake.requests).toHaveLength(2);
    const retry = fake.requests[1]!;
    expect(retry.tool_choice).toEqual({ type: "auto" });
    expect(retry.messages.at(-1)).toEqual({ role: "user", content: "Use the tool now." });
  });

  it("answers 502 AI_BAD_OUTPUT when no tool call ever comes back", async () => {
    const { res, json } = await run([prose, prose]);
    expect(res.status).toBe(502);
    expect(json).toMatchObject({ code: "AI_BAD_OUTPUT", fallbackToManual: true });
  });

  it("answers 502 AI_BAD_OUTPUT when the tool output fails the output check", async () => {
    const { res, json } = await run([tool(99)]);
    expect(res.status).toBe(502);
    expect(json.code).toBe("AI_BAD_OUTPUT");
  });

  it("lets respond answer otherwise (a 404)", async () => {
    const { res, json } = await run([tool(0)]);
    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
  });

  it("answers a refusal with 422 AI_REFUSED and the manual fallback", async () => {
    const { res, json } = await run([{ stop_reason: "refusal", content: [] }]);
    expect(res.status).toBe(422);
    expect(json).toMatchObject({ code: "AI_REFUSED", fallbackToManual: true });
  });

  it("uses the spec's own refusal and truncation wording when it has one", async () => {
    const s = spec({ messages: { failed: "x", refused: "Declined.", truncated: "Cut off." } });
    const refused = await run([{ stop_reason: "refusal", content: [] }], { q: "x" }, s);
    expect(refused.res.status).toBe(422);
    expect(refused.json).toEqual({ error: "Declined.", code: "AI_REFUSED" });

    const cut: FakeReply = { stop_reason: "max_tokens", content: [] };
    const truncated = await run([cut, cut], { q: "x" }, s);
    expect(truncated.res.status).toBe(502);
    expect(truncated.json).toEqual({ error: "Cut off.", code: "RESPONSE_TRUNCATED" });
  });

  it("answers anything unexpected with 502 AI_FAILED and the spec's wording", async () => {
    const { res, json } = await run([new Error("boom")]);
    expect(res.status).toBe(502);
    expect(json).toEqual({ error: "Failed to test", code: "AI_FAILED" });
  });

  it("gives every call the route's deadline: maxDuration less 10 s", async () => {
    const { fake } = await run([tool(1)]);
    const timeout = fake.options[0]!.timeout!;
    expect(timeout).toBeLessThanOrEqual(50_000);
    expect(timeout).toBeGreaterThan(49_000);
  });

  describe("search gate", () => {
    it("accepts an answer backed by a completed search", async () => {
      const { res, json, fake } = await run([searchedTool(4)], { q: "x", search: true });
      expect(res.status).toBe(200);
      expect(json).toEqual({ value: 4, searched: true });
      expect(fake.requests).toHaveLength(1);
      expect(fake.requests[0]!.tools!.map((t) => ("name" in t ? t.name : t.type))).toEqual(["web_search", TOOL.name]);
    });

    it("retries an unsourced answer once on a fresh turn that insists on a search, and takes that answer", async () => {
      const { res, json, fake } = await run([tool(1), searchedTool(5)], { q: "x", search: true });
      expect(res.status).toBe(200);
      expect(json).toEqual({ value: 5, searched: true });
      expect(fake.requests[1]!.messages).toEqual([{ role: "user", content: "Q: x Search first." }]);
    });

    it("refuses with 422 SEARCH_REQUIRED when the retry did not search either", async () => {
      const { res, json } = await run([tool(1), tool(1)], { q: "x", search: true });
      expect(res.status).toBe(422);
      expect(json).toEqual({ error: "Could not verify it.", code: "SEARCH_REQUIRED", fallbackToManual: true });
    });

    it("does not declare web_search when search is off", async () => {
      const { fake } = await run([tool(1)]);
      expect(fake.requests[0]!.tools!.map((t) => ("name" in t ? t.name : t.type))).toEqual([TOOL.name]);
    });
  });
});
