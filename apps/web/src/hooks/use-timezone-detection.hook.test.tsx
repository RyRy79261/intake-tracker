// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import type * as TimezoneModule from "@/lib/timezone";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * Drives the real useTimezoneDetection hook (use-timezone-detection.test.ts
 * re-implements its detection steps instead of importing it). The device
 * timezone and the recalculation service are stubbed; the schedules are real
 * IndexedDB rows.
 */

const tz = vi.hoisted(() => ({ device: "Europe/Berlin" }));
const recalc = vi.hoisted(() => vi.fn(async (_tz: string) => undefined));

vi.mock("@/lib/timezone", async (importOriginal) => ({
  ...(await importOriginal<typeof TimezoneModule>()),
  getDeviceTimezone: () => tz.device,
}));
vi.mock("@/lib/timezone-recalculation-service", async (importOriginal) => ({
  // Keep the real anchor lookup; only the recalculation is stubbed.
  ...(await importOriginal<Record<string, unknown>>()),
  recalculateScheduleTimezones: recalc,
}));

import {
  useTimezoneDetection,
  TIMEZONE_DISMISSALS_KEY,
} from "@/hooks/use-timezone-detection";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

async function seedSchedule(anchorTimezone: string, enabled = true) {
  const rx = makePrescription();
  const phase = makeMedicationPhase(rx.id);
  const schedule = makePhaseSchedule(phase.id, { anchorTimezone, enabled });
  await seedDatabase({
    prescriptions: [rx],
    medicationPhases: [phase],
    phaseSchedules: [schedule],
  });
}

/** Let the hook's mount-time async check finish. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  tz.device = "Europe/Berlin";
  recalc.mockReset();
  recalc.mockResolvedValue(undefined);
  localStorage.removeItem(TIMEZONE_DISMISSALS_KEY);
  useSettingsStore.setState({
    homeTimezone: null,
    homeTimezoneConfirmedAt: null,
    storageMode: "local",
  });
});

describe("useTimezoneDetection (real hook)", () => {
  it("opens the dialog when an enabled schedule is anchored to another timezone", async () => {
    await seedSchedule("Africa/Johannesburg");

    const { result } = renderHook(() => useTimezoneDetection());

    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    expect(result.current.oldTimezone).toBe("Africa/Johannesburg");
    expect(result.current.newTimezone).toBe("Europe/Berlin");
  });

  it("stays closed when every enabled schedule matches the device timezone", async () => {
    await seedSchedule("Europe/Berlin");

    const { result } = renderHook(() => useTimezoneDetection());
    await settle();

    expect(result.current.dialogOpen).toBe(false);
  });

  it("ignores disabled schedules", async () => {
    await seedSchedule("Africa/Johannesburg", false);

    const { result } = renderHook(() => useTimezoneDetection());
    await settle();

    expect(result.current.dialogOpen).toBe(false);
  });

  it("re-checks on resume and detects a timezone change made while backgrounded", async () => {
    await seedSchedule("Europe/Berlin");
    const { result } = renderHook(() => useTimezoneDetection());
    await settle();
    expect(result.current.dialogOpen).toBe(false);

    tz.device = "America/New_York";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    expect(result.current.oldTimezone).toBe("Europe/Berlin");
    expect(result.current.newTimezone).toBe("America/New_York");
  });

  it("does not prompt again after a dismissal", async () => {
    await seedSchedule("Africa/Johannesburg");
    const first = renderHook(() => useTimezoneDetection());
    await waitFor(() => expect(first.result.current.dialogOpen).toBe(true));

    act(() => first.result.current.handleDismiss());
    expect(first.result.current.dialogOpen).toBe(false);
    first.unmount();

    const second = renderHook(() => useTimezoneDetection());
    await settle();
    expect(second.result.current.dialogOpen).toBe(false);
  });

  it("recalculates to the device timezone on confirm and closes the dialog", async () => {
    await seedSchedule("Africa/Johannesburg");
    const { result } = renderHook(() => useTimezoneDetection());
    await waitFor(() => expect(result.current.dialogOpen).toBe(true));

    await act(() => result.current.handleConfirm());

    expect(recalc).toHaveBeenCalledWith("Europe/Berlin");
    expect(result.current.dialogOpen).toBe(false);
    expect(result.current.isRecalculating).toBe(false);
  });

  it("keeps the dialog open when the recalculation fails", async () => {
    recalc.mockRejectedValue(new Error("boom"));
    await seedSchedule("Africa/Johannesburg");
    const { result } = renderHook(() => useTimezoneDetection());
    await waitFor(() => expect(result.current.dialogOpen).toBe(true));

    await act(() => result.current.handleConfirm());

    expect(result.current.dialogOpen).toBe(true);
    expect(result.current.isRecalculating).toBe(false);
  });
});

describe("useTimezoneDetection with a synced home timezone (audit gap-timezone-travel-recalc#1)", () => {
  it("does not prompt a device that is at home, even when a schedule is anchored elsewhere", async () => {
    // Another device, away from home, re-stamped this schedule's anchor.
    useSettingsStore.setState({ homeTimezone: "Europe/Berlin" });
    await seedSchedule("Africa/Johannesburg");

    const { result } = renderHook(() => useTimezoneDetection());
    await settle();

    expect(result.current.dialogOpen).toBe(false);
  });

  it("prompts a device that is away from home, naming home as the old zone", async () => {
    useSettingsStore.setState({ homeTimezone: "Africa/Johannesburg" });
    await seedSchedule("Africa/Johannesburg");

    const { result } = renderHook(() => useTimezoneDetection());

    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    expect(result.current.oldTimezone).toBe("Africa/Johannesburg");
    expect(result.current.newTimezone).toBe("Europe/Berlin");
  });

  it("makes the adjusted-to zone the new home on confirm", async () => {
    useSettingsStore.setState({ homeTimezone: "Africa/Johannesburg" });
    await seedSchedule("Africa/Johannesburg");
    const { result } = renderHook(() => useTimezoneDetection());
    await waitFor(() => expect(result.current.dialogOpen).toBe(true));

    await act(() => result.current.handleConfirm());

    expect(recalc).toHaveBeenCalledWith("Europe/Berlin");
    expect(useSettingsStore.getState().homeTimezone).toBe("Europe/Berlin");
    expect(useSettingsStore.getState().homeTimezoneConfirmedAt).toBeTypeOf("number");
  });

  it("keeps an away device quiet after a dismissal, even once schedules are re-anchored", async () => {
    useSettingsStore.setState({ homeTimezone: "Africa/Johannesburg" });
    await seedSchedule("Africa/Johannesburg");
    const first = renderHook(() => useTimezoneDetection());
    await waitFor(() => expect(first.result.current.dialogOpen).toBe(true));
    act(() => first.result.current.handleDismiss());
    first.unmount();

    // A schedule created later on another device carries a different anchor.
    await seedSchedule("Asia/Dubai");
    const second = renderHook(() => useTimezoneDetection());
    await settle();

    expect(second.result.current.dialogOpen).toBe(false);
  });

  it("looks again when the home timezone arrives from another device", async () => {
    await seedSchedule("Europe/Berlin");
    const { result } = renderHook(() => useTimezoneDetection());
    await settle();
    expect(result.current.dialogOpen).toBe(false);

    // Another device moved home to Johannesburg and re-anchored there.
    await seedSchedule("Africa/Johannesburg");
    act(() => {
      useSettingsStore.setState({ homeTimezone: "Africa/Johannesburg" });
    });

    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    expect(result.current.oldTimezone).toBe("Africa/Johannesburg");
  });

  it("records home the first time every schedule is anchored to this device's zone", async () => {
    await seedSchedule("Europe/Berlin");

    renderHook(() => useTimezoneDetection());
    await settle();

    expect(useSettingsStore.getState().homeTimezone).toBe("Europe/Berlin");
  });

  it("does not record home in cloud-sync mode before the first full sync", async () => {
    useSettingsStore.setState({ storageMode: "cloud-sync" });
    useSyncStatusStore.setState({ initialSyncComplete: false });
    await seedSchedule("Europe/Berlin");

    renderHook(() => useTimezoneDetection());
    await settle();

    expect(useSettingsStore.getState().homeTimezone).toBeNull();
  });
});
