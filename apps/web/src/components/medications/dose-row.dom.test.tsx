// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DoseRow } from "@/components/medications/dose-row";
import { TimeSlotGroup } from "@/components/medications/time-slot-group";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * A taken/skipped/future dose row opens the dose detail on tap. It is exposed
 * as role=button with tabIndex=0, so it must also open on Enter/Space, while
 * key presses on the row's own inner buttons stay with those buttons.
 */
function takenSlot(): DoseSlot {
  const prescription = makePrescription({ genericName: "Lisinopril" });
  const phase = makeMedicationPhase(prescription.id);
  const schedule = makePhaseSchedule(phase.id, { dosage: 10 });
  return {
    prescriptionId: prescription.id,
    phaseId: phase.id,
    scheduleId: schedule.id,
    scheduledDate: "2023-11-14",
    scheduleTimeUTC: 480,
    localTime: "08:00",
    dosageMg: 10,
    unit: "mg",
    status: "taken",
    existingLog: makeDoseLog(prescription.id, phase.id, schedule.id, { status: "taken" }),
    prescription,
    phase,
    schedule,
  };
}

function renderRow() {
  const onDoseClick = vi.fn();
  render(
    <DoseRow
      slot={takenSlot()}
      isToday={false}
      isFuture={false}
      onTake={vi.fn()}
      onRetroactiveTake={vi.fn()}
      onSkip={vi.fn()}
      onDoseClick={onDoseClick}
      onEditTime={vi.fn()}
    />,
  );
  return { onDoseClick };
}

describe("DoseRow keyboard access", () => {
  it.each([["{Enter}"], [" "]])("opens the dose detail when %s is pressed on the row", async (key) => {
    const user = userEvent.setup();
    const { onDoseClick } = renderRow();

    const row = screen.getByText("Lisinopril").closest<HTMLElement>("[role=button]")!;
    row.focus();
    await user.keyboard(key);

    expect(onDoseClick).toHaveBeenCalledTimes(1);
  });

  it("does not open the dose detail when Enter is pressed on the inner Edit button", async () => {
    const user = userEvent.setup();
    const { onDoseClick } = renderRow();

    screen.getByRole("button", { name: "Edit" }).focus();
    await user.keyboard("{Enter}");

    expect(onDoseClick).not.toHaveBeenCalled();
  });
});

describe("DoseRow Ward Console markup", () => {
  function renderSlot(slot: DoseSlot, isToday = false) {
    render(
      <DoseRow
        slot={slot}
        isToday={isToday}
        isFuture={false}
        onTake={vi.fn()}
        onRetroactiveTake={vi.fn()}
        onSkip={vi.fn()}
        onDoseClick={vi.fn()}
        onEditTime={vi.fn()}
      />,
    );
    return screen.getByText("Lisinopril").closest<HTMLElement>("[data-status]")!;
  }

  it("is a flat, square row: no rounded card or pastel status tint", () => {
    const row = renderSlot(takenSlot());
    expect(row.dataset.status).toBe("taken");
    expect(row.className).not.toMatch(/rounded|emerald|bg-gray|amber/);
    expect(screen.getByText(/Taken at/)).toHaveClass("text-meds");
  });

  it("flags a missed dose with the sodium stripe and a Missed line, and keeps Take/Skip", () => {
    const slot = { ...takenSlot(), status: "missed" as const };
    delete slot.existingLog;
    const row = renderSlot(slot);
    expect(row.className).toContain("shadow-[inset_3px_0_0_hsl(var(--sodium))]");
    expect(screen.getByText("Missed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("gives Take, Skip and Edit a 44px tap target (36px button + 4px hit area above and below)", () => {
    const slot = { ...takenSlot(), status: "pending" as const };
    delete slot.existingLog;
    renderSlot(slot);
    for (const name of ["Take", "Skip"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn).toHaveClass("relative", "h-9", "before:absolute", "before:-inset-y-1", "before:inset-x-0");
    }
  });

  it("gives the slot header's Skip All and Mark All a 44px tap target (32px + 6px above and below)", () => {
    const slot = { ...takenSlot(), status: "pending" as const };
    delete slot.existingLog;
    render(
      <TimeSlotGroup
        time="08:00"
        slots={[slot]}
        isToday={false}
        isFuture={false}
        isNextUpcoming={false}
        onTake={vi.fn()}
        onRetroactiveTake={vi.fn()}
        onSkip={vi.fn()}
        onDoseClick={vi.fn()}
        onMarkAll={vi.fn()}
        onSkipAll={vi.fn()}
        onEditAll={vi.fn()}
        onEditTime={vi.fn()}
      />,
    );
    for (const name of ["Skip All", "Mark All"]) {
      expect(screen.getByRole("button", { name })).toHaveClass(
        "relative",
        "h-8",
        "before:absolute",
        "before:-inset-y-1.5",
      );
    }
  });

  it("strikes through a skipped dose and shows the reason", () => {
    const slot = {
      ...takenSlot(),
      status: "skipped" as const,
      existingLog: { ...takenSlot().existingLog!, status: "skipped" as const, skipReason: "Side effects" },
    };
    renderSlot(slot);
    expect(screen.getByText("Lisinopril")).toHaveClass("line-through");
    expect(screen.getByText("Side effects")).toBeInTheDocument();
  });
});
