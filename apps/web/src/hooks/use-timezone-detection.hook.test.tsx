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
vi.mock("@/lib/timezone-recalculation-service", () => ({
  recalculateScheduleTimezones: recalc,
}));

import {
  useTimezoneDetection,
  _resetDismissedFlag,
} from "@/hooks/use-timezone-detection";

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
  _resetDismissedFlag();
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

  it("does not prompt again this session after a dismissal", async () => {
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
