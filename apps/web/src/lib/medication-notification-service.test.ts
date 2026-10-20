/**
 * In-page dose reminders (the web notifier that runs while /medications is
 * open). It must agree with the Today view and the other reminder paths.
 */
import { describe, it, expect, vi, beforeEach, onTestFinished } from "vitest";
import { createPreviewDatabase, db, resetActiveDatabase, setActiveDatabase } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeDoseLog,
  makeInventoryItem,
  makeTitrationPlan,
} from "@/__tests__/fixtures/db-fixtures";
import { checkDoseReminders, checkRefillAlerts } from "@/lib/medication-notification-service";

const mockShowNotification = vi.fn();

vi.mock("@/lib/push-notification-service", () => ({
  getNotificationPermission: () => "granted",
  showNotification: (...args: unknown[]) => mockShowNotification(...args),
}));

vi.mock("@/lib/timezone", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDeviceTimezone: () => "Europe/Berlin",
}));

// Monday 2026-09-28 08:02 in Berlin (CEST): two minutes after an 08:00 dose.
const NOW = Date.UTC(2026, 8, 28, 6, 2);

async function seed(genericName = "Metoprolol") {
  const rx = makePrescription({ genericName });
  const phase = makeMedicationPhase(rx.id);
  const schedule = makePhaseSchedule(phase.id, { anchorTimezone: "Europe/Berlin", daysOfWeek: [1] });
  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);
  return { rx, phase, schedule };
}

describe("checkDoseReminders", () => {
  beforeEach(() => {
    mockShowNotification.mockReset().mockResolvedValue(true);
  });

  it("fires for a dose due at the local wall-clock time, with the push tag", async () => {
    await seed();

    await checkDoseReminders(NOW);

    expect(mockShowNotification).toHaveBeenCalledWith("Time for your 08:00 medications", {
      body: "Metoprolol 50mg",
      tag: "dose-08:00",
      requireInteraction: true,
    });
  });

  it("does not fire for a deleted prescription", async () => {
    const { rx } = await seed("Furosemide");
    await db.prescriptions.update(rx.id, { deletedAt: NOW - 1000 });

    await checkDoseReminders(NOW);

    expect(mockShowNotification).not.toHaveBeenCalled();
  });

  it("does not fire for a deleted schedule", async () => {
    const { schedule } = await seed();
    await db.phaseSchedules.update(schedule.id, { deletedAt: NOW - 1000 });

    await checkDoseReminders(NOW);

    expect(mockShowNotification).not.toHaveBeenCalled();
  });

  it("announces only the titration dose while titration overrides maintenance", async () => {
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

    await checkDoseReminders(NOW);

    expect(mockShowNotification).toHaveBeenCalledOnce();
    expect(mockShowNotification.mock.calls[0]![1]).toMatchObject({ body: "Metoprolol 25mg" });
  });

  it("stays quiet once the dose is taken", async () => {
    const { rx, phase, schedule } = await seed();
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, { scheduledDate: "2026-09-28", status: "taken" }),
    );

    await checkDoseReminders(NOW);

    expect(mockShowNotification).not.toHaveBeenCalled();
  });

  it("stays quiet outside the reminder window", async () => {
    await seed();

    await checkDoseReminders(NOW + 10 * 60 * 1000);

    expect(mockShowNotification).not.toHaveBeenCalled();
  });
});

describe("checkRefillAlerts", () => {
  beforeEach(() => {
    mockShowNotification.mockReset().mockResolvedValue(true);
  });

  it("checks the real inventory, not a manual preview's sample inventory", async () => {
    // Real: Lopressor, well stocked. Sample: Lasix, below its threshold.
    const { rx } = await seed();
    await db.inventoryItems.add(makeInventoryItem(rx.id, { currentStock: 500 }));

    const preview = createPreviewDatabase();
    await preview.open();
    const sampleRx = makePrescription({ genericName: "Furosemide" });
    const samplePhase = makeMedicationPhase(sampleRx.id);
    await preview.prescriptions.add(sampleRx);
    await preview.medicationPhases.add(samplePhase);
    await preview.phaseSchedules.add(makePhaseSchedule(samplePhase.id));
    await preview.inventoryItems.add(
      makeInventoryItem(sampleRx.id, { brandName: "Lasix", currentStock: 6, refillAlertPills: 10 }),
    );

    setActiveDatabase(preview);
    try {
      let done = false;
      const check = checkRefillAlerts().then(() => (done = true));
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Held back while the preview is on screen: no alert, nothing saved.
      expect(done).toBe(false);
      expect(mockShowNotification).not.toHaveBeenCalled();

      resetActiveDatabase();
      await check;
      expect(mockShowNotification).not.toHaveBeenCalled();
    } finally {
      resetActiveDatabase();
      await preview.delete();
    }
  });

  it("alerts for a real prescription that is running low", async () => {
    const { rx } = await seed();
    await db.inventoryItems.add(
      makeInventoryItem(rx.id, { brandName: "Lopressor", currentStock: 6, refillAlertPills: 10 }),
    );

    await checkRefillAlerts();

    expect(mockShowNotification).toHaveBeenCalledWith(
      "Refill needed: Lopressor",
      expect.objectContaining({ tag: `refill-${rx.id}` }),
    );
  });
});

describe("checkDoseReminders after a reschedule", () => {
  beforeEach(() => {
    mockShowNotification.mockReset().mockResolvedValue(true);
  });

  it("is quiet at the old time and reminds at the new time", async () => {
    const { rx, phase, schedule } = await seed();
    // 08:00 Berlin moved to 10:00 Berlin (08:00 UTC).
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, {
        scheduledDate: "2026-09-28",
        status: "rescheduled",
        remindAt: Date.UTC(2026, 8, 28, 8, 0),
      }),
    );

    await checkDoseReminders(NOW);
    expect(mockShowNotification).not.toHaveBeenCalled();

    await checkDoseReminders(Date.UTC(2026, 8, 28, 8, 2));
    expect(mockShowNotification).toHaveBeenCalledWith("Time for your 10:00 medications", {
      body: "Metoprolol 50mg",
      tag: "dose-10:00",
      requireInteraction: true,
    });
  });

  it("reminds once for a dose moved three days ahead", async () => {
    // The notifier remembers what it showed in localStorage.
    const store = new Map<string, string>();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    onTestFinished(() => vi.unstubAllGlobals());
    const { rx, phase, schedule } = await seed();
    // Monday's 08:00 dose moved to Thursday 10:00 Berlin (08:00 UTC).
    await db.doseLogs.add(
      makeDoseLog(rx.id, phase.id, schedule.id, {
        scheduledDate: "2026-09-28",
        status: "rescheduled",
        remindAt: Date.UTC(2026, 9, 1, 8, 0),
      }),
    );

    await checkDoseReminders(Date.UTC(2026, 9, 1, 8, 1));
    await checkDoseReminders(Date.UTC(2026, 9, 1, 8, 2));
    await checkDoseReminders(Date.UTC(2026, 9, 1, 8, 3));
    expect(mockShowNotification).toHaveBeenCalledTimes(1);
  });
});
