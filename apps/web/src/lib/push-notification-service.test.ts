/**
 * Client side of server push reminders: the weekly schedule sync and the
 * timezone sent on subscribe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";
import { useSettingsStore } from "@/stores/settings-store";
import {
  syncPushSchedule,
  subscribeToPush,
  resetPushScheduleSyncState,
} from "@/lib/push-notification-service";

type FetchInit = { method?: string; body?: string };
const fetchMock = vi.fn(async (_url: string, _init?: FetchInit) => new Response("{}", { status: 200 }));

const fakeSubscription = {
  endpoint: "https://push.example/endpoint/abc",
  toJSON: () => ({
    endpoint: "https://push.example/endpoint/abc",
    keys: { p256dh: "p256dh-value", auth: "auth-value" },
  }),
};

let deviceTz = "Europe/Berlin";
const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;

function bodiesFor(path: string): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([url]) => url.includes(path))
    .map(([, init]) => JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
}

// Tuesday 2026-09-29 10:00 Berlin.
const TUESDAY = Date.UTC(2026, 8, 29, 8, 0);

describe("push-notification-service", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TUESDAY);
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    const registration = {
      pushManager: {
        getSubscription: async () => fakeSubscription,
        subscribe: async () => fakeSubscription,
      },
    };
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve(registration),
        getRegistration: async () => registration,
      },
    });
    vi.stubGlobal("window", { PushManager: function PushManager() {} });
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BMqSvZarZuVi1pQmvyA-W8Z7YvTjC3z1JvXrYtNwQpL0R2sD4fG6hK8oP9nT5uV7wX";
    deviceTz = "Europe/Berlin";
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (
      this: Intl.DateTimeFormat,
    ) {
      return { ...realResolvedOptions.call(this), timeZone: deviceTz };
    });
    useSettingsStore.setState({ doseRemindersEnabled: true });
    resetPushScheduleSyncState();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("syncPushSchedule", () => {
    it("sends every weekday a medication is due on, not just today's", async () => {
      const rx = makePrescription({ genericName: "Bisoprolol" });
      const phase = makeMedicationPhase(rx.id);
      await db.prescriptions.add(rx);
      await db.medicationPhases.add(phase);
      // Mondays only — today is Tuesday.
      await db.phaseSchedules.add(
        makePhaseSchedule(phase.id, { time: "20:00", anchorTimezone: "Europe/Berlin", daysOfWeek: [1] }),
      );

      await syncPushSchedule();

      const [body] = bodiesFor("/api/push/sync-schedule");
      expect(body!.timezone).toBe("Europe/Berlin");
      expect(body!.schedules).toEqual([
        expect.objectContaining({ dayOfWeek: 1, timeSlot: "20:00" }),
      ]);
    });

    it("sends an empty schedule so stopping the last medication clears the server", async () => {
      await syncPushSchedule();

      expect(bodiesFor("/api/push/sync-schedule")).toEqual([
        { schedules: [], timezone: "Europe/Berlin" },
      ]);
    });

    it("skips an unchanged schedule but resends when only the timezone changed", async () => {
      await syncPushSchedule();
      await syncPushSchedule();
      expect(bodiesFor("/api/push/sync-schedule")).toHaveLength(1);

      deviceTz = "America/New_York";
      await syncPushSchedule();
      const sent = bodiesFor("/api/push/sync-schedule");
      expect(sent).toHaveLength(2);
      expect(sent[1]!.timezone).toBe("America/New_York");
    });

    it("returns without waiting when no service worker is registered", async () => {
      // `ready` never settles without a registration; the app-wide resync
      // must not pile up promises waiting on it.
      vi.stubGlobal("navigator", {
        serviceWorker: {
          ready: new Promise(() => {}),
          getRegistration: async () => undefined,
        },
      });

      await syncPushSchedule();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does nothing while push reminders are off", async () => {
      useSettingsStore.setState({ doseRemindersEnabled: false });

      await syncPushSchedule();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("subscribeToPush sends the device timezone", async () => {
    await subscribeToPush();

    const [body] = bodiesFor("/api/push/subscribe");
    expect(body!.timezone).toBe("Europe/Berlin");
  });
});
