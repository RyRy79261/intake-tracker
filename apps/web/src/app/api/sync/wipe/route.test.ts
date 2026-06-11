/**
 * Tests for POST /api/sync/wipe — deletes the authenticated user's cloud data
 * mirror (synced tables + push subscriptions). withAuth is mocked as a
 * pass-through; the wipeCloudData helper is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockWipeCloudData = vi.fn();
vi.mock("@/lib/user-data-deletion", () => ({
  wipeCloudData: (...args: unknown[]) => mockWipeCloudData(...args),
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

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/sync/wipe", { method: "POST" });
}

async function callWipe() {
  const { POST } = await import("@/app/api/sync/wipe/route");
  return POST(makeRequest());
}

describe("POST /api/sync/wipe", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("wipes the cloud copy for the authenticated user and returns counts", async () => {
    mockWipeCloudData.mockResolvedValue({ intakeRecords: 5, pushSubscriptions: 1 });

    const res = await callWipe();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(mockWipeCloudData).toHaveBeenCalledWith("user-test");
    expect(body.deleted).toEqual({ intakeRecords: 5, pushSubscriptions: 1 });
  });

  it("returns 500 when the wipe fails", async () => {
    mockWipeCloudData.mockRejectedValue(new Error("db down"));

    const res = await callWipe();
    expect(res.status).toBe(500);
  });
});
