// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The Info tab's "Refresh AI Data" path calls the medicine-search hook; the
// other tabs (Schedule, Details) under test never touch it, but the module is
// imported eagerly so provide a harmless stub.
vi.mock("@/hooks/use-medicine-search", () => ({
  useMedicineSearch: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { PrescriptionViewDrawer } from "@/components/medications/edit-medication-drawer";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
// A test asserting a write reached Dexie needs the db handle directly; the
// no-restricted-imports rule targets app components, not test files.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";

function regimen() {
  const prescription = makePrescription({
    genericName: "Lisinopril",
    indication: "Hypertension",
    notes: "Take with water",
  });
  const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
  const schedule = makePhaseSchedule(phase.id, { time: "08:00", dosage: 10 });
  return { prescription, phase, schedule };
}

describe("PrescriptionViewDrawer", () => {
  it("renders nothing when no prescription is supplied", async () => {
    const { container } = await renderWithFixtures(
      <PrescriptionViewDrawer
        prescription={null}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the seeded prescription name and its schedule", async () => {
    const { prescription, phase, schedule } = regimen();
    await renderWithFixtures(
      <PrescriptionViewDrawer
        prescription={prescription}
        open
        onOpenChange={() => {}}
      />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
        },
      },
    );

    expect(await screen.findByText("Lisinopril")).toBeInTheDocument();
    // Schedule tab is the default — the seeded 08:00 dose row hydrates in.
    const timeInput = await screen.findByDisplayValue("08:00");
    expect(timeInput).toBeInTheDocument();
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  });

  it("editing a dosage row reveals the Save control and persists on save", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule } = regimen();
    await renderWithFixtures(
      <PrescriptionViewDrawer
        prescription={prescription}
        open
        onOpenChange={() => {}}
      />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
        },
      },
    );

    const dosage = await screen.findByDisplayValue("10");
    // No Save button until the form is dirty.
    expect(
      screen.queryByRole("button", { name: /save schedule/i }),
    ).not.toBeInTheDocument();

    await user.clear(dosage);
    await user.type(dosage, "20");

    const save = await screen.findByRole("button", { name: /save schedule/i });
    await user.click(save);

    // The updatePhase mutation rewrites the schedule row in Dexie.
    await vi.waitFor(async () => {
      const rows = await db.phaseSchedules
        .where("phaseId")
        .equals(phase.id)
        .toArray();
      expect(rows.some((r) => r.dosage === 20)).toBe(true);
    });
  });

  it("Details tab shows indication and notes, and edit mode exposes inputs", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule } = regimen();
    await renderWithFixtures(
      <PrescriptionViewDrawer
        prescription={prescription}
        open
        onOpenChange={() => {}}
      />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /details/i }));
    expect(await screen.findByText("Take with water")).toBeInTheDocument();

    // Entering edit mode swaps the read-only view for editable inputs.
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const nameInput = await screen.findByDisplayValue("Lisinopril");
    expect(nameInput).toBeInTheDocument();
    // The "Reason for use" field is now an editable input too.
    expect(screen.getByDisplayValue("Hypertension")).toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, "Lisinopril XR");

    // The edit header exposes a cancel (X) and a save (check) icon button.
    // The save button carries the teal accent class — find it among the
    // header's icon buttons and click it to commit.
    const detailsHeading = screen.getByText("Prescription Details");
    const headerRow = detailsHeading.parentElement!;
    const saveBtn = within(headerRow)
      .getAllByRole("button")
      .find((b) => b.className.includes("teal"))!;
    await user.click(saveBtn);

    await vi.waitFor(async () => {
      const rx = await db.prescriptions.get(prescription.id);
      expect(rx?.genericName).toBe("Lisinopril XR");
    });
  });
});
