// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import { useSettingsStore } from "@/stores/settings-store";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * usePushScheduleSync mirrors today's dose schedule to the server so the push
 * cron can send dose reminders. The dose slots come from real IndexedDB rows
 * (through useDailyDoseSchedule); only the network and the auth session are
 * stubbed.
 */

const auth = vi.hoisted(() => ({ authenticated: true }));
const apiFetch = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => new Response("{}")));

vi.mock("@/components/auth-guard", () => ({
  useAuth: () => ({ ready: true, authenticated: auth.authenticated }),
}));
vi.mock("@/lib/api-fetch", () => ({ apiFetch }));

// The native (Capacitor) path: reminders are device-local, no web push.
const native = vi.hoisted(() => ({
  isNative: false,
  display: "granted",
  enabled: true,
  setEnabled: vi.fn(async (_on: boolean) => undefined),
  requestPermissions: vi.fn(async () => ({ display: native.display })),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.isNative },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: { requestPermissions: native.requestPermissions },
}));
vi.mock("@/lib/local-notifications", () => ({
  getNativeRemindersEnabled: () => native.enabled,
  setNativeRemindersEnabled: native.setEnabled,
}));

const push = vi.hoisted(() => ({
  permission: "granted" as NotificationPermission,
  subscribeToPush: vi.fn(async (): Promise<unknown> => ({ endpoint: "https://push.example" })),
  unsubscribeFromPush: vi.fn(async () => true),
}));
vi.mock("@/lib/push-notification-service", async (importOriginal) => ({
  // The real syncPushSchedule builds the schedule and posts it through the
  // mocked apiFetch; only permission and subscription are stubbed.
  ...(await importOriginal<Record<string, unknown>>()),
  isNotificationSupported: () => true,
  requestNotificationPermission: async () => ({ success: true, data: push.permission }),
  subscribeToPush: push.subscribeToPush,
  unsubscribeFromPush: push.unsubscribeFromPush,
}));

import { usePushScheduleSync, useDoseReminderToggle } from "@/hooks/use-push-schedule-sync";
import { resetPushScheduleSyncState } from "@/lib/push-notification-service";
import { decodePushMedications } from "@/lib/push-dispatch";

interface SyncedEntry {
  timeSlot: string;
  dayOfWeek: number;
  medicationsJson: string;
}

function callsTo(url: string) {
  return apiFetch.mock.calls.filter(([u]) => u === url);
}

function syncedEntries(callIndex = 0): SyncedEntry[] {
  const call = callsTo("/api/push/sync-schedule")[callIndex];
  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)).schedules;
}

async function seedMedication(name: string, dosage: number, scheduleTimeUTC = 480) {
  const rx = makePrescription({ genericName: name });
  const phase = makeMedicationPhase(rx.id);
  const schedule = makePhaseSchedule(phase.id, { dosage, scheduleTimeUTC });
  await seedDatabase({
    prescriptions: [rx],
    medicationPhases: [phase],
    phaseSchedules: [schedule],
  });
}

/** Give the live query and the effects a chance to run. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  auth.authenticated = true;
  apiFetch.mockReset();
  apiFetch.mockImplementation(async () => new Response("{}"));
  useSettingsStore.setState(useSettingsStore.getInitialState());
  useSettingsStore.setState({ doseRemindersEnabled: true });
  resetPushScheduleSyncState();
  // syncPushSchedule only sends for a browser that holds a push subscription.
  vi.stubGlobal("PushManager", class {});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => ({ endpoint: "https://push.example" }) },
      }),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The reminder text of an entry (medicationsJson also carries schedule ids). */
function bodyOf(entry: SyncedEntry): string {
  return decodePushMedications(entry.medicationsJson).body;
}

describe("usePushScheduleSync", () => {
  it("syncs today's schedule, expanded to one entry per weekday", async () => {
    await seedMedication("Metoprolol", 50);

    renderHook(() => usePushScheduleSync());

    await waitFor(() => expect(callsTo("/api/push/sync-schedule")).toHaveLength(1));
    const entries = syncedEntries();
    expect(entries.map((e) => e.dayOfWeek).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(new Set(entries.map(bodyOf))).toEqual(new Set(["Metoprolol 50mg"]));
    const body = JSON.parse(String((callsTo("/api/push/sync-schedule")[0]?.[1] as RequestInit).body));
    expect(body.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("groups medications due at the same time into one reminder", async () => {
    await seedMedication("Metoprolol", 50);
    await seedMedication("Furosemide", 40);

    renderHook(() => usePushScheduleSync());

    await waitFor(() => expect(callsTo("/api/push/sync-schedule")).toHaveLength(1));
    const entries = syncedEntries();
    expect(entries).toHaveLength(7);
    const meds = bodyOf(entries[0]!).split(", ").sort();
    expect(meds).toEqual(["Furosemide 40mg", "Metoprolol 50mg"]);
  });

  it("does not sync the schedule when signed out", async () => {
    auth.authenticated = false;
    await seedMedication("Metoprolol", 50);

    renderHook(() => usePushScheduleSync());
    await settle();

    expect(callsTo("/api/push/sync-schedule")).toHaveLength(0);
  });

  it("makes no push calls at all when reminders are disabled", async () => {
    useSettingsStore.setState({ doseRemindersEnabled: false });
    await seedMedication("Metoprolol", 50);

    renderHook(() => usePushScheduleSync());
    await settle();

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("does not re-sync an unchanged schedule on re-render", async () => {
    await seedMedication("Metoprolol", 50);
    const { rerender } = renderHook(() => usePushScheduleSync());
    await waitFor(() => expect(callsTo("/api/push/sync-schedule")).toHaveLength(1));

    rerender();
    await settle();

    expect(callsTo("/api/push/sync-schedule")).toHaveLength(1);
  });

  it("pushes changed follow-up settings without resending an unchanged schedule", async () => {
    await seedMedication("Metoprolol", 50);
    renderHook(() => usePushScheduleSync());
    await waitFor(() => expect(callsTo("/api/push/sync-schedule")).toHaveLength(1));
    expect(callsTo("/api/push/settings")).toHaveLength(1);

    act(() => {
      useSettingsStore.setState({ reminderFollowUpCount: 4, reminderFollowUpInterval: 15 });
    });

    await waitFor(() => expect(callsTo("/api/push/settings")).toHaveLength(2));
    // Follow-ups are server settings; the schedule itself did not change.
    expect(callsTo("/api/push/sync-schedule")).toHaveLength(1);
    const settingsBody = JSON.parse(
      String((callsTo("/api/push/settings")[1]?.[1] as RequestInit).body),
    );
    expect(settingsBody).toEqual({
      followUpCount: 4,
      followUpIntervalMinutes: 15,
      dayStartHour: useSettingsStore.getState().dayStartHour,
    });
  });

  // dates-timezones#6: the server's day boundary (MCP today summary) used to
  // be hardcoded to 2am; the client now sends its own setting.
  it("sends the user's day-start hour and re-sends it when it changes", async () => {
    await seedMedication("Metoprolol", 50);
    act(() => {
      useSettingsStore.setState({ dayStartHour: 5 });
    });
    renderHook(() => usePushScheduleSync());
    await waitFor(() => expect(callsTo("/api/push/settings")).toHaveLength(1));
    const first = JSON.parse(String((callsTo("/api/push/settings")[0]?.[1] as RequestInit).body));
    expect(first.dayStartHour).toBe(5);

    act(() => {
      useSettingsStore.setState({ dayStartHour: 4 });
    });

    await waitFor(() => expect(callsTo("/api/push/settings")).toHaveLength(2));
    const second = JSON.parse(String((callsTo("/api/push/settings")[1]?.[1] as RequestInit).body));
    expect(second.dayStartHour).toBe(4);
  });

  it("pings the reminder check endpoint on mount and every minute", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { unmount } = renderHook(() => usePushScheduleSync());

    expect(callsTo("/api/push/check")).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(callsTo("/api/push/check")).toHaveLength(2);

    unmount();
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(callsTo("/api/push/check")).toHaveLength(2);
  });

  it("swallows a failed schedule sync instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiFetch.mockImplementation(async (url: unknown) => {
      if (url === "/api/push/sync-schedule") throw new Error("offline");
      return new Response("{}");
    });
    await seedMedication("Metoprolol", 50);

    renderHook(() => usePushScheduleSync());
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[push-schedule-sync] Failed to sync schedule:",
        expect.any(Error),
      ),
    );
    warn.mockRestore();
  });
});

describe("useDoseReminderToggle", () => {
  beforeEach(() => {
    push.permission = "granted";
    push.subscribeToPush.mockClear();
    push.subscribeToPush.mockResolvedValue({ endpoint: "https://push.example" });
    push.unsubscribeFromPush.mockClear();
    useSettingsStore.setState({ doseRemindersEnabled: false });
    native.isNative = false;
    native.display = "granted";
    native.enabled = true;
    native.setEnabled.mockClear();
    native.requestPermissions.mockClear();
  });

  it("subscribes and enables reminders once permission is granted", async () => {
    const { result } = renderHook(() => useDoseReminderToggle());

    await act(() => result.current.handleToggle(true));

    expect(push.subscribeToPush).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().doseRemindersEnabled).toBe(true);
    expect(result.current.toggling).toBe(false);
  });

  it("leaves reminders off when permission is denied", async () => {
    push.permission = "denied";
    const { result } = renderHook(() => useDoseReminderToggle());

    await act(() => result.current.handleToggle(true));

    expect(push.subscribeToPush).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().doseRemindersEnabled).toBe(false);
  });

  it("leaves reminders off when the push subscription fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    push.subscribeToPush.mockResolvedValue(null);
    const { result } = renderHook(() => useDoseReminderToggle());

    await act(() => result.current.handleToggle(true));

    expect(useSettingsStore.getState().doseRemindersEnabled).toBe(false);
    warn.mockRestore();
  });

  it("unsubscribes and disables reminders when turned off", async () => {
    useSettingsStore.setState({ doseRemindersEnabled: true });
    const { result } = renderHook(() => useDoseReminderToggle());

    await act(() => result.current.handleToggle(false));

    expect(push.unsubscribeFromPush).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().doseRemindersEnabled).toBe(false);
  });

  describe("in the native app", () => {
    beforeEach(() => {
      native.isNative = true;
    });

    it("reports the stored native state and needs no web push", async () => {
      native.enabled = false;
      const { result } = renderHook(() => useDoseReminderToggle());

      await waitFor(() => expect(result.current.enabled).toBe(false));
      expect(result.current.isNative).toBe(true);
      expect(result.current.supported).toBe(true);
    });

    it("turns native reminders on once notification permission is granted", async () => {
      native.enabled = false;
      const { result } = renderHook(() => useDoseReminderToggle());

      await act(() => result.current.handleToggle(true));

      expect(native.requestPermissions).toHaveBeenCalledTimes(1);
      expect(native.setEnabled).toHaveBeenCalledWith(true);
      expect(result.current.enabled).toBe(true);
      expect(push.subscribeToPush).not.toHaveBeenCalled();
    });

    it("leaves native reminders off when permission is denied", async () => {
      native.enabled = false;
      native.display = "denied";
      const { result } = renderHook(() => useDoseReminderToggle());

      await act(() => result.current.handleToggle(true));

      expect(native.setEnabled).not.toHaveBeenCalled();
      expect(result.current.toggling).toBe(false);
    });

    it("turns native reminders off without asking for permission", async () => {
      const { result } = renderHook(() => useDoseReminderToggle());

      await act(() => result.current.handleToggle(false));

      expect(native.requestPermissions).not.toHaveBeenCalled();
      expect(native.setEnabled).toHaveBeenCalledWith(false);
      expect(result.current.enabled).toBe(false);
      expect(push.unsubscribeFromPush).not.toHaveBeenCalled();
    });
  });

  it("recovers from a failed toggle", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    push.subscribeToPush.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useDoseReminderToggle());

    await act(() => result.current.handleToggle(true));

    expect(useSettingsStore.getState().doseRemindersEnabled).toBe(false);
    expect(result.current.toggling).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
