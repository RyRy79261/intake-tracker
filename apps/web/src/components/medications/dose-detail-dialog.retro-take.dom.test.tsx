// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";
import type { DoseSlot } from "@/hooks/use-medication-queries";

const takeMutateAsync = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/hooks/use-medication-queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-medication-queries")>();
  return {
    ...actual,
    useTakeDose: () => ({ mutateAsync: takeMutateAsync }),
  };
});

function buildSlot(overrides: Partial<DoseSlot> = {}): DoseSlot {
  const prescription = makePrescription({ genericName: "Metoprolol" });
  const phase = makeMedicationPhase(prescription.id, { unit: "mg", foodInstruction: "none" });
  const schedule = makePhaseSchedule(phase.id, { dosage: 50, time: "08:00" });
  const inventory = makeInventoryItem(prescription.id, { prescriptionId: prescription.id });
  return {
    prescriptionId: prescription.id,
    phaseId: phase.id,
    scheduleId: schedule.id,
    scheduledDate: "2024-03-10",
    scheduleTimeUTC: 480,
    localTime: "08:00",
    dosageMg: 50,
    unit: "mg",
    status: "missed",
    prescription,
    phase,
    schedule,
    inventory,
    pillsPerDose: 1,
    ...overrides,
  };
}

/**
 * A past-date Take asks when the dose was actually taken. That time is the
 * taken-at time; the slot is still identified by its scheduled time
 * (doses-titration-schedule#5).
 */
describe("DoseDetailDialog retroactive take", () => {
  it("passes the slot time as the key and the picked time as takenAtTime", async () => {
    const slot = buildSlot();
    await renderWithFixtures(
      <DoseDetailDialog open onOpenChange={() => {}} slot={slot} isToday={false} />,
    );

    fireEvent.click(await screen.findByText("TAKE"));
    const input = await screen.findByDisplayValue("08:00");
    fireEvent.change(input, { target: { value: "09:30" } });
    fireEvent.click(screen.getByText("Log Dose"));

    await waitFor(() => expect(takeMutateAsync).toHaveBeenCalledTimes(1));
    expect(takeMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: slot.scheduleId,
        date: "2024-03-10",
        time: "08:00",
        takenAtTime: "09:30",
      }),
    );
  });
});
