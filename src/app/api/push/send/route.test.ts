/**
 * Tests for POST /api/push/send — the cron-triggered notification dispatcher.
 *
 * Unlike the other push routes, this handler is NOT wrapped in withAuth; it
 * authenticates via a `Authorization: Bearer <CRON_SECRET>` header. The
 * push-db helpers and the dynamically-imported push-sender are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockSendPush = vi.fn();
vi.mock("@/lib/push-sender", () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
}));

const mockGetAllSubscribedUserIds = vi.fn();
const mockGetUserTimezone = vi.fn();
const mockGetDueNotificationsForUser = vi.fn();
const mockGetFollowUpNotifications = vi.fn();
const mockLogSentNotification = vi.fn();
const mockDeletePushSubscription = vi.fn();
const mockGetSettings = vi.fn();

vi.mock("@/lib/push-db", () => ({
  getAllSubscribedUserIds: (...args: unknown[]) =>
    mockGetAllSubscribedUserIds(...args),
  getUserTimezone: (...args: unknown[]) => mockGetUserTimezone(...args),
  getDueNotificationsForUser: (...args: unknown[]) =>
    mockGetDueNotificationsForUser(...args),
  getFollowUpNotifications: (...args: unknown[]) =>
    mockGetFollowUpNotifications(...args),
  logSentNotification: (...args: unknown[]) => mockLogSentNotification(...args),
  deletePushSubscription: (...args: unknown[]) =>
    mockDeletePushSubscription(...args),
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}));

const DEFAULT_SETTINGS = {
  enabled: true,
  followUpCount: 2,
  followUpIntervalMinutes: 10,
  dayStartHour: 2,
};

function makeDueRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-1",
    endpoint: "https://push.example/endpoint/abc",
    p256dh: "p256dh-value",
    auth_key: "auth-value",
    time_slot: "09:00",
    medications_json: "Aspirin 100mg",
    ...overrides,
  };
}

function makeRequest(token: string | null): NextRequest {
  return new NextRequest("http://localhost/api/push/send", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function callSend(token: string | null) {
  const { POST } = await import("@/app/api/push/send/route");
  return POST(makeRequest(token));
}

describe("POST /api/push/send", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CRON_SECRET = "the-cron-secret";
    mockGetAllSubscribedUserIds.mockResolvedValue(["user-1"]);
    mockGetUserTimezone.mockResolvedValue("UTC");
    mockGetSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockGetDueNotificationsForUser.mockResolvedValue([]);
    mockGetFollowUpNotifications.mockResolvedValue([]);
    mockLogSentNotification.mockResolvedValue(undefined);
    mockDeletePushSubscription.mockResolvedValue(undefined);
    mockSendPush.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects with 401 when no Authorization header is present", async () => {
    const res = await callSend(null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockGetAllSubscribedUserIds).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the bearer token does not match CRON_SECRET", async () => {
    const res = await callSend("wrong-token");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("rejects with 401 when CRON_SECRET env var is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await callSend("anything");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns { sent: 0, followUps: 0 } when nothing is due", async () => {
    const res = await callSend("the-cron-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, followUps: 0 });
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("sends a due notification and counts it", async () => {
    mockGetDueNotificationsForUser.mockResolvedValue([makeDueRow()]);

    const res = await callSend("the-cron-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, followUps: 0 });
    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockLogSentNotification).toHaveBeenCalledWith(
      "user-1",
      "09:00",
      expect.any(String),
      0,
    );
  });

  it("deletes the subscription on a 410 Gone result", async () => {
    mockGetDueNotificationsForUser.mockResolvedValue([makeDueRow()]);
    mockSendPush.mockResolvedValue({ success: false, statusCode: 410 });

    const res = await callSend("the-cron-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, followUps: 0 });
    expect(mockDeletePushSubscription).toHaveBeenCalledWith("user-1");
  });

  it("includes follow-up notifications for the authenticated user only", async () => {
    mockGetFollowUpNotifications
      .mockResolvedValueOnce([
        makeDueRow({ user_id: "someone-else" }),
        makeDueRow({ user_id: "user-1" }),
      ])
      .mockResolvedValue([]);

    const res = await callSend("the-cron-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, followUps: 1 });
    expect(mockSendPush).toHaveBeenCalledTimes(1);
  });

  it("skips follow-ups when settings.enabled is false", async () => {
    mockGetSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, enabled: false });

    const res = await callSend("the-cron-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, followUps: 0 });
    expect(mockGetFollowUpNotifications).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when a dependency throws (no raw error leak)", async () => {
    mockGetAllSubscribedUserIds.mockRejectedValue(
      new Error("DATABASE_URL connection refused at internal.host"),
    );

    const res = await callSend("the-cron-secret");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to send notifications" });
    expect(JSON.stringify(body)).not.toContain("internal.host");
  });
});
