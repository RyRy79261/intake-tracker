/**
 * Tests for GET /api/version handler.
 *
 * The route is a pure env-var reflector: it returns the build version, git
 * SHA, and environment, each with a documented fallback default. These tests
 * mutate process.env per case and restore it afterwards.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const ENV_KEYS = [
  "NEXT_PUBLIC_APP_VERSION",
  "NEXT_PUBLIC_GIT_SHA",
  "NEXT_PUBLIC_VERCEL_ENV",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

describe("version-route", () => {
  const original = snapshotEnv();

  afterEach(() => {
    restoreEnv(original);
    vi.resetModules();
  });

  it("reflects configured env vars verbatim", async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.2.3";
    process.env.NEXT_PUBLIC_GIT_SHA = "abc1234";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";

    const { GET } = await import("@/app/api/version/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: string;
      gitSha: string;
      environment: string;
    };
    expect(body).toEqual({
      version: "1.2.3",
      gitSha: "abc1234",
      environment: "production",
    });
  });

  it("falls back to documented defaults when env vars are absent", async () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    delete process.env.NEXT_PUBLIC_GIT_SHA;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;

    const { GET } = await import("@/app/api/version/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: string;
      gitSha: string;
      environment: string;
    };
    expect(body).toEqual({
      version: "0.0.0",
      gitSha: "local",
      environment: "development",
    });
  });

  it("falls back per-field — set vars keep their value while unset ones default", async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "9.9.9";
    delete process.env.NEXT_PUBLIC_GIT_SHA;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;

    const { GET } = await import("@/app/api/version/route");
    const res = await GET();

    const body = (await res.json()) as {
      version: string;
      gitSha: string;
      environment: string;
    };
    expect(body.version).toBe("9.9.9");
    expect(body.gitSha).toBe("local");
    expect(body.environment).toBe("development");
  });
});
