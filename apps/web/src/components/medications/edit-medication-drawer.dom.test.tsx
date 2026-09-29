// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as AuthGuardMod from "@/components/auth-guard";

// The Info tab's "Refresh AI Data" path calls the medicine-search hook and the
// Details tab's lookup panel calls `searchMedicine`; stub both so nothing
// reaches the network.
const searchMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-medicine-search", () => ({
  useMedicineSearch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  searchMedicine: (...args: unknown[]) => searchMock(...args),
  MedicineSearchCancelledError: class MedicineSearchCancelledError extends Error {},
  MedicineSearchError: class MedicineSearchError extends Error {},
}));

// Signed in, so the Details tab offers the AI lookup.
vi.mock("@/components/auth-guard", async (importActual) => ({
  ...(await importActual<typeof AuthGuardMod>()),
  useAuthGate: () => true,
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

  it("orders the schedule day picker from the user's week start", async () => {
    const { prescription, phase, schedule } = regimen();
    const seed = {
      prescriptions: [prescription],
      medicationPhases: [phase],
      phaseSchedules: [schedule],
    };
    const dayLabels = () =>
      screen
        .getAllByRole("button")
        .map((b) => b.textContent ?? "")
        .filter((t) => /^(Su|Mo|Tu|We|Th|Fr|Sa)$/.test(t));

    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={prescription} open onOpenChange={() => {}} />,
      { seed, settings: { weekStartsOn: 0 } },
    );
    await screen.findByDisplayValue("08:00");
    expect(dayLabels()).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
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

    // The edit header exposes Cancel and Save buttons; Save commits.
    const detailsHeading = screen.getByText("Prescription Details");
    const headerRow = detailsHeading.parentElement!;
    await user.click(within(headerRow).getByRole("button", { name: /save details/i }));

    await vi.waitFor(async () => {
      const rx = await db.prescriptions.get(prescription.id);
      expect(rx?.genericName).toBe("Lisinopril XR");
    });
  });

  it("Details edit mode: the AI lookup fills the name and reason for use, and explains what it can't", async () => {
    searchMock.mockResolvedValue({
      brandNames: ["Zestril"],
      genericName: "lisinopril",
      activeIngredients: ["Lisinopril"],
      dosageStrengths: ["10 mg"],
      commonIndications: ["High blood pressure (hypertension)"],
      foodInstruction: "none",
      pillColor: "pink",
      pillShape: "round",
    });
    const user = userEvent.setup();
    const { prescription, phase, schedule } = regimen();
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={prescription} open onOpenChange={() => {}} />,
      { seed: { prescriptions: [prescription], medicationPhases: [phase], phaseSchedules: [schedule] } },
    );

    await user.click(screen.getByRole("tab", { name: /details/i }));
    // Read-only view: no lookup until editing.
    expect(screen.queryByText("Look up with AI")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /^edit$/i }));

    // The field is empty, so the lookup uses the name in the form.
    await user.click(screen.getByRole("button", { name: "Look up with AI" }));
    expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ query: "Lisinopril" }));
    expect(await screen.findByText("Found: lisinopril")).toBeInTheDocument();

    const food = screen.getByRole("checkbox", { name: /Food instruction/ });
    expect(food).toHaveAttribute("aria-disabled", "true");
    expect(food).toHaveTextContent("Set the food instruction on the Schedule tab");
    // A single drug: nothing to say about where compounds are edited.
    expect(screen.getByRole("checkbox", { name: /Compounds/ })).toHaveTextContent(
      "Single drug: no compounds to fill in",
    );

    await user.click(screen.getByRole("button", { name: "Apply to form" }));
    expect(screen.getByText("Filled in from AI lookup")).toBeInTheDocument();
    expect(screen.getByDisplayValue("High blood pressure")).toBeInTheDocument();

    const headerRow = screen.getByText("Prescription Details").parentElement!;
    await user.click(within(headerRow).getByRole("button", { name: /save details/i }));
    await vi.waitFor(async () => {
      const rx = await db.prescriptions.get(prescription.id);
      expect(rx?.indication).toBe("High blood pressure");
      expect(rx?.genericName).toBe("Lisinopril");
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

  it("Medicine tab reads a unit typed into the strength field instead of ignoring it", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule } = regimen();
    const brand = makeInventoryItem(prescription.id, { brandName: "Zestril", strength: 10, unit: "mg", currentStock: 0 });
    await renderWithFixtures(
      <PrescriptionViewDrawer prescription={prescription} open onOpenChange={() => {}} />,
      { seed: { prescriptions: [prescription], medicationPhases: [phase], phaseSchedules: [schedule], inventoryItems: [brand] } },
    );

    await user.click(screen.getByRole("tab", { name: /medicine/i }));
    await user.click(await screen.findByRole("button", { name: /edit zestril/i }));
    const strength = screen.getByLabelText(/^strength$/i);
    // "500 mcg" with the unit select on mg is 0.5 mg, not 500 mg.
    await user.clear(strength);
    await user.type(strength, "500 mcg");
    expect(await screen.findByText(/1 pill = 0\.5 mg/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save medicine/i }));
    await vi.waitFor(async () => {
      const item = await db.inventoryItems.get(brand.id);
      expect(item?.strength).toBe(0.5);
      expect(item?.unit).toBe("mg");
    });

    // A unit that can't be converted to the selected one blocks the save.
    await user.click(await screen.findByRole("button", { name: /edit zestril/i }));
    const again = screen.getByLabelText(/^strength$/i);
    await user.clear(again);
    await user.type(again, "5 ml");
    expect(await screen.findByText(/can't be converted to mg/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save medicine/i })).toBeDisabled();
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
