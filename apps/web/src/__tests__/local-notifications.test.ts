/**
 * Native (Capacitor) medication reminders.
 *
 * Runs against the real Dexie schema (fake-indexeddb) with the device pinned
 * to Europe/Berlin, so a UTC-vs-local mix-up shows up as a wrong instant
 * instead of passing by coincidence on a UTC machine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeDoseLog,
  makeTitrationPlan,
} from "@/__tests__/fixtures/db-fixtures";
import { useSettingsStore } from "@/stores/settings-store";

const mockRequestPermissions = vi.fn();
const mockGetPending = vi.fn();
const mockCancel = vi.fn();
const mockSchedule = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    requestPermissions: () => mockRequestPermissions(),
    getPending: () => mockGetPending(),
    cancel: (args: unknown) => mockCancel(args),
    schedule: (args: unknown) => mockSchedule(args),
  },
}));

vi.mock("@/lib/timezone", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDeviceTimezone: () => "Europe/Berlin",
}));

let remindersSuspended = false;
vi.mock("@/lib/reminder-suspension", () => ({
  areRemindersSuspended: () => remindersSuspended,
}));

// Monday 2026-09-28 06:00 in Berlin (CEST, UTC+2).
const NOW = Date.UTC(2026, 8, 28, 4, 0);

interface Scheduled {
  id: number;
  title: string;
  body: string;
  isExactNotification: boolean;
  schedule: { at: Date; allowWhileIdle: boolean };
}

function scheduled(): Scheduled[] {
  return mockSchedule.mock.calls.flatMap(
    (call) => (call[0] as { notifications: Scheduled[] }).notifications,
  );
}

/** A Berlin-anchored 08:00 schedule on the given weekdays. */
async function seedRegimen(
  opts: { genericName?: string; daysOfWeek?: number[]; dosage?: number; time?: string } = {},
) {
  const rx = makePrescription({ genericName: opts.genericName ?? "Metoprolol" });
  const phase = makeMedicationPhase(rx.id);
  const schedule = makePhaseSchedule(phase.id, {
    time: opts.time ?? "08:00",
    scheduleTimeUTC: 360,
    anchorTimezone: "Europe/Berlin",
    daysOfWeek: opts.daysOfWeek ?? [1],
    dosage: opts.dosage ?? 50,
  });
  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);
  return { rx, phase, schedule };
}

async function sync() {
  const { syncMedicationNotifications } = await import("@/lib/local-notifications");
  await syncMedicationNotifications();
}

describe("local-notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mockRequestPermissions.mockReset().mockResolvedValue({ display: "granted" });
    mockGetPending.mockReset().mockResolvedValue({ notifications: [] });
    mockSchedule.mockReset().mockResolvedValue(undefined);
    mockCancel.mockReset().mockResolvedValue(undefined);
    remindersSuspended = false;
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    useSettingsStore.setState({ reminderFollowUpCount: 0, reminderFollowUpInterval: 10 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("initLocalNotifications", () => {
    it("requests permissions and syncs schedules", async () => {
      const { initLocalNotifications } = await import("@/lib/local-notifications");
      await initLocalNotifications();

      expect(mockRequestPermissions).toHaveBeenCalledOnce();
      expect(mockGetPending).toHaveBeenCalledOnce();
    });

    it("aborts if permission denied", async () => {
      mockRequestPermissions.mockResolvedValue({ display: "denied" });

      const { initLocalNotifications } = await import("@/lib/local-notifications");
      await initLocalNotifications();

      expect(mockGetPending).not.toHaveBeenCalled();
    });
  });

  describe("syncMedicationNotifications", () => {
    it("cancels and schedules nothing while signed out (reminders suspended)", async () => {
      // audit native-android#8: sign-out suspends reminders; the cold-start
      // resync must not bring them back.
      remindersSuspended = true;
      mockGetPending.mockResolvedValue({ notifications: [{ id: 1 }] });
      await seedRegimen({ daysOfWeek: [1] });

      await sync();

      expect(mockCancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it("fires at the schedule's local wall-clock time, not its UTC minutes as local", async () => {
      await seedRegimen({ daysOfWeek: [1] });

      await sync();

      const first = scheduled()[0]!;
      // 08:00 CEST is 06:00Z. The old `on: { hour: 6 }` fired at 06:00 local.
      expect(first.schedule.at.toISOString()).toBe("2026-09-28T06:00:00.000Z");
    });

    it("follows the anchor zone across a DST change", async () => {
      // Daily 08:00 Berlin; CEST ends on Sunday 2026-10-25.
      await seedRegimen({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
      vi.setSystemTime(Date.UTC(2026, 9, 20, 12, 0));

      await sync();

      const byDay = new Map(scheduled().map((n) => [n.schedule.at.toISOString().slice(0, 10), n]));
      expect(byDay.get("2026-10-24")!.schedule.at.toISOString()).toBe("2026-10-24T06:00:00.000Z");
      expect(byDay.get("2026-10-26")!.schedule.at.toISOString()).toBe("2026-10-26T07:00:00.000Z");
    });

    it("schedules one-shot, wake-up alarms for each due day within the horizon", async () => {
      await seedRegimen({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });

      await sync();

      const { NATIVE_REMINDER_HORIZON_DAYS } = await import("@/lib/local-notifications");
      const list = scheduled();
      expect(list).toHaveLength(NATIVE_REMINDER_HORIZON_DAYS);
      for (const n of list) {
        expect(n.schedule).not.toHaveProperty("on");
        expect(n.schedule.allowWhileIdle).toBe(true);
      }
    });

    it("only schedules the weekdays the dose is due on", async () => {
      await seedRegimen({ daysOfWeek: [1, 3] });

      await sync();

      const days = scheduled().map((n) => n.schedule.at.toISOString().slice(0, 10));
      expect(days.slice(0, 4)).toEqual(["2026-09-28", "2026-09-30", "2026-10-05", "2026-10-07"]);
      for (const day of days) expect([1, 3]).toContain(new Date(day).getUTCDay());
    });

    it("announces only the titration dose when titration overrides maintenance", async () => {
      const rx = makePrescription({ genericName: "Metoprolol" });
      const plan = makeTitrationPlan({ status: "active" });
      const maintenance = makeMedicationPhase(rx.id, { type: "maintenance" });
      const titration = makeMedicationPhase(rx.id, { type: "titration", titrationPlanId: plan.id });
      await db.prescriptions.add(rx);
      await db.titrationPlans.add(plan);
      await db.medicationPhases.bulkAdd([maintenance, titration]);
      await db.phaseSchedules.bulkAdd([
        makePhaseSchedule(maintenance.id, { anchorTimezone: "Europe/Berlin", daysOfWeek: [1], dosage: 50 }),
        makePhaseSchedule(titration.id, { anchorTimezone: "Europe/Berlin", daysOfWeek: [1], dosage: 25 }),
      ]);

      await sync();

      const bodies = new Set(scheduled().map((n) => n.body));
      expect(bodies).toEqual(new Set(["Take 25mg of Metoprolol"]));
    });

    it("skips disabled, tombstoned and inactive-prescription schedules", async () => {
      const { schedule } = await seedRegimen({ genericName: "Disabled" });
      await db.phaseSchedules.update(schedule.id, { enabled: false });
      const deleted = await seedRegimen({ genericName: "Deleted" });
      await db.prescriptions.update(deleted.rx.id, { deletedAt: NOW });
      const stopped = await seedRegimen({ genericName: "Stopped" });
      await db.prescriptions.update(stopped.rx.id, { isActive: false });

      await sync();

      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it("includes dosage and unit in notification body", async () => {
      await seedRegimen({ genericName: "Lisinopril", dosage: 25 });

      await sync();

      const first = scheduled()[0]!;
      expect(first.title).toBe("Time for Lisinopril");
      expect(first.body).toBe("Take 25mg of Lisinopril");
    });

    it("skips a slot once its dose is logged", async () => {
      const { rx, phase, schedule } = await seedRegimen({ daysOfWeek: [1] });
      await db.doseLogs.add(
        makeDoseLog(rx.id, phase.id, schedule.id, { scheduledDate: "2026-09-28", status: "taken" }),
      );

      await sync();

      const days = scheduled().map((n) => n.schedule.at.toISOString().slice(0, 10));
      expect(days[0]).toBe("2026-10-05");
      expect(days).not.toContain("2026-09-28");
    });

    it("adds follow-ups per the follow-up settings", async () => {
      useSettingsStore.setState({ reminderFollowUpCount: 2, reminderFollowUpInterval: 15 });
      await seedRegimen({ daysOfWeek: [1] });

      await sync();

      const monday = scheduled()
        .filter((n) => n.schedule.at.toISOString().startsWith("2026-09-28"))
        .map((n) => n.schedule.at.toISOString());
      expect(monday).toEqual([
        "2026-09-28T06:00:00.000Z",
        "2026-09-28T06:15:00.000Z",
        "2026-09-28T06:30:00.000Z",
      ]);
    });

    it("limits follow-ups to the follow-up horizon but keeps every main reminder", async () => {
      useSettingsStore.setState({ reminderFollowUpCount: 2, reminderFollowUpInterval: 10 });
      await seedRegimen({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });

      await sync();

      const { NATIVE_REMINDER_HORIZON_DAYS, NATIVE_FOLLOW_UP_HORIZON_DAYS } = await import(
        "@/lib/local-notifications"
      );
      const list = scheduled();
      const main = list.filter((n) => n.title.startsWith("Time for"));
      const followUps = list.filter((n) => n.title.startsWith("Reminder:"));
      expect(main).toHaveLength(NATIVE_REMINDER_HORIZON_DAYS);
      expect(followUps).toHaveLength(NATIVE_FOLLOW_UP_HORIZON_DAYS * 2);
    });

    it("keeps main reminders over follow-ups when the alarm cap is reached", async () => {
      useSettingsStore.setState({ reminderFollowUpCount: 3, reminderFollowUpInterval: 5 });
      // 15 daily doses: 450 main reminders over 30 days, 315 follow-ups.
      for (let h = 6; h < 21; h++) {
        await seedRegimen({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], time: `${String(h).padStart(2, "0")}:00` });
      }

      await sync();

      const list = scheduled();
      expect(list).toHaveLength(400);
      expect(list.every((n) => n.title.startsWith("Time for"))).toBe(true);
    });

    it("uses stable ids and cancels only reminders that are no longer wanted", async () => {
      await seedRegimen({ daysOfWeek: [1] });
      await sync();
      const firstIds = scheduled().map((n) => n.id);

      mockSchedule.mockClear();
      mockGetPending.mockResolvedValue({
        notifications: [...firstIds.map((id) => ({ id })), { id: 1 }, { id: 2 }],
      });
      await sync();

      expect(scheduled().map((n) => n.id)).toEqual(firstIds);
      expect(mockCancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }, { id: 2 }] });
    });

    it("serializes overlapping runs so a slower run can't leave stale reminders", async () => {
      await seedRegimen({ daysOfWeek: [1] });
      const pending = new Set<number>();
      mockGetPending.mockImplementation(async () => ({
        notifications: [...pending].map((id) => ({ id })),
      }));
      mockSchedule.mockImplementation(async ({ notifications }: { notifications: Scheduled[] }) => {
        for (const n of notifications) pending.add(n.id);
      });
      mockCancel.mockImplementation(async ({ notifications }: { notifications: { id: number }[] }) => {
        for (const n of notifications) pending.delete(n.id);
      });

      const { syncMedicationNotifications } = await import("@/lib/local-notifications");
      const first = syncMedicationNotifications();
      await db.phaseSchedules.clear();
      const second = syncMedicationNotifications();
      await Promise.all([first, second]);

      expect(pending.size).toBe(0);
    });

    it("cancels every reminder when native reminders are switched off", async () => {
      await seedRegimen({ daysOfWeek: [1] });
      await sync();
      const ids = scheduled().map((n) => ({ id: n.id }));
      mockGetPending.mockResolvedValue({ notifications: ids });
      mockSchedule.mockClear();

      const { setNativeRemindersEnabled, getNativeRemindersEnabled } = await import(
        "@/lib/local-notifications"
      );
      await setNativeRemindersEnabled(false);

      expect(getNativeRemindersEnabled()).toBe(false);
      expect(mockCancel).toHaveBeenCalledWith({ notifications: ids });
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    // @capacitor/local-notifications 8.3.0 added `isExactNotification`,
    // defaulting to TRUE. On API 31+ that makes schedule() open the system
    // "Alarms & reminders" Activity whenever SCHEDULE_EXACT_ALARM is ungranted
    // — and apps/native targets SDK 36, where it is not granted by default.
    // Syncs run on every cold start, so taking the default would bounce the
    // user out to system settings on every launch. Every scheduled
    // notification must opt out explicitly.
    it("opts every notification out of exact alarms, so a cold start never opens system settings", async () => {
      await seedRegimen({ daysOfWeek: [1, 3, 5] });

      await sync();

      const list = scheduled();
      expect(list.length).toBeGreaterThan(0);
      for (const n of list) {
        expect(n.isExactNotification).toBe(false);
      }
    });
  });
});
