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
  makeInventoryItem,
  makeInventoryTransaction,
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

  it("offers a controlled unit list instead of free text", async () => {
    const { prescription, phase, schedule } = regimen();
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={prescription} open onOpenChange={() => {}} />,
      { seed: { prescriptions: [prescription], medicationPhases: [phase], phaseSchedules: [schedule] } },
    );

    const unit = await screen.findByLabelText(/dosage unit/i);
    expect(unit.tagName).toBe("SELECT");
    const options = within(unit).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["mg", "mcg", "g", "ml"]);
  });

  it("blocks a unit that doesn't match the active brand and converts doses when the unit changes", async () => {
    const user = userEvent.setup();
    const prescription = makePrescription({ genericName: "Levothyroxine" });
    const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
    const schedule = makePhaseSchedule(phase.id, { time: "07:00", dosage: 0.1 });
    const brand = makeInventoryItem(prescription.id, { brandName: "Eltroxin", strength: 100, unit: "mcg" });
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [brand],
        },
      },
    );

    const dose = await screen.findByDisplayValue("0.1");
    await user.clear(dose);
    await user.type(dose, "0.2");
    // Eltroxin is counted in mcg, so a mg schedule can't be saved.
    expect(await screen.findByText(/doses must be in mcg/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save schedule/i })).toBeDisabled();

    // Switching the unit converts the amount rather than just relabelling it.
    await user.selectOptions(screen.getByLabelText(/dosage unit/i), "mcg");
    expect(await screen.findByDisplayValue("200")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save schedule/i }));

    await vi.waitFor(async () => {
      expect((await db.medicationPhases.get(phase.id))?.unit).toBe("mcg");
      const rows = await db.phaseSchedules.where("phaseId").equals(phase.id).toArray();
      expect(rows.map((r) => r.dosage)).toEqual([200]);
    });
  });

  it("takes a combination dose as tablets of the active brand with a live preview", async () => {
    const user = userEvent.setup();
    const prescription = makePrescription({ genericName: "Sacubitril/valsartan" });
    const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
    const schedule = makePhaseSchedule(phase.id, { time: "08:00", dosage: 200 });
    const brand = makeInventoryItem(prescription.id, {
      brandName: "Entresto",
      strength: 100,
      unit: "mg",
      compounds: [
        { name: "Sacubitril", strength: 49 },
        { name: "Valsartan", strength: 51 },
      ],
    });
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [brand],
        },
      },
    );

    const tablets = await screen.findByLabelText(/tablets per dose/i);
    await vi.waitFor(() => expect(tablets).toHaveValue(2));
    expect(screen.getByText(/98\/102mg/)).toBeInTheDocument();

    await user.clear(tablets);
    await user.type(tablets, "1.5");
    expect(await screen.findByText(/73\.5\/76\.5mg/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save schedule/i }));

    await vi.waitFor(async () => {
      const rows = await db.phaseSchedules.where("phaseId").equals(phase.id).toArray();
      expect(rows.map((r) => r.dosage)).toEqual([150]);
    });
  });

  it("Medicine tab edits a brand's strength and refill alerts, keeping the mg on hand when asked", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule } = regimen();
    // Saved by an old wizard as a 1mg pill; the box really says 5mg. The
    // refill alerts were skipped at the time.
    const { refillAlertDays: _days, refillAlertPills: _pills, ...brand } = makeInventoryItem(
      prescription.id,
      { brandName: "Zestril", strength: 1, unit: "mg", currentStock: 30 },
    );
    const initial = makeInventoryTransaction(brand.id, { amount: 30 });
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={prescription} open onOpenChange={() => {}} />,
      {
        seed: {
          prescriptions: [prescription],
          medicationPhases: [phase],
          phaseSchedules: [schedule],
          inventoryItems: [brand],
          inventoryTransactions: [initial],
        },
      },
    );

    await user.click(screen.getByRole("tab", { name: /medicine/i }));
    await user.click(await screen.findByRole("button", { name: /edit zestril/i }));

    const strength = screen.getByLabelText(/^strength$/i);
    await user.clear(strength);
    await user.type(strength, "5");
    await user.type(screen.getByLabelText(/alert when days left/i), "7");
    await user.click(screen.getByRole("button", { name: /save medicine/i }));

    // Stock is on hand, so the strength change asks what the count means.
    expect(await screen.findByText(/you have 30 on hand/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /keep 30mg on hand/i }));

    await vi.waitFor(async () => {
      const item = await db.inventoryItems.get(brand.id);
      expect(item?.strength).toBe(5);
      expect(item?.refillAlertDays).toBe(7);
      const txs = await db.inventoryTransactions.where("inventoryItemId").equals(brand.id).toArray();
      const adjusted = txs.filter((t) => t.type === "adjusted");
      expect(adjusted.map((t) => t.amount)).toEqual([-24]);
      // The original entry is untouched — history isn't rewritten.
      expect(txs.find((t) => t.id === initial.id)?.amount).toBe(30);
    });
  });

  it("Medicine tab keeps the pill count when the strength is only corrected", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule } = regimen();
    const brand = makeInventoryItem(prescription.id, { brandName: "Zestril", strength: 1, unit: "mg", currentStock: 30 });
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={prescription} open onOpenChange={() => {}} />,
      { seed: { prescriptions: [prescription], medicationPhases: [phase], phaseSchedules: [schedule], inventoryItems: [brand] } },
    );

    await user.click(screen.getByRole("tab", { name: /medicine/i }));
    await user.click(await screen.findByRole("button", { name: /edit zestril/i }));
    const strength = screen.getByLabelText(/^strength$/i);
    await user.clear(strength);
    await user.type(strength, "10");
    await user.click(screen.getByRole("button", { name: /save medicine/i }));
    await user.click(await screen.findByRole("button", { name: /keep 30 pills/i }));

    await vi.waitFor(async () => {
      expect((await db.inventoryItems.get(brand.id))?.strength).toBe(10);
    });
    expect(await db.inventoryTransactions.count()).toBe(0);
  });

  it("Medicine tab rejects a strength unit that doesn't match the prescription", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule } = regimen();
    const brand = makeInventoryItem(prescription.id, { brandName: "Zestril", strength: 10, unit: "mg" });
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={prescription} open onOpenChange={() => {}} />,
      { seed: { prescriptions: [prescription], medicationPhases: [phase], phaseSchedules: [schedule], inventoryItems: [brand] } },
    );

    await user.click(screen.getByRole("tab", { name: /medicine/i }));
    await user.click(await screen.findByRole("button", { name: /edit zestril/i }));
    await user.selectOptions(screen.getByLabelText(/^unit$/i), "mcg");

    expect(await screen.findByText(/dosed in mg/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save medicine/i })).toBeDisabled();
  });
});
