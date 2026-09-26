/**
 * Tests for /api/mcp/purge — the scheduled clean-up of expired MCP OAuth
 * codes and dead tokens (mcp-server-auth#13).
 *
 * Like /api/push/send it is not behind withAuth: a scheduler calls it with
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends that itself, with
 * GET). purgeExpired is mocked; its SQL is covered by the MCP OAuth
 * integration test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

const mockPurgeExpired = vi.fn();
vi.mock("@/lib/mcp/oauth", () => ({
  purgeExpired: (...args: unknown[]) => mockPurgeExpired(...args),
}));

function makeRequest(method: "GET" | "POST", token?: string): NextRequest {
  return new NextRequest("http://localhost/api/mcp/purge", {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("/api/mcp/purge", () => {
  beforeEach(() => {
    mockPurgeExpired.mockReset();
    mockPurgeExpired.mockResolvedValue(undefined);
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a call without the cron secret", async () => {
    const { GET } = await import("@/app/api/mcp/purge/route");
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
    expect(mockPurgeExpired).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const { POST } = await import("@/app/api/mcp/purge/route");
    const res = await POST(makeRequest("POST", "nope"));
    expect(res.status).toBe(401);
    expect(mockPurgeExpired).not.toHaveBeenCalled();
  });

  it("refuses every call when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("@/app/api/mcp/purge/route");
    const res = await GET(makeRequest("GET", ""));
    expect(res.status).toBe(401);
    expect(mockPurgeExpired).not.toHaveBeenCalled();
  });

  it("purges on an authorised GET (Vercel Cron) or POST", async () => {
    const { GET, POST } = await import("@/app/api/mcp/purge/route");
    expect((await GET(makeRequest("GET", "cron-secret"))).status).toBe(200);
    expect((await POST(makeRequest("POST", "cron-secret"))).status).toBe(200);
    expect(mockPurgeExpired).toHaveBeenCalledTimes(2);
  });

  it("returns a generic 500 when the purge fails", async () => {
    mockPurgeExpired.mockRejectedValue(new Error("db down at secret.host"));
    const { GET } = await import("@/app/api/mcp/purge/route");
    const res = await GET(makeRequest("GET", "cron-secret"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret.host");
  });

  it("is scheduled in vercel.json at most once a day", () => {
    const configPath = resolve(__dirname, "../../../../../vercel.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      crons?: { path: string; schedule: string }[];
    };
    const cron = config.crons?.find((c) => c.path === "/api/mcp/purge");
    expect(cron).toBeDefined();
    // Vercel Hobby rejects any cron that runs more than once a day, which
    // would fail the deployment: minute and hour must be fixed numbers.
    const [minute, hour] = cron!.schedule.split(" ");
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    // Every scheduled path must be a real route.
    for (const c of config.crons ?? []) {
      expect(existsSync(resolve(__dirname, "../../../..", `app${c.path}`, "route.ts"))).toBe(true);
    }
  });
});
