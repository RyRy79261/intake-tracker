import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSendPush = vi.fn();
vi.mock("@/lib/push-sender", () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
}));

const mockGetUserTimezone = vi.fn();
const mockGetDueNotificationsForUser = vi.fn();
const mockGetFollowUpNotifications = vi.fn();
const mockLogSentNotification = vi.fn();
const mockDeletePushSubscription = vi.fn();
const mockGetSettings = vi.fn();

vi.mock("@/lib/push-db", () => ({
  getUserTimezone: (...args: unknown[]) => mockGetUserTimezone(...args),
  getDueNotificationsForUser: (...args: unknown[]) =>
    mockGetDueNotificationsForUser(...args),
  getFollowUpNotifications: (...args: unknown[]) =>
    mockGetFollowUpNotifications(...args),
  logSentNotification: (...args: unknown[]) =>
    mockLogSentNotification(...args),
  deletePushSubscription: (...args: unknown[]) =>
    mockDeletePushSubscription(...args),
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}));

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (handler: Function) => {
    return async (request: NextRequest) => {
      return handler({
        request,
        auth: { success: true, userId: "test-user" },
      });
    };
  },
}));

const DEFAULT_SETTINGS = {
  enabled: true,
  followUpCount: 2,
  followUpIntervalMinutes: 10,
  dayStartHour: 2,
};

function makeDueRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "test-user",
    endpoint: "https://push.example/endpoint/abc",
    p256dh: "p256dh-value",
    auth_key: "auth-value",
    time_slot: "09:00",
    medications_json: "Aspirin 100mg",
    ...overrides,
  };
}

describe("/api/push/check endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetUserTimezone.mockResolvedValue("UTC");
    mockGetSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockGetDueNotificationsForUser.mockResolvedValue([]);
    mockGetFollowUpNotifications.mockResolvedValue([]);
    mockLogSentNotification.mockResolvedValue(undefined);
    mockDeletePushSubscription.mockResolvedValue(undefined);
    mockSendPush.mockResolvedValue({ success: true });
  });

  async function callCheck() {
    const { POST } = await import("@/app/api/push/check/route");
    const request = new NextRequest("http://localhost/api/push/check", {
      method: "POST",
    });
    return POST(request);
  }

  it("returns { nothingDue: true } when no notifications are due", async () => {
    const response = await callCheck();
    const body = await response.json();
    expect(body).toEqual({ nothingDue: true });
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it("sends one notification and returns { sent: 1, followUps: 0 }", async () => {
    mockGetDueNotificationsForUser.mockResolvedValue([makeDueRow()]);
    mockGetFollowUpNotifications.mockResolvedValue([]);

    const response = await callCheck();
    const body = await response.json();

    expect(body).toEqual({ sent: 1, followUps: 0 });
    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockLogSentNotification).toHaveBeenCalledWith(
      "test-user",
      "09:00",
      expect.any(String),
      0
    );
  });

  it("deletes subscription on 410 Gone from sendPush", async () => {
    mockGetDueNotificationsForUser.mockResolvedValue([makeDueRow()]);
    mockSendPush.mockResolvedValue({ success: false, statusCode: 410 });

    const response = await callCheck();
    const body = await response.json();

    expect(mockDeletePushSubscription).toHaveBeenCalledWith("test-user");
    expect(body).toEqual({ nothingDue: true });
  });

  it("includes follow-up notifications in response count", async () => {
    mockGetDueNotificationsForUser.mockResolvedValue([]);
    mockGetFollowUpNotifications
      .mockResolvedValueOnce([makeDueRow()])
      .mockResolvedValueOnce([]);
    mockSendPush.mockResolvedValue({ success: true });

    const response = await callCheck();
    const body = await response.json();

    expect(body).toEqual({ sent: 0, followUps: 1 });
    expect(mockLogSentNotification).toHaveBeenCalledWith(
      "test-user",
      "09:00",
      expect.any(String),
      1
    );
  });

  it("filters follow-up notifications to only the authenticated user", async () => {
    mockGetDueNotificationsForUser.mockResolvedValue([]);
    mockGetFollowUpNotifications
      .mockResolvedValueOnce([
        makeDueRow({ user_id: "other-user" }),
        makeDueRow({ user_id: "test-user" }),
      ])
      .mockResolvedValueOnce([]);

    const response = await callCheck();
    const body = await response.json();

    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ sent: 0, followUps: 1 });
  });

  it("uses withAuth — handler receives auth context", async () => {
    await callCheck();
    expect(mockGetUserTimezone).toHaveBeenCalledWith("test-user");
  });

  it("handles multiple due notifications", async () => {
    mockGetDueNotificationsForUser.mockResolvedValue([
      makeDueRow({ time_slot: "09:00" }),
      makeDueRow({ time_slot: "12:00" }),
    ]);

    const response = await callCheck();
    const body = await response.json();

    expect(body).toEqual({ sent: 2, followUps: 0 });
    expect(mockSendPush).toHaveBeenCalledTimes(2);
    expect(mockLogSentNotification).toHaveBeenCalledTimes(2);
  });

  it("skips follow-ups when settings.enabled is false", async () => {
    mockGetSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, enabled: false });
    mockGetDueNotificationsForUser.mockResolvedValue([makeDueRow()]);
    mockSendPush.mockResolvedValue({ success: true });

    const response = await callCheck();
    const body = await response.json();

    expect(body).toEqual({ sent: 1, followUps: 0 });
    expect(mockGetFollowUpNotifications).not.toHaveBeenCalled();
  });
});
