// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { DoseDetailDialog } from "@/components/medications/dose-detail-dialog";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";
import type { DoseSlot } from "@/hooks/use-medication-queries";

/**
 * DoseDetailDialog receives a fully-built DoseSlot as a prop (it does not fetch
 * its own data), so these tests assemble a coherent slot and assert the drawer
 * surfaces the dose details. Rendered with `open` so the drawer is mounted.
 */
function buildSlot(overrides: Partial<DoseSlot> = {}): DoseSlot {
  const prescription = makePrescription({ genericName: "Metoprolol" });
  const phase = makeMedicationPhase(prescription.id, {
    unit: "mg",
    foodInstruction: "none",
  });
  const schedule = makePhaseSchedule(phase.id, { dosage: 50, time: "08:00" });
  const inventory = makeInventoryItem(prescription.id, {
    prescriptionId: prescription.id,
    brandName: "Lopressor",
    strength: 50,
  });
  return {
    prescriptionId: prescription.id,
    phaseId: phase.id,
    scheduleId: schedule.id,
    scheduledDate: "2024-03-10",
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

describe("DoseDetailDialog", () => {
  it("renders nothing when no slot is supplied", async () => {
    const { container } = await renderWithFixtures(
      <DoseDetailDialog
        open
        onOpenChange={() => {}}
        slot={null}
        isToday
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the medicine name, strength and schedule for a pending dose", async () => {
    const slot = buildSlot();
    await renderWithFixtures(
      <DoseDetailDialog
        open
        onOpenChange={() => {}}
        slot={slot}
        isToday
      />,
    );

    expect(
      await screen.findByText(/Lopressor 50mg \(Metoprolol\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Scheduled for 08:00/)).toBeInTheDocument();
  });

  it("offers Take, Skip and Reschedule actions for a today pending dose", async () => {
    const slot = buildSlot();
    await renderWithFixtures(
      <DoseDetailDialog
        open
        onOpenChange={() => {}}
        slot={slot}
        isToday
      />,
    );

    expect(await screen.findByText("TAKE")).toBeInTheDocument();
    expect(screen.getByText("SKIP")).toBeInTheDocument();
    expect(screen.getByText("RESCHEDULE")).toBeInTheDocument();
  });

  it("shows UNTAKE (not TAKE) and the taken time for an already-taken dose", async () => {
    const base = buildSlot();
    const takenAt = new Date("2024-03-10T08:05:00").getTime();
    const slot = buildSlot({
      status: "taken",
      existingLog: makeDoseLog(
        base.prescriptionId,
        base.phaseId,
        base.scheduleId,
        {
          status: "taken",
          scheduledDate: "2024-03-10",
          actionTimestamp: takenAt,
        },
      ),
    });

    await renderWithFixtures(
      <DoseDetailDialog
        open
        onOpenChange={() => {}}
        slot={slot}
        isToday
      />,
    );

    expect(await screen.findByText("UNTAKE")).toBeInTheDocument();
    expect(screen.queryByText("TAKE")).not.toBeInTheDocument();
    expect(screen.getByText(/Taken at/)).toBeInTheDocument();
  });

  it("surfaces the skip reason for a skipped dose", async () => {
    const base = buildSlot();
    const slot = buildSlot({
      status: "skipped",
      existingLog: makeDoseLog(
        base.prescriptionId,
        base.phaseId,
        base.scheduleId,
        {
          status: "skipped",
          scheduledDate: "2024-03-10",
          actionTimestamp: new Date("2024-03-10T09:00:00").getTime(),
          skipReason: "Ran out",
        },
      ),
    });

    await renderWithFixtures(
      <DoseDetailDialog
        open
        onOpenChange={() => {}}
        slot={slot}
        isToday
      />,
    );

    expect(await screen.findByText(/Reason: Ran out/)).toBeInTheDocument();
    // A skipped dose cannot be skipped again.
    expect(screen.queryByText("SKIP")).not.toBeInTheDocument();
  });
});
