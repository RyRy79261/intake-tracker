// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DoseRow } from "@/components/medications/dose-row";
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
