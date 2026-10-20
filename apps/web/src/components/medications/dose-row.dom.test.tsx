// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DoseRow } from "@/components/medications/dose-row";
import { TimeSlotGroup } from "@/components/medications/time-slot-group";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";

const DATE = "2026-10-19";
const at = (h: number, m: number, day = 0) => new Date(2026, 9, 19 + day, h, m).getTime();

function slot(overrides: Partial<DoseSlot> = {}): DoseSlot {
  const prescription = makePrescription({ genericName: "Bisoprolol" });
  const phase = makeMedicationPhase(prescription.id, { foodInstruction: "after" });
  const schedule = makePhaseSchedule(phase.id, { dosage: 5, time: "08:30" });
  const inventory = makeInventoryItem(prescription.id, { brandName: "Concor", strength: 5, unit: "mg" });
  return {
    prescriptionId: prescription.id,
    phaseId: phase.id,
    scheduleId: schedule.id,
    scheduledDate: DATE,
    scheduleTimeUTC: 510,
    localTime: "08:30",
    scheduledAt: at(8, 30),
    dueAt: at(8, 30),
    dosageMg: 5,
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

function logged(base: DoseSlot, log: Parameters<typeof makeDoseLog>[3]): DoseSlot {
  return { ...base, existingLog: makeDoseLog(base.prescriptionId, base.phaseId, base.scheduleId, log) };
}

function renderRow(s: DoseSlot, props: Partial<Parameters<typeof DoseRow>[0]> = {}) {
  const onOpen = vi.fn();
  const onTake = vi.fn();
  const onTakeLongPress = vi.fn();
  render(
    <DoseRow slot={s} isFuture={false} onOpen={onOpen} onTake={onTake} onTakeLongPress={onTakeLongPress} {...props} />,
  );
  return { onOpen, onTake, onTakeLongPress };
}

describe("DoseRow", () => {
  it("shows the name on the box, the dose line with · and no status for an open dose", () => {
    renderRow(slot());
    expect(screen.getByText("Concor")).toBeInTheDocument();
    expect(screen.getByText("1 tablet of 5mg · with food")).toBeInTheDocument();
    expect(screen.queryByTestId("dose-status")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("--");
  });

  it("falls back to the generic name when there is no brand", () => {
    const s = slot();
    delete s.inventory;
    renderRow(s);
    expect(screen.getByText("Bisoprolol")).toBeInTheDocument();
  });

  it.each([
    ["taken", { status: "taken" as const, actionTimestamp: at(8, 32) }, "Taken at 08:32"],
    ["taken on another day", { status: "taken" as const, actionTimestamp: at(0, 40, 1) }, "Taken at 00:40, Oct 20"],
    ["skipped", { status: "skipped" as const, skipReason: "Forgot / busy / asleep" }, "Skipped · Forgot / busy / asleep"],
  ])("shows the status line of a %s dose", (_label, log, line) => {
    const base = slot({ status: log.status });
    renderRow(logged(base, { scheduledDate: DATE, ...log }));
    expect(screen.getByTestId("dose-status")).toHaveTextContent(line);
  });

  it("flags a missed dose with the sodium stripe and a Missed line", () => {
    renderRow(slot({ status: "missed" }));
    expect(screen.getByTestId("dose-row")).toHaveAttribute("data-status", "missed");
    expect(screen.getByTestId("dose-row").className).toContain("shadow-[inset_3px_0_0_hsl(var(--sodium))]");
    expect(screen.getByTestId("dose-status")).toHaveTextContent("Missed");
  });

  it.each(["pending", "missed", "taken", "skipped"] as const)("a tap on a %s row opens the dose dialog", async (status) => {
    const user = userEvent.setup();
    const { onOpen } = renderRow(slot({ status }));
    await user.click(screen.getAllByRole("button", { name: /Open dose/ })[0]!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("has a round Take button and no Skip button on the row", async () => {
    const user = userEvent.setup();
    const { onTake } = renderRow(slot());
    expect(screen.queryByRole("button", { name: /^Skip/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Take Concor" }));
    expect(onTake).toHaveBeenCalledTimes(1);
  });

  it("a long press of Take asks for the time instead of taking", () => {
    const { onTake, onTakeLongPress } = renderRow(slot());
    const take = screen.getByRole("button", { name: "Take Concor" });
    fireEvent.contextMenu(take);
    fireEvent.click(take);
    expect(onTakeLongPress).toHaveBeenCalledTimes(1);
    expect(onTake).not.toHaveBeenCalled();
  });

  it("shows a filled check once taken; a tap on it opens the dialog", async () => {
    const user = userEvent.setup();
    const base = slot({ status: "taken" });
    const { onOpen, onTake } = renderRow(logged(base, { status: "taken", actionTimestamp: at(8, 32), scheduledDate: DATE }));
    const check = screen.getByRole("button", { name: "Concor taken. Open dose" });
    expect(check).toHaveAttribute("aria-pressed", "true");
    await user.click(check);
    expect(onOpen).toHaveBeenCalled();
    expect(onTake).not.toHaveBeenCalled();
  });

  it("has no Take button on a future day, nor in the modal", () => {
    renderRow(slot(), { isFuture: true });
    expect(screen.queryByRole("button", { name: /^Take/ })).not.toBeInTheDocument();
  });

  it("gives Take a 44px tap target", () => {
    renderRow(slot());
    expect(screen.getByRole("button", { name: "Take Concor" }).className).toMatch(/\bh-11\b.*\bw-11\b/);
  });
});

describe("TimeSlotGroup header", () => {
  function renderGroup(slots: DoseSlot[], now: number) {
    const onMarkAll = vi.fn();
    render(
      <TimeSlotGroup
        time="08:30"
        slots={slots}
        isFuture={false}
        isToday
        now={now}
        onOpenDose={vi.fn()}
        onTake={vi.fn()}
        onTakeLongPress={vi.fn()}
        onMarkAll={onMarkAll}
      />,
    );
    return { onMarkAll };
  }

  it('shows "Mark all doses" for two or more doses', async () => {
    const user = userEvent.setup();
    const { onMarkAll } = renderGroup([slot(), slot()], at(8, 0));
    await user.click(screen.getByRole("button", { name: "Mark all doses" }));
    expect(onMarkAll).toHaveBeenCalledWith("08:30");
  });

  it("has no header button for one dose: the row does the work", () => {
    renderGroup([slot()], at(8, 0));
    expect(screen.queryByRole("button", { name: "Mark all doses" })).not.toBeInTheDocument();
  });

  it("colours the time primary within an hour of now, and in the missed colour when a dose is missed", () => {
    renderGroup([slot(), slot()], at(9, 0));
    expect(screen.getByTestId("slot-time").className).toContain("text-meds");
  });

  it("uses the missed colour when a dose in it is missed", () => {
    renderGroup([slot({ status: "missed" }), slot()], at(9, 5));
    expect(screen.getByTestId("slot-time").className).toContain("text-sodium");
  });

  it("is plain more than an hour away", () => {
    renderGroup([slot(), slot()], at(6, 0));
    expect(screen.getByTestId("slot-time").className).toContain("text-foreground");
  });
});
