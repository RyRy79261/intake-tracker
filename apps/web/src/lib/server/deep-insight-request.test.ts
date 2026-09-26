/**
 * Tests for the deep-insight batch request builder — the request surface the
 * premium model sees, independent of the route that submits it.
 */
import { describe, it, expect, vi } from "vitest";
import type * as AnalyticsInsightsMod from "@intake/ai-prompts/analytics-insights";
import type { AnalyticsInsightsRequest } from "@intake/ai-prompts/analytics-insights";

vi.mock("@intake/ai-prompts/analytics-insights", async (importOriginal) => ({
  ...(await importOriginal<typeof AnalyticsInsightsMod>()),
  buildInsightsPrompt: () => "prompt",
}));

const payload = {} as AnalyticsInsightsRequest;

describe("buildDeepBatchParams", () => {
  it("sets effort explicitly — Claude Opus 5.5 defaults to medium, not high", async () => {
    const { buildDeepBatchParams } = await import("@/lib/server/deep-insight-request");
    expect(buildDeepBatchParams(payload).output_config).toEqual({ effort: "high" });
  });

  it("declares the dynamic-filtering web search and never forces a tool", async () => {
    const { buildDeepBatchParams } = await import("@/lib/server/deep-insight-request");
    const params = buildDeepBatchParams(payload);

    expect(params.tools[0]).toMatchObject({ type: "web_search_20260209", name: "web_search" });
    expect(params.tool_choice).toEqual({ type: "auto" });
    expect(params).not.toHaveProperty("temperature");
  });
});
