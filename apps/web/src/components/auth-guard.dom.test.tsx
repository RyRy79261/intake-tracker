// @vitest-environment jsdom
/**
 * Native (Capacitor) Bearer validation in useAuth (audit native-android#5).
 *
 * Only an explicit 401/403 from /api/auth/validate means the token is dead.
 * A 5xx (Neon Auth outage → 503) or a network error while offline must keep
 * the token and retry once the network is back, otherwise the root-mounted
 * sync lifecycle stays off until the app is relaunched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const apiFetchMock = vi.fn<(path: string) => Promise<Response>>();
const clearAuthTokenMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: null, isPending: false, error: null }),
}));

vi.mock("@/lib/api-fetch", () => ({
  isCapacitorMode: () => true,
  getAuthToken: () => "stored-token",
  clearAuthToken: () => clearAuthTokenMock(),
  apiFetch: (path: string) => apiFetchMock(path),
}));

const syncMedicationNotifications = vi.fn(async () => undefined);
vi.mock("@/lib/local-notifications", () => ({
  syncMedicationNotifications: () => syncMedicationNotifications(),
}));

import { useAuth } from "@/components/auth-guard";
import {
  suspendReminders,
  areRemindersSuspended,
} from "@/lib/reminder-suspension";

function validReply(): Response {
  return new Response(
    JSON.stringify({ user: { id: "user-1", email: "owner@example.test" } }),
    { status: 200 },
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
  clearAuthTokenMock.mockReset();
  syncMedicationNotifications.mockClear();
  localStorage.clear();
});

describe("useAuth reminder resume (audit native-android#8)", () => {
  it("re-enables and reschedules reminders suspended at sign-out once signed in", async () => {
    suspendReminders();
    apiFetchMock.mockResolvedValue(validReply());
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    await waitFor(() =>
      expect(syncMedicationNotifications).toHaveBeenCalledTimes(1),
    );
    expect(areRemindersSuspended()).toBe(false);
  });

  it("does not reschedule when reminders were never suspended", async () => {
    apiFetchMock.mockResolvedValue(validReply());
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(syncMedicationNotifications).not.toHaveBeenCalled();
  });
});

describe("useAuth native token validation", () => {
  it("authenticates with a valid token", async () => {
    apiFetchMock.mockResolvedValue(validReply());
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    expect(clearAuthTokenMock).not.toHaveBeenCalled();
  });

  it("clears the token on an explicit 401", async () => {
    apiFetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(clearAuthTokenMock).toHaveBeenCalledTimes(1));
    expect(result.current.authenticated).toBe(false);
  });

  it("clears the token on a 403 (whitelist denial)", async () => {
    apiFetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    renderHook(() => useAuth());
    await waitFor(() => expect(clearAuthTokenMock).toHaveBeenCalledTimes(1));
  });

  it("keeps the token on a 503 and retries when the network comes back", async () => {
    apiFetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(validReply());
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.authenticated).toBe(false);
    expect(clearAuthTokenMock).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.authenticated).toBe(true));
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(clearAuthTokenMock).not.toHaveBeenCalled();
  });

  it("keeps the token after an offline fetch failure and retries on 'online'", async () => {
    apiFetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(validReply());
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(clearAuthTokenMock).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.authenticated).toBe(true));
    expect(clearAuthTokenMock).not.toHaveBeenCalled();
  });

  it("still retries when the effect re-runs while the first validate is in flight", async () => {
    // StrictMode (and any dep change) disposes the first effect run before
    // its request settles. That run's failure must not strand the hook with
    // no retry scheduled.
    apiFetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(validReply());
    const { result } = renderHook(() => useAuth(), { reactStrictMode: true });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.authenticated).toBe(true));
    expect(clearAuthTokenMock).not.toHaveBeenCalled();
  });
});
