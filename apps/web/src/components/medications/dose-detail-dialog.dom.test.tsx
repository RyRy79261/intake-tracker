// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { useDoseActions } from "@/components/medications/use-dose-actions";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
// The test reads the seeded IndexedDB directly to assert the writes.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import type { SlotDay } from "@intake/core/dose-rules";

const at = (h: number, m: number, day = 0) => new Date(2026, 9, 19 + day, h, m).getTime();
const DATE = "2026-10-19";

function buildSlot(overrides: Partial<DoseSlot> = {}): DoseSlot {
  const prescription = makePrescription({ genericName: "Metoprolol" });
  const phase = makeMedicationPhase(prescription.id, { unit: "mg", foodInstruction: "none" });
  const schedule = makePhaseSchedule(phase.id, { dosage: 50, time: "08:30" });
  const inventory = makeInventoryItem(prescription.id, {
    brandName: "Lopressor",
    strength: 50,
    currentStock: 12,
  });
  return {
    prescriptionId: prescription.id,
    phaseId: phase.id,
    scheduleId: schedule.id,
    scheduledDate: DATE,
    scheduleTimeUTC: 510,
    localTime: "08:30",
    scheduledAt: at(8, 30),
    dueAt: at(8, 30),
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

function withLog(slot: DoseSlot, log: Parameters<typeof makeDoseLog>[3]): DoseSlot {
  return { ...slot, existingLog: makeDoseLog(slot.prescriptionId, slot.phaseId, slot.scheduleId, log) };
}

function Harness({ slot, day, now, onOpenInfo }: { slot: DoseSlot; day: SlotDay; now: number; onOpenInfo?: (id: string) => void }) {
  const actions = useDoseActions();
  return (
    <>
      <DoseDetailDialog
        open
        onOpenChange={() => {}}
        slot={slot}
        day={day}
        now={now}
        actions={actions}
        {...(onOpenInfo && { onOpenInfo })}
      />
      {actions.sheets}
    </>
  );
}

async function renderDialog(slot: DoseSlot, day: SlotDay = "today", now = at(9, 0), onOpenInfo?: (id: string) => void) {
  return renderWithFixtures(<Harness slot={slot} day={day} now={now} {...(onOpenInfo && { onOpenInfo })} />, {
    seed: {
      prescriptions: [slot.prescription],
      medicationPhases: [slot.phase],
      phaseSchedules: [slot.schedule],
      inventoryItems: slot.inventory ? [slot.inventory] : [],
      ...(slot.existingLog && { doseLogs: [slot.existingLog] }),
    },
  });
}

const button = (name: string) => screen.queryByRole("button", { name });

afterEach(() => {
  vi.useRealTimers();
});

describe("DoseDetailDialog", () => {
  it("shows the brand with its strength, the generic name, the schedule and the pills left", async () => {
    await renderDialog(buildSlot());
    expect(screen.getByText("Lopressor 50mg")).toBeInTheDocument();
    expect(screen.getByText("Metoprolol")).toBeInTheDocument();
    expect(screen.getByText(/Scheduled for 08:30, Monday, Oct 19/)).toBeInTheDocument();
    expect(screen.getByText("12 pills left")).toBeInTheDocument();
  });

  it("shows when the medicine was last taken", async () => {
    const slot = buildSlot();
    const earlier = makeDoseLog(slot.prescriptionId, slot.phaseId, slot.scheduleId, {
      scheduledDate: "2026-10-18",
      status: "taken",
      actionTimestamp: at(8, 31, -1),
    });
    await renderWithFixtures(<Harness slot={slot} day="today" now={at(9, 0)} />, {
      seed: {
        prescriptions: [slot.prescription],
        medicationPhases: [slot.phase],
        phaseSchedules: [slot.schedule],
        inventoryItems: [slot.inventory!],
        doseLogs: [earlier],
      },
    });
    expect(await screen.findByText("Last taken at 08:31, yesterday")).toBeInTheDocument();
  });

  it("has Info and Edit in the header", async () => {
    const user = userEvent.setup();
    const onOpenInfo = vi.fn();
    const slot = buildSlot();
    await renderDialog(slot, "today", at(9, 0), onOpenInfo);
    await user.click(screen.getByRole("button", { name: "About Metoprolol" }));
    expect(onOpenInfo).toHaveBeenCalledWith(slot.prescriptionId);
    expect(screen.getByRole("button", { name: "Edit Metoprolol" })).toBeInTheDocument();
  });

  // The action bar table of section 4.5.
  it("an open dose today: Skip, Take and Reschedule", async () => {
    await renderDialog(buildSlot());
    expect(button("Skip")).toBeInTheDocument();
    expect(button("Take")).toBeInTheDocument();
    expect(button("Reschedule")).toBeInTheDocument();
    expect(button("Untake")).not.toBeInTheDocument();
  });

  it("a missed dose can still be taken or skipped", async () => {
    await renderDialog(buildSlot({ status: "missed" }), "today", at(9, 5));
    expect(screen.getByTestId("dialog-status")).toHaveTextContent("Missed");
    expect(button("Skip")).toBeInTheDocument();
    expect(button("Take")).toBeInTheDocument();
  });

  it("a taken dose: Untake and Change time, no Take or Skip", async () => {
    await renderDialog(withLog(buildSlot({ status: "taken" }), { scheduledDate: DATE, status: "taken", actionTimestamp: at(8, 32) }));
    expect(screen.getByTestId("dialog-status")).toHaveTextContent("Taken at 08:32");
    expect(button("Untake")).toBeInTheDocument();
    expect(button("Change time")).toBeInTheDocument();
    expect(button("Take")).not.toBeInTheDocument();
    expect(button("Skip")).not.toBeInTheDocument();
    expect(button("Reschedule")).not.toBeInTheDocument();
  });

  it("a skipped dose: Unskip, Take and Reschedule", async () => {
    await renderDialog(withLog(buildSlot({ status: "skipped" }), { scheduledDate: DATE, status: "skipped", skipReason: "Cost" }));
    expect(screen.getByTestId("dialog-status")).toHaveTextContent("Skipped · Cost");
    expect(button("Unskip")).toBeInTheDocument();
    expect(button("Take")).toBeInTheDocument();
    expect(button("Reschedule")).toBeInTheDocument();
    expect(button("Skip")).not.toBeInTheDocument();
  });

  it("a dose of a future day cannot be taken or skipped", async () => {
    await renderDialog(buildSlot({ scheduledDate: "2026-10-20", dueAt: at(8, 30, 1) }), "future");
    expect(button("Take")).not.toBeInTheDocument();
    expect(button("Skip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("late-warning")).not.toBeInTheDocument();
  });

  it("warns only after the late window, never before the dose time", async () => {
    const { unmount } = await renderDialog(buildSlot(), "today", at(9, 10));
    expect(screen.queryByTestId("late-warning")).not.toBeInTheDocument();
    unmount();
    await renderDialog(buildSlot(), "today", at(9, 11));
    expect(screen.getByTestId("late-warning")).toHaveTextContent(
      "You have not marked this dose. Consider if it is safe to take it now.",
    );
  });

  it("Take inside the late window records now; after it, asks first", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(9, 0));
    const user = userEvent.setup();
    const slot = buildSlot();
    await renderDialog(slot, "today", at(9, 0));
    await user.click(button("Take")!);
    await waitFor(async () => {
      const log = await db.doseLogs.where("scheduleId").equals(slot.scheduleId).first();
      expect(log).toMatchObject({ status: "taken", actionTimestamp: at(9, 0) });
    });
    expect(screen.queryByText(/When did you take/)).not.toBeInTheDocument();
  });

  it("Take after the late window opens the time-taken sheet with the three options", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    await renderDialog(buildSlot({ dueAt: now - 3 * 3_600_000 }), "today", now);
    await user.click(button("Take")!);
    expect(await screen.findByText("When did you take Lopressor?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Take now \(\d{2}:\d{2}\)$/ })).toBeInTheDocument();
    expect(button("Take at a specific time")).toBeInTheDocument();
    expect(button("Skip")).toBeInTheDocument();
  });
});
