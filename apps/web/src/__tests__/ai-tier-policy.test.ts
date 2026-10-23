/**
 * Tier policy for every AI task route: the model, effort, budget, deadline,
 * search rule and rate limit each one runs with, and the request rules the
 * pinned models impose. Each spec runs through the fake Claude port, so the
 * test reads the requests the module really sends rather than the source.
 *
 * Request rules (Claude Opus 5.5, both tiers; see @intake/ai-prompts/models):
 *   - no `temperature` / `top_p` / `top_k`: any non-default value is a 400
 *     (issue #331 was a total outage of the Opus features from exactly this);
 *   - no `thinking`: it can't be turned off and `budget_tokens` is a 400;
 *   - `tool_choice` is `auto` on every turn: a forced choice is a 400;
 *   - `output_config.effort` is set on every request (defaults differ per
 *     model and were recalibrated), and it is `high`: accuracy first. The
 *     one exception is the medicine lookup at `medium`: the owner judged
 *     Opus 5.5 accurate enough there and wanted it faster (2026-10-22);
 *   - the first turn has at least MIN_MAX_TOKENS, since adaptive thinking
 *     shares the budget.
 *
 * The table pins each route's current choices, so a change to one (#412 →
 * #415 flipped the medicine lookup's effort and back) is a visible, reviewed
 * edit here. The owner's rule: accuracy first, default to Opus, and raise a
 * deadline rather than lower effort.
 *
 * Requests built outside this module (deep insights, bug report) are still
 * guarded by the source scan in premium-model-sampling.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
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

import { CLAUDE_MODELS } from "@intake/ai-prompts/models";
import {
  aiRoute,
  DEADLINE_MARGIN_MS,
  MIN_MAX_TOKENS,
  type AiTaskSpec,
} from "@/app/api/ai/_shared/ai-task";
import { createFakeClaude, fakeBlocks } from "@/app/api/ai/_shared/claude-port";
import { parseTask } from "@/app/api/ai/parse/task";
import { medicineSearchTask } from "@/app/api/ai/medicine-search/task";
import { substanceLookupTask } from "@/app/api/ai/substance-lookup/task";
import { interactionCheckTask } from "@/app/api/ai/interaction-check/task";
import { medicineAboutTask } from "@/app/api/ai/medicine-about/task";
import { titrationWarningsTask } from "@/app/api/ai/titration-warnings/task";
import { nutrientAnalysisTask } from "@/app/api/ai/nutrient-analysis/task";
import { voiceParseTask } from "@/app/api/ai/voice-parse/task";
import { voiceInteractionsTask } from "@/app/api/ai/voice-interactions/task";
import { insightsTask } from "@/app/api/analytics/insights/task";
import * as parseRoute from "@/app/api/ai/parse/route";
import * as medicineSearchRoute from "@/app/api/ai/medicine-search/route";
import * as substanceLookupRoute from "@/app/api/ai/substance-lookup/route";
import * as interactionCheckRoute from "@/app/api/ai/interaction-check/route";
import * as medicineAboutRoute from "@/app/api/ai/medicine-about/route";
import * as titrationWarningsRoute from "@/app/api/ai/titration-warnings/route";
import * as nutrientAnalysisRoute from "@/app/api/ai/nutrient-analysis/route";
import * as voiceParseRoute from "@/app/api/ai/voice-parse/route";
import * as voiceInteractionsRoute from "@/app/api/ai/voice-interactions/route";
import * as insightsRoute from "@/app/api/analytics/insights/route";

const NOW = 1_700_000_000_000;

interface Case {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: AiTaskSpec<any, any, any>;
  maxDuration: number;
  body: unknown;
  tier: "quality" | "premium";
  maxTokens: number;
  retryMaxTokens: number;
  search: "off" | "allowed" | "required";
  rateLimit: number;
  /** Unset: `high`, the default for every route. */
  effort?: "medium";
}

const CASES: Case[] = [
  {
    name: "parse",
    spec: parseTask,
    maxDuration: parseRoute.maxDuration,
    body: { input: "a banana" },
    tier: "quality",
    maxTokens: 8192,
    retryMaxTokens: 4096,
    search: "allowed",
    rateLimit: 20,
  },
  {
    name: "medicine-search",
    spec: medicineSearchTask,
    maxDuration: medicineSearchRoute.maxDuration,
    body: { query: "aspirin" },
    tier: "premium",
    maxTokens: 8192,
    retryMaxTokens: 8192,
    search: "allowed",
    rateLimit: 15,
    effort: "medium",
  },
  {
    name: "substance-lookup (caffeine)",
    spec: substanceLookupTask,
    maxDuration: substanceLookupRoute.maxDuration,
    body: { query: "espresso", type: "caffeine" },
    tier: "quality",
    maxTokens: 4096,
    retryMaxTokens: 4096,
    search: "required",
    rateLimit: 15,
  },
  {
    name: "substance-lookup (alcohol)",
    spec: substanceLookupTask,
    maxDuration: substanceLookupRoute.maxDuration,
    body: { query: "lager", type: "alcohol" },
    tier: "quality",
    maxTokens: 4096,
    retryMaxTokens: 4096,
    search: "allowed",
    rateLimit: 15,
  },
  {
    name: "interaction-check",
    spec: interactionCheckTask,
    maxDuration: interactionCheckRoute.maxDuration,
    body: { mode: "lookup", substance: "coffee", activePrescriptions: [{ genericName: "lisinopril" }] },
    tier: "premium",
    maxTokens: 8192,
    retryMaxTokens: 8192,
    search: "off",
    rateLimit: 5,
  },
  {
    name: "medicine-about",
    spec: medicineAboutTask,
    maxDuration: medicineAboutRoute.maxDuration,
    body: { genericName: "Ramipril" },
    tier: "premium",
    maxTokens: 8192,
    retryMaxTokens: 8192,
    search: "off",
    rateLimit: 5,
  },
  {
    name: "titration-warnings",
    spec: titrationWarningsTask,
    maxDuration: titrationWarningsRoute.maxDuration,
    body: { prescriptions: [{ genericName: "metoprolol", newDosage: "50 mg" }] },
    tier: "premium",
    maxTokens: 8192,
    retryMaxTokens: 8192,
    search: "off",
    rateLimit: 5,
  },
  {
    name: "nutrient-analysis",
    spec: nutrientAnalysisTask,
    maxDuration: nutrientAnalysisRoute.maxDuration,
    body: { windowDays: 7, foods: [{ description: "banana" }] },
    tier: "quality",
    maxTokens: 16000,
    retryMaxTokens: 4096,
    search: "allowed",
    rateLimit: 10,
  },
  {
    name: "voice-parse",
    spec: voiceParseTask,
    maxDuration: voiceParseRoute.maxDuration,
    body: { transcript: "I had a coffee" },
    tier: "quality",
    maxTokens: 4096,
    retryMaxTokens: 4096,
    search: "off",
    rateLimit: 20,
  },
  {
    name: "voice-parse (refresh)",
    spec: voiceParseTask,
    maxDuration: voiceParseRoute.maxDuration,
    body: { transcript: "flat white", kind: "caffeine" },
    tier: "quality",
    maxTokens: 8192,
    retryMaxTokens: 8192,
    search: "required",
    rateLimit: 20,
  },
  {
    name: "voice-interactions",
    spec: voiceInteractionsTask,
    maxDuration: voiceInteractionsRoute.maxDuration,
    body: { transcript: "Can I take ibuprofen?", medications: ["Bisoprolol"] },
    tier: "quality",
    maxTokens: 4096,
    retryMaxTokens: 4096,
    search: "off",
    rateLimit: 20,
  },
  {
    name: "analytics insights",
    spec: insightsTask,
    maxDuration: insightsRoute.maxDuration,
    body: {
      range: { start: NOW - 7 * 86_400_000, end: NOW },
      metrics: { intake: { avgWaterMl: 1800, waterGoalMl: 2500 } },
    },
    tier: "quality",
    maxTokens: 8192,
    retryMaxTokens: 8192,
    search: "off",
    rateLimit: 10,
  },
];

/** Every route's deadline budget, from its exported maxDuration. */
const MAX_DURATIONS: Record<string, number> = {
  parse: 60,
  "medicine-search": 130,
  "substance-lookup (caffeine)": 60,
  "substance-lookup (alcohol)": 60,
  "interaction-check": 60,
  "medicine-about": 60,
  "titration-warnings": 60,
  "nutrient-analysis": 90,
  "voice-parse": 60,
  "voice-parse (refresh)": 60,
  "voice-interactions": 60,
  "analytics insights": 90,
};

/**
 * Run a spec with replies that never call the tool, so every turn the
 * module can send is sent: the first, its tool follow-up, and (search
 * required) the fresh insisting try and its follow-up.
 */
async function capture(c: Case) {
  const prose = { content: [fakeBlocks.text("thinking out loud")] };
  const fake = createFakeClaude([prose, prose, prose, prose]);
  const res = await aiRoute(c.spec, c.maxDuration, fake.port)(
    new NextRequest("https://example.test/api/ai/x", {
      method: "POST",
      body: JSON.stringify(c.body),
      headers: { "content-type": "application/json" },
    }),
  );
  return { res, requests: fake.requests, options: fake.options };
}

const toolNames = (r: Anthropic.Messages.MessageCreateParamsNonStreaming) =>
  (r.tools ?? []).map((t) => ("name" in t ? t.name : t.type));

describe("AI task tier policy", () => {
  it("covers every AI task route", () => {
    expect(new Set(CASES.map((c) => c.spec.route))).toEqual(
      new Set([
        "/api/ai/parse",
        "/api/ai/medicine-search",
        "/api/ai/substance-lookup",
        "/api/ai/interaction-check",
        "/api/ai/medicine-about",
        "/api/ai/titration-warnings",
        "/api/ai/nutrient-analysis",
        "/api/ai/voice-parse",
        "/api/ai/voice-interactions",
        "/api/analytics/insights",
      ]),
    );
  });

  it("pins the model ids", () => {
    expect(CLAUDE_MODELS).toEqual({
      fast: "claude-haiku-4-5-20251001",
      quality: "claude-opus-5-5",
      premium: "claude-opus-5-5",
    });
  });

  describe.each(CASES)("$name", (c) => {
    it("runs on its pinned tier, rate limit and route deadline", async () => {
      expect(c.spec.tier).toBe(c.tier);
      expect(c.spec.rateLimit).toBe(c.rateLimit);
      expect(c.maxDuration).toBe(MAX_DURATIONS[c.name]);
      const { options } = await capture(c);
      const deadline = c.maxDuration * 1000 - DEADLINE_MARGIN_MS;
      expect(options[0]!.timeout).toBeLessThanOrEqual(deadline);
      expect(options[0]!.timeout).toBeGreaterThan(deadline - 1000);
      // Retries are done by the module within the deadline, not by the SDK.
      expect(options.every((o) => o.maxRetries === 0)).toBe(true);
    });

    it("sends only what the pinned model accepts, at its pinned effort, on every turn", async () => {
      const { requests } = await capture(c);
      expect(requests.length).toBe(c.search === "required" ? 4 : 2);
      for (const r of requests) {
        expect(r.model).toBe(CLAUDE_MODELS[c.tier]);
        expect(r.output_config).toEqual({ effort: c.effort ?? "high" });
        expect(r.tool_choice).toEqual({ type: "auto" });
        for (const banned of ["temperature", "top_p", "top_k", "thinking"]) {
          expect(r).not.toHaveProperty(banned);
        }
      }
    });

    it("keeps its token budget", async () => {
      const { requests } = await capture(c);
      expect(c.maxTokens).toBeGreaterThanOrEqual(MIN_MAX_TOKENS);
      expect(requests[0]!.max_tokens).toBe(c.maxTokens);
      expect(requests[1]!.max_tokens).toBe(c.retryMaxTokens);
    });

    it("declares web_search exactly when the route may search, and enforces it when required", async () => {
      const { res, requests } = await capture(c);
      const tool = c.spec.tool.name;
      for (const r of requests) {
        expect(toolNames(r)).toEqual(c.search === "off" ? [tool] : ["web_search", tool]);
      }
      if (c.search === "required") {
        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({ code: "SEARCH_REQUIRED" });
      } else {
        expect(res.status).toBe(502);
        expect(await res.json()).toMatchObject({ code: "AI_BAD_OUTPUT" });
      }
    });
  });
});
