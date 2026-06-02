/**
 * Tests for POST /api/account/delete — scrubs all server-side data for the
 * authenticated user. withAuth is mocked as a pass-through; the
 * deleteAllUserData helper is mocked so we assert the route contract only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDeleteAllUserData = vi.fn();
vi.mock("@/lib/user-data-deletion", () => ({
  deleteAllUserData: (...args: unknown[]) => mockDeleteAllUserData(...args),
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
  return new NextRequest("http://localhost/api/account/delete", {
    method: "POST",
  });
}

async function callDelete() {
  const { POST } = await import("@/app/api/account/delete/route");
  return POST(makeRequest());
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("scrubs the authenticated user's data and returns the counts", async () => {
    mockDeleteAllUserData.mockResolvedValue({
      intakeRecords: 3,
      pushSubscriptions: 1,
      userApiKeys: 1,
    });

    const res = await callDelete();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(mockDeleteAllUserData).toHaveBeenCalledWith("user-test");
    expect(body.deleted).toEqual({
      intakeRecords: 3,
      pushSubscriptions: 1,
      userApiKeys: 1,
    });
  });

  it("returns 500 when deletion fails", async () => {
    mockDeleteAllUserData.mockRejectedValue(new Error("db down"));

    const res = await callDelete();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed/i);
  });
});
