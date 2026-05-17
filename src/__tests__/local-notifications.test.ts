import { describe, it, expect, vi, beforeEach } from "vitest";

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

const testSchedules: Record<string, unknown>[] = [];
const testPhases: Record<string, unknown>[] = [];
const testPrescriptions: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    phaseSchedules: {
      filter: (fn: (s: Record<string, unknown>) => boolean) => ({
        toArray: () => Promise.resolve(testSchedules.filter(fn)),
      }),
    },
    medicationPhases: {
      where: (_field: string) => ({
        anyOf: (ids: string[]) => ({
          filter: (fn: (p: Record<string, unknown>) => boolean) => ({
            toArray: () =>
              Promise.resolve(
                testPhases.filter(
                  (p) => ids.includes(p.id as string) && fn(p)
                )
              ),
          }),
        }),
      }),
    },
    prescriptions: {
      where: (_field: string) => ({
        anyOf: (ids: string[]) => ({
          filter: (fn: (p: Record<string, unknown>) => boolean) => ({
            toArray: () =>
              Promise.resolve(
                testPrescriptions.filter(
                  (p) => ids.includes(p.id as string) && fn(p)
                )
              ),
          }),
        }),
      }),
    },
  },
}));

function seedDb(
  schedules: Record<string, unknown>[],
  phases: Record<string, unknown>[],
  prescriptions: Record<string, unknown>[]
) {
  testSchedules.length = 0;
  testSchedules.push(...schedules);
  testPhases.length = 0;
  testPhases.push(...phases);
  testPrescriptions.length = 0;
  testPrescriptions.push(...prescriptions);
}

describe("local-notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequestPermissions.mockResolvedValue({ display: "granted" });
    mockGetPending.mockResolvedValue({ notifications: [] });
    mockSchedule.mockResolvedValue(undefined);
    mockCancel.mockResolvedValue(undefined);
    seedDb([], [], []);
  });

  describe("initLocalNotifications", () => {
    it("requests permissions and syncs schedules", async () => {
      const { initLocalNotifications } = await import(
        "@/lib/local-notifications"
      );
      await initLocalNotifications();

      expect(mockRequestPermissions).toHaveBeenCalledOnce();
      expect(mockGetPending).toHaveBeenCalledOnce();
    });

    it("aborts if permission denied", async () => {
      mockRequestPermissions.mockResolvedValue({ display: "denied" });

      const { initLocalNotifications } = await import(
        "@/lib/local-notifications"
      );
      await initLocalNotifications();

      expect(mockGetPending).not.toHaveBeenCalled();
    });
  });

  describe("syncMedicationNotifications", () => {
    it("cancels existing notifications before scheduling new ones", async () => {
      mockGetPending.mockResolvedValue({
        notifications: [{ id: 1 }, { id: 2 }],
      });
      seedDb(
        [
          {
            id: "s1",
            phaseId: "p1",
            scheduleTimeUTC: 540,
            daysOfWeek: [1],
            enabled: true,
            deletedAt: null,
            dosage: 100,
            unit: "mg",
          },
        ],
        [
          {
            id: "p1",
            prescriptionId: "rx1",
            status: "active",
            deletedAt: null,
          },
        ],
        [
          {
            id: "rx1",
            genericName: "Aspirin",
            isActive: true,
            deletedAt: null,
          },
        ]
      );

      const { syncMedicationNotifications } = await import(
        "@/lib/local-notifications"
      );
      await syncMedicationNotifications();

      expect(mockCancel).toHaveBeenCalledWith({
        notifications: [{ id: 1 }, { id: 2 }],
      });
      expect(mockSchedule).toHaveBeenCalledOnce();
    });

    it("schedules notifications for each day of week", async () => {
      seedDb(
        [
          {
            id: "s1",
            phaseId: "p1",
            scheduleTimeUTC: 540, // 9:00 UTC
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            enabled: true,
            deletedAt: null,
            dosage: 50,
            unit: "mg",
          },
        ],
        [
          {
            id: "p1",
            prescriptionId: "rx1",
            status: "active",
            deletedAt: null,
          },
        ],
        [
          {
            id: "rx1",
            genericName: "Metoprolol",
            isActive: true,
            deletedAt: null,
          },
        ]
      );

      const { syncMedicationNotifications } = await import(
        "@/lib/local-notifications"
      );
      await syncMedicationNotifications();

      expect(mockSchedule).toHaveBeenCalledOnce();
      const scheduled = mockSchedule.mock.calls[0]![0].notifications;
      expect(scheduled).toHaveLength(7);

      const weekdays = scheduled.map(
        (n: { schedule: { on: { weekday: number } } }) =>
          n.schedule.on.weekday
      );
      expect(weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);

      expect(scheduled[0].schedule.on.hour).toBe(9);
      expect(scheduled[0].schedule.on.minute).toBe(0);
    });

    it("skips disabled schedules", async () => {
      seedDb(
        [
          {
            id: "s1",
            phaseId: "p1",
            scheduleTimeUTC: 480,
            daysOfWeek: [1],
            enabled: false,
            deletedAt: null,
            dosage: 10,
          },
        ],
        [
          {
            id: "p1",
            prescriptionId: "rx1",
            status: "active",
            deletedAt: null,
          },
        ],
        [
          {
            id: "rx1",
            genericName: "Test",
            isActive: true,
            deletedAt: null,
          },
        ]
      );

      const { syncMedicationNotifications } = await import(
        "@/lib/local-notifications"
      );
      await syncMedicationNotifications();

      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it("skips schedules for inactive prescriptions", async () => {
      seedDb(
        [
          {
            id: "s1",
            phaseId: "p1",
            scheduleTimeUTC: 480,
            daysOfWeek: [1],
            enabled: true,
            deletedAt: null,
            dosage: 10,
          },
        ],
        [
          {
            id: "p1",
            prescriptionId: "rx1",
            status: "active",
            deletedAt: null,
          },
        ],
        [
          {
            id: "rx1",
            genericName: "Stopped Med",
            isActive: false,
            deletedAt: null,
          },
        ]
      );

      const { syncMedicationNotifications } = await import(
        "@/lib/local-notifications"
      );
      await syncMedicationNotifications();

      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it("includes dosage and unit in notification body", async () => {
      seedDb(
        [
          {
            id: "s1",
            phaseId: "p1",
            scheduleTimeUTC: 480,
            daysOfWeek: [1],
            enabled: true,
            deletedAt: null,
            dosage: 25,
            unit: "mg",
          },
        ],
        [
          {
            id: "p1",
            prescriptionId: "rx1",
            status: "active",
            deletedAt: null,
          },
        ],
        [
          {
            id: "rx1",
            genericName: "Lisinopril",
            isActive: true,
            deletedAt: null,
          },
        ]
      );

      const { syncMedicationNotifications } = await import(
        "@/lib/local-notifications"
      );
      await syncMedicationNotifications();

      const scheduled = mockSchedule.mock.calls[0]![0].notifications;
      expect(scheduled[0].title).toBe("Time for Lisinopril");
      expect(scheduled[0].body).toBe("Take 25mg of Lisinopril");
    });

    it("sets allowWhileIdle for reliable delivery", async () => {
      seedDb(
        [
          {
            id: "s1",
            phaseId: "p1",
            scheduleTimeUTC: 480,
            daysOfWeek: [1],
            enabled: true,
            deletedAt: null,
            dosage: 10,
          },
        ],
        [
          {
            id: "p1",
            prescriptionId: "rx1",
            status: "active",
            deletedAt: null,
          },
        ],
        [
          {
            id: "rx1",
            genericName: "Test",
            isActive: true,
            deletedAt: null,
          },
        ]
      );

      const { syncMedicationNotifications } = await import(
        "@/lib/local-notifications"
      );
      await syncMedicationNotifications();

      const scheduled = mockSchedule.mock.calls[0]![0].notifications;
      expect(scheduled[0].schedule.allowWhileIdle).toBe(true);
    });
  });
});
