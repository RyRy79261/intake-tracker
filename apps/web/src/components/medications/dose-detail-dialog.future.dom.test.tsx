// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A Radix Dialog opened on top of the vaul Drawer ping-pongs focus between
// the two focus traps in jsdom (stack overflow). Stand in a plain picker that
// shows its default and confirms a user-picked time.
vi.mock("@/components/medications/retroactive-time-picker", () => ({
  RetroactiveTimePicker: (props: {
    open: boolean;
    defaultTime: string;
    onConfirm: (time: string) => void;
  }) =>
    props.open ? (
      <div>
        <span data-testid="picker-default">{props.defaultTime}</span>
        <button onClick={() => props.onConfirm("07:30")}>Pick 07:30</button>
      </div>
    ) : null,
}));

import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
// The test reads the seeded IndexedDB directly to assert the write. The
// "components must use hooks, not db" rule targets component source, not tests.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { toLocalDateKey } from "@/lib/date-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";
import type { DoseSlot } from "@/hooks/use-medication-queries";

function buildSlot(overrides: Partial<DoseSlot> = {}): DoseSlot {
  const prescription = makePrescription({ genericName: "Metoprolol" });
  const phase = makeMedicationPhase(prescription.id, { unit: "mg", foodInstruction: "none" });
  const schedule = makePhaseSchedule(phase.id, { dosage: 50, time: "08:00" });
  const inventory = makeInventoryItem(prescription.id, { prescriptionId: prescription.id });
  return {
    prescriptionId: prescription.id,
    phaseId: phase.id,
    scheduleId: schedule.id,
    scheduledDate: "2099-01-02",
    scheduleTimeUTC: 480,
    localTime: "08:00",
    dosageMg: 50,
    unit: "mg",
    status: "pending",
    prescription,
    phase,
    schedule,
    inventory,
    pillsPerDose: 1,
    ...overrides,
  };
}

/**
 * The schedule row hides Take/Skip on future days; the detail drawer (reached
 * by tapping any non-actionable row) must apply the same guard.
 */
describe("DoseDetailDialog on a future date", () => {
  it("offers no TAKE or SKIP for a future pending dose", async () => {
    await renderWithFixtures(
      <DoseDetailDialog open onOpenChange={() => {}} slot={buildSlot()} isToday={false} isFuture />,
    );

    expect(await screen.findByText(/Scheduled for 08:00/)).toBeInTheDocument();
    expect(screen.queryByText("TAKE")).not.toBeInTheDocument();
    expect(screen.queryByText("SKIP")).not.toBeInTheDocument();
    expect(screen.queryByText("RESCHEDULE")).not.toBeInTheDocument();
  });

  it("still lets a future dose that was already (wrongly) taken be reversed", async () => {
    const base = buildSlot();
    const slot = buildSlot({
      status: "taken",
      existingLog: makeDoseLog(base.prescriptionId, base.phaseId, base.scheduleId, {
        status: "taken",
        scheduledDate: "2099-01-02",
        actionTimestamp: Date.now(),
      }),
    });
    await renderWithFixtures(
      <DoseDetailDialog open onOpenChange={() => {}} slot={slot} isToday={false} isFuture />,
    );

    expect(await screen.findByText("UNTAKE")).toBeInTheDocument();
    expect(screen.queryByText("SKIP")).not.toBeInTheDocument();
  });
});

describe("DoseDetailDialog on a past date", () => {
  it("keeps the slot key and records the picked time as the taken-at time", async () => {
    const user = userEvent.setup();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const slot = buildSlot({ scheduledDate: toLocalDateKey(d) });
    await renderWithFixtures(
      <DoseDetailDialog open onOpenChange={() => {}} slot={slot} isToday={false} />,
      {
        seed: {
          prescriptions: [slot.prescription],
          medicationPhases: [slot.phase],
          phaseSchedules: [slot.schedule],
          inventoryItems: [slot.inventory!],
        },
      },
    );

    await user.click(await screen.findByText("TAKE"));
    expect(await screen.findByTestId("picker-default")).toHaveTextContent("08:00");
    fireEvent.click(screen.getByText("Pick 07:30"));

    await waitFor(async () => {
      const logs = await db.doseLogs.where("scheduleId").equals(slot.scheduleId).toArray();
      expect(logs).toHaveLength(1);
      // Still keyed to the scheduled slot, so the schedule shows it as taken.
      expect(logs[0]?.scheduledTime).toBe("08:00");
      const at = new Date(logs[0]!.actionTimestamp!);
      expect([at.getHours(), at.getMinutes()]).toEqual([7, 30]);
    });
  });
});
