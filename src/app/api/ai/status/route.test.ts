/**
 * Tests for GET /api/ai/status handler.
 *
 * Public, unauthenticated health check. It must report only *whether* server
 * fallback keys are configured (booleans) — never the key values themselves.
 * Each boolean is derived from `!!process.env.X`, so tests toggle the env
 * vars and assert the coerced shape.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const ENV_KEYS = ["DATABASE_URL", "ANTHROPIC_API_KEY", "GROQ_API_KEY"] as const;

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

describe("ai-status-route", () => {
  const original = snapshotEnv();

  afterEach(() => {
    restoreEnv(original);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports all booleans true when every key env var is set", async () => {
    process.env.DATABASE_URL = "postgres://localhost/db";
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret";
    process.env.GROQ_API_KEY = "gsk-secret";
    // NODE_ENV is a read-only typed property — set it via vi.stubEnv.
    vi.stubEnv("NODE_ENV", "test");

    const { GET } = await import("@/app/api/ai/status/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      timestamp: string;
      config: {
        authConfigured: boolean;
        serverAnthropicKeyConfigured: boolean;
        serverGroqKeyConfigured: boolean;
      };
      environment: string;
    };
    expect(body.config).toEqual({
      authConfigured: true,
      serverAnthropicKeyConfigured: true,
      serverGroqKeyConfigured: true,
    });
    expect(body.environment).toBe("test");
    // timestamp must be a valid ISO string.
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("reports false for absent keys", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;

    const { GET } = await import("@/app/api/ai/status/route");
    const res = await GET();

    const body = (await res.json()) as {
      config: {
        authConfigured: boolean;
        serverAnthropicKeyConfigured: boolean;
        serverGroqKeyConfigured: boolean;
      };
    };
    expect(body.config).toEqual({
      authConfigured: false,
      serverAnthropicKeyConfigured: false,
      serverGroqKeyConfigured: false,
    });
  });

  it("never leaks the raw key values, only booleans", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-TOP-SECRET-VALUE";
    process.env.GROQ_API_KEY = "gsk-ANOTHER-SECRET";
    process.env.DATABASE_URL = "postgres://user:pw@host/db";

    const { GET } = await import("@/app/api/ai/status/route");
    const res = await GET();
    const serialized = JSON.stringify(await res.json());

    expect(serialized).not.toContain("TOP-SECRET-VALUE");
    expect(serialized).not.toContain("ANOTHER-SECRET");
    expect(serialized).not.toContain("user:pw@host");
  });

  it("toggles each boolean independently", async () => {
    process.env.DATABASE_URL = "postgres://localhost/db";
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GROQ_API_KEY = "gsk-secret";

    const { GET } = await import("@/app/api/ai/status/route");
    const res = await GET();
    const body = (await res.json()) as {
      config: {
        authConfigured: boolean;
        serverAnthropicKeyConfigured: boolean;
        serverGroqKeyConfigured: boolean;
      };
    };
    expect(body.config.authConfigured).toBe(true);
    expect(body.config.serverAnthropicKeyConfigured).toBe(false);
    expect(body.config.serverGroqKeyConfigured).toBe(true);
  });
});
