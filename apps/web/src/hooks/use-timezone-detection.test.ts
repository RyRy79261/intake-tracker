// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";
import type * as TimezoneModule from "@/lib/timezone";

// The device zone is whatever the test says it is. Everything else in the
// timezone module stays real.
const device = vi.hoisted(() => ({ tz: "Europe/Berlin", clearCalls: 0 }));
vi.mock("@/lib/timezone", async (importOriginal) => {
  const actual = await importOriginal<typeof TimezoneModule>();
  return {
    ...actual,
    getDeviceTimezone: () => device.tz,
    clearTimezoneCache: () => {
      device.clearCalls++;
    },
  };
});

import {
  useTimezoneDetection,
  TIMEZONE_DISMISSALS_KEY,
} from "@/hooks/use-timezone-detection";

/**
 * Tests for the real useTimezoneDetection hook against a seeded IndexedDB.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedSchedule(overrides?: {
  anchorTimezone?: string;
  enabled?: boolean;
  deletedAt?: number | null;
  phaseStatus?: "active" | "pending" | "completed" | "cancelled";
  name?: string;
  time?: string;
}) {
  const rx = makePrescription({ genericName: overrides?.name ?? "Metoprolol" });
  const phase = makeMedicationPhase(rx.id, { status: overrides?.phaseStatus ?? "active" });
  const schedule = makePhaseSchedule(phase.id, {
    scheduleTimeUTC: 390,
    anchorTimezone: overrides?.anchorTimezone ?? "Africa/Johannesburg",
    enabled: overrides?.enabled ?? true,
    deletedAt: overrides?.deletedAt ?? null,
    time: overrides?.time ?? "08:30",
  });

  await db.prescriptions.add(rx);
  await db.medicationPhases.add(phase);
  await db.phaseSchedules.add(schedule);

  return { rx, phase, schedule };
}

/** Mount the hook and let the on-mount check finish. */
async function mountHook() {
  const hook = renderHook(() => useTimezoneDetection());
  // The check is async (Dexie reads); give it a chance to settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return hook;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  device.tz = "Europe/Berlin";
  device.clearCalls = 0;
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useTimezoneDetection", () => {
  it("opens when a live schedule's anchor differs from the device zone", async () => {
    await seedSchedule({ anchorTimezone: "Africa/Johannesburg" });

    const { result } = await mountHook();

    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    expect(result.current.oldTimezone).toBe("Africa/Johannesburg");
    expect(result.current.newTimezone).toBe("Europe/Berlin");
  });

  it("stays closed when every anchor matches the device zone", async () => {
    await seedSchedule({ anchorTimezone: "Europe/Berlin" });

    const { result } = await mountHook();

    expect(result.current.dialogOpen).toBe(false);
  });

  it("stays closed for disabled, tombstoned and completed-phase schedules", async () => {
    await seedSchedule({ enabled: false });
    await seedSchedule({ deletedAt: 1000 });
    await seedSchedule({ phaseStatus: "completed" });

    const { result } = await mountHook();

    expect(result.current.dialogOpen).toBe(false);
  });

  it("lists every distinct mismatched anchor with its doses", async () => {
    await seedSchedule({ anchorTimezone: "Africa/Johannesburg", name: "Alpha" });
    await seedSchedule({ anchorTimezone: "America/New_York", name: "Beta" });
    await seedSchedule({ anchorTimezone: "Europe/Berlin", name: "Gamma" });

    const { result } = await mountHook();

    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    const anchors = result.current.anchors.map((g) => g.anchorTimezone).sort();
    expect(anchors).toEqual(["Africa/Johannesburg", "America/New_York"]);
    const beta = result.current.anchors.find((g) => g.anchorTimezone === "America/New_York")!;
    expect(beta.doses).toEqual([
      expect.objectContaining({ name: "Beta", after: "08:30" }),
    ]);
  });

  it("remembers 'Not now' across a remount for the same device/anchor pair", async () => {
    await seedSchedule({ anchorTimezone: "Africa/Johannesburg" });

    const first = await mountHook();
    await waitFor(() => expect(first.result.current.dialogOpen).toBe(true));
    act(() => first.result.current.handleDismiss());
    expect(first.result.current.dialogOpen).toBe(false);
    first.unmount();

    expect(JSON.parse(localStorage.getItem(TIMEZONE_DISMISSALS_KEY)!)).toEqual([
      "Europe/Berlin|Africa/Johannesburg",
    ]);

    // A cold start in the same zone does not prompt again.
    const second = await mountHook();
    expect(second.result.current.dialogOpen).toBe(false);
    second.unmount();

    // Moving on to another zone does.
    device.tz = "Asia/Tokyo";
    const third = await mountHook();
    await waitFor(() => expect(third.result.current.dialogOpen).toBe(true));
  });

  it("still prompts for an anchor that was not part of the dismissal", async () => {
    await seedSchedule({ anchorTimezone: "Africa/Johannesburg" });
    localStorage.setItem(
      TIMEZONE_DISMISSALS_KEY,
      JSON.stringify(["Europe/Berlin|Africa/Johannesburg"]),
    );
    await seedSchedule({ anchorTimezone: "America/New_York" });

    const { result } = await mountHook();

    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    expect(result.current.anchors.map((g) => g.anchorTimezone)).toEqual(["America/New_York"]);
  });

  it("clears the timezone cache on every resume, even after a dismissal", async () => {
    await seedSchedule({ anchorTimezone: "Africa/Johannesburg" });

    const { result } = await mountHook();
    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    act(() => result.current.handleDismiss());

    const before = device.clearCalls;
    await act(async () => {
      setVisibility("visible");
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(device.clearCalls).toBe(before + 1);
    expect(result.current.dialogOpen).toBe(false);
  });

  it("confirming re-anchors the schedules and keeps their time", async () => {
    const { schedule } = await seedSchedule({ anchorTimezone: "Africa/Johannesburg" });

    const { result } = await mountHook();
    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    await act(async () => {
      await result.current.handleConfirm();
    });

    expect(result.current.dialogOpen).toBe(false);
    const updated = await db.phaseSchedules.get(schedule.id);
    expect(updated!.anchorTimezone).toBe("Europe/Berlin");
    expect(updated!.time).toBe("08:30");
  });
});
