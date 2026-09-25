import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";
import { useSettingsStore } from "@/stores/settings-store";
import { installMedicationNotificationResync } from "@/lib/medication-notification-resync";

const DEBOUNCE_MS = 20;

function settle(ms = DEBOUNCE_MS * 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("installMedicationNotificationResync", () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it("runs an initial sync, then one debounced sync per burst of regimen writes", async () => {
    const target = vi.fn();
    dispose = installMedicationNotificationResync(target, DEBOUNCE_MS);
    await settle();
    expect(target).toHaveBeenCalledTimes(1);

    // A wizard save: prescription, phase and schedule in quick succession.
    const rx = makePrescription();
    const phase = makeMedicationPhase(rx.id);
    await db.prescriptions.add(rx);
    await db.medicationPhases.add(phase);
    await db.phaseSchedules.add(makePhaseSchedule(phase.id));
    await settle();

    expect(target).toHaveBeenCalledTimes(2);
  });

  it("resyncs when rows arrive without going through a mutation hook (e.g. a sync pull)", async () => {
    const target = vi.fn();
    dispose = installMedicationNotificationResync(target, DEBOUNCE_MS);
    await settle();
    target.mockClear();

    const rx = makePrescription();
    await db.prescriptions.bulkPut([rx]);
    await settle();

    expect(target).toHaveBeenCalledTimes(1);
  });

  it("resyncs when the follow-up settings change", async () => {
    const target = vi.fn();
    dispose = installMedicationNotificationResync(target, DEBOUNCE_MS);
    await settle();
    target.mockClear();

    useSettingsStore.setState({
      reminderFollowUpCount: useSettingsStore.getState().reminderFollowUpCount + 1,
    });
    await settle();

    expect(target).toHaveBeenCalledTimes(1);
  });

  it("stops after dispose", async () => {
    const target = vi.fn();
    dispose = installMedicationNotificationResync(target, DEBOUNCE_MS);
    await settle();
    target.mockClear();
    dispose();
    dispose = undefined;

    await db.prescriptions.add(makePrescription());
    await settle();

    expect(target).not.toHaveBeenCalled();
  });
});
