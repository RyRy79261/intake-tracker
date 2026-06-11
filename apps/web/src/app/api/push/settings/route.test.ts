/**
 * Tests for POST /api/push/settings — saves a user's notification settings.
 *
 * withAuth is mocked as a pass-through HOF injecting a fixed auth context;
 * the push-db saveSettings helper is mocked so we can drive happy / error
 * paths without a real database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockSaveSettings = vi.fn();
vi.mock("@/lib/push-db", () => ({
  saveSettings: (...args: unknown[]) => mockSaveSettings(...args),
}));

vi.mock("@/lib/auth-middleware", () => ({
  withAuth:
    (handler: (ctx: { request: NextRequest; auth: unknown }) => Promise<Response>) =>
    async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "user-test", email: "test@example.test" },
      }),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/push/settings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function callSettings(body: unknown) {
  const { POST } = await import("@/app/api/push/settings/route");
  return POST(makeRequest(body));
}

describe("POST /api/push/settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSaveSettings.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves valid settings and returns { ok: true }", async () => {
    const res = await callSettings({
      followUpCount: 3,
      followUpIntervalMinutes: 15,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSaveSettings).toHaveBeenCalledWith("user-test", {
      enabled: true,
      followUpCount: 3,
      followUpIntervalMinutes: 15,
      dayStartHour: 2,
    });
  });

  it("rejects with 400 when followUpCount exceeds the max", async () => {
    const res = await callSettings({
      followUpCount: 11,
      followUpIntervalMinutes: 15,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it("rejects with 400 when followUpIntervalMinutes is below the min", async () => {
    const res = await callSettings({
      followUpCount: 2,
      followUpIntervalMinutes: 0,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it("rejects with 400 when a required field is missing", async () => {
    const res = await callSettings({ followUpCount: 2 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it("rejects with 400 when a numeric field is not an integer", async () => {
    const res = await callSettings({
      followUpCount: 2.5,
      followUpIntervalMinutes: 15,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request");
  });

  it("returns a generic 500 when saveSettings throws (no raw error leak)", async () => {
    mockSaveSettings.mockRejectedValue(
      new Error("postgres write failed at secret.host:5432"),
    );
    const res = await callSettings({
      followUpCount: 2,
      followUpIntervalMinutes: 10,
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to save settings" });
    expect(JSON.stringify(body)).not.toContain("secret.host");
  });
});
