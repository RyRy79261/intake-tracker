/**
 * Tests for POST /api/bug-report handler.
 *
 * The route validates a bug/feature report, sanitizes it, optionally lets
 * Claude restructure the prose, then files a GitHub issue via Octokit.
 *
 * Strategy (mirrors sync-push-route.test.ts):
 *   - Mock @/lib/auth-middleware so withAuth is a pass-through HOF injecting
 *     a fixed auth context.
 *   - Mock the Claude client factory (getClaudeClientForUser) so the AI step
 *     is deterministic — it returns a controllable fake Anthropic client.
 *   - Mock @octokit/rest so issue creation is intercepted, and can be made to
 *     throw a RequestError-like error carrying a numeric `status`.
 *   - Mock the usage-tracker so telemetry never touches a real store.
 *   - Drive env vars (GITHUB_TOKEN / GITHUB_REPO) with vi.stubEnv.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Controllable stubs ───────────────────────────────────────────────────

// Content blocks the fake Anthropic client returns from messages.create().
let aiContent: unknown[] = [];
let aiThrows: Error | null = null;
let claudeClientThrows: Error | null = null;
const messagesCreateCalls: unknown[] = [];

// Octokit issues.create behaviour.
let octokitCreateResult: { html_url: string; number: number } = {
  html_url: "https://github.com/RyRy79261/intake-tracker/issues/42",
  number: 42,
};
let octokitCreateError: (Error & { status?: number }) | null = null;
let lastOctokitCreateArgs: Record<string, unknown> | null = null;

function resetState() {
  aiContent = [];
  aiThrows = null;
  claudeClientThrows = null;
  messagesCreateCalls.length = 0;
  octokitCreateResult = {
    html_url: "https://github.com/RyRy79261/intake-tracker/issues/42",
    number: 42,
  };
  octokitCreateError = null;
  lastOctokitCreateArgs = null;
}

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string; email: string };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "user-test", email: "test@example.test" },
      });
  },
}));

vi.mock("@/app/api/ai/_shared/claude-client", () => ({
  CLAUDE_MODELS: { fast: "claude-haiku-test", quality: "claude-sonnet-test" },
  getClaudeClientForUser: async () => {
    if (claudeClientThrows) throw claudeClientThrows;
    return {
      client: {
        messages: {
          create: async (params: unknown) => {
            messagesCreateCalls.push(params);
            if (aiThrows) throw aiThrows;
            return { content: aiContent, usage: { input_tokens: 10, output_tokens: 5 } };
          },
        },
      },
      resolved: { keyOwnerId: "user-test", source: "env" },
    };
  },
}));

vi.mock("@/app/api/ai/_shared/usage-tracker", () => ({
  recordUsage: () => undefined,
  tokensFromAnthropic: () => ({ inputTokens: 10, outputTokens: 5 }),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    rest = {
      issues: {
        create: async (args: Record<string, unknown>) => {
          lastOctokitCreateArgs = args;
          if (octokitCreateError) throw octokitCreateError;
          return { data: octokitCreateResult };
        },
      },
    };
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/bug-report", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "bug",
    description: "The water counter resets to zero when I reload the page.",
    useAi: false,
    diagnostics: { environment: [], errorLogs: [] },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/bug-report", () => {
  beforeEach(() => {
    resetState();
    vi.stubEnv("GITHUB_TOKEN", "ghp-test-token");
    vi.stubEnv("GITHUB_REPO", "RyRy79261/intake-tracker");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("files an issue from a plain template when useAi is false", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; number: number };
    expect(body.url).toBe(
      "https://github.com/RyRy79261/intake-tracker/issues/42",
    );
    expect(body.number).toBe(42);

    // AI must not have been called when useAi is false.
    expect(messagesCreateCalls).toHaveLength(0);
    // Bug reports must carry the bug label set.
    expect(lastOctokitCreateArgs!.labels).toContain("type: bug");
    expect(lastOctokitCreateArgs!.owner).toBe("RyRy79261");
    expect(lastOctokitCreateArgs!.repo).toBe("intake-tracker");
  });

  it("uses Claude's structured output as the issue title when useAi is true", async () => {
    aiContent = [
      {
        type: "tool_use",
        name: "format_bug_report",
        input: {
          title: "Water counter resets on reload",
          summary: "Reloading the page zeroes the daily water total.",
          severity: "high",
        },
      },
    ];

    const { POST } = await import("./route");
    const res = await POST(makeRequest(validBody({ useAi: true })));

    expect(res.status).toBe(200);
    expect(messagesCreateCalls).toHaveLength(1);
    // The AI-supplied title should win over the raw first-line fallback.
    expect(lastOctokitCreateArgs!.title).toBe("Water counter resets on reload");
    expect(String(lastOctokitCreateArgs!.body)).toContain(
      "Reloading the page zeroes the daily water total.",
    );
  });

  it("falls back to the plain template when the AI call fails", async () => {
    aiThrows = new Error("anthropic 529 overloaded");

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ ...validBody(), useAi: true }));

    // AI failure is non-fatal — the issue is still filed.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { number: number };
    expect(body.number).toBe(42);
    // Template title is derived from the first line of the description.
    expect(String(lastOctokitCreateArgs!.title)).toContain(
      "The water counter resets",
    );
  });

  it("uses the feature label set for a feature request", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        validBody({ type: "feature", description: "Add a dark theme toggle." }),
      ),
    );

    expect(res.status).toBe(200);
    expect(lastOctokitCreateArgs!.labels).toContain("type: feature");
    expect(lastOctokitCreateArgs!.labels).not.toContain("type: bug");
  });

  it("returns 503 when GITHUB_TOKEN is not configured", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");

    const { POST } = await import("./route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("NO_GITHUB_TOKEN");
    expect(lastOctokitCreateArgs).toBeNull();
  });

  it("returns 400 for a request that fails schema validation", async () => {
    const { POST } = await import("./route");
    // Missing `type` and `useAi`, empty description.
    const res = await POST(
      makeRequest({ description: "", diagnostics: { environment: [], errorLogs: [] } }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
    expect(lastOctokitCreateArgs).toBeNull();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("{ not json"));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid request");
  });

  it("maps a GitHub 401 to a 502 with a BAD_TOKEN code", async () => {
    octokitCreateError = Object.assign(new Error("Bad credentials"), {
      status: 401,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("BAD_TOKEN");
  });

  it("maps a GitHub 403 to a 502 with a NO_ACCESS code", async () => {
    octokitCreateError = Object.assign(new Error("Resource not accessible"), {
      status: 403,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NO_ACCESS");
  });

  it("returns a generic 502 when Octokit throws a non-HTTP error", async () => {
    octokitCreateError = new Error("ECONNRESET socket hang up");

    const { POST } = await import("./route");
    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to file the bug report");
    // The raw network error must not leak to the client.
    expect(JSON.stringify(body)).not.toContain("ECONNRESET");
  });
});
