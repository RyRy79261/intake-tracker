import { describe, it, expect, vi, beforeEach } from "vitest";

const inserted = vi.hoisted(() => ({ values: [] as Array<Record<string, unknown>> }));
vi.mock("@intake/db/client", () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.values.push(v);
        return Promise.resolve();
      },
    }),
  },
}));

import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";

const base = {
  userId: "u",
  keyOwnerId: null,
  keySource: "env_var" as const,
  provider: "anthropic" as const,
  model: "claude-x",
  route: "/api/ai/parse",
  status: "success" as const,
};

describe("usage-tracker (audit ai-routes-models#13)", () => {
  beforeEach(() => {
    inserted.values = [];
  });

  it("reads paid web searches from the Anthropic usage block", () => {
    expect(
      tokensFromAnthropic({
        input_tokens: 10,
        output_tokens: 5,
        server_tool_use: { web_search_requests: 3 },
      }),
    ).toMatchObject({ inputTokens: 10, outputTokens: 5, webSearchRequests: 3 });
    expect(tokensFromAnthropic({ input_tokens: 1, output_tokens: 1 }).webSearchRequests).toBe(0);
  });

  it("stores the web-search count and the batch flag", () => {
    recordUsage({ ...base, webSearchRequests: 4, isBatch: true });
    recordUsage(base);

    expect(inserted.values[0]).toMatchObject({ webSearchRequests: 4, isBatch: true });
    expect(inserted.values[1]).toMatchObject({ webSearchRequests: 0, isBatch: false });
  });
});
