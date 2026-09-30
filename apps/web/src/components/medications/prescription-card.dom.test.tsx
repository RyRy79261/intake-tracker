// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PrescriptionCard } from "@/components/medications/prescription-card";
// The test reads the seeded IndexedDB directly to assert the PRN write. The
// "components must use hooks, not db" rule targets component source, not tests.
// eslint-disable-next-line no-restricted-imports
import { db, type DoseLog } from "@/lib/db";
import { toLocalDateKey } from "@/lib/date-utils";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
  makeInventoryItem,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";

/**
 * Exercises the real PrescriptionCard against a seeded IndexedDB. The card runs
 * its own data hooks (`usePhasesForPrescription`, `useInventoryForPrescription`,
 * `useDailyDoseSchedule`), so a coherent prescription -> phase -> schedule chain
 * is seeded for "today" (the schedule builder covers every day-of-week).
 */
describe("PrescriptionCard", () => {
  function buildRegimen() {
    const prescription = makePrescription({
      genericName: "Lisinopril",
      indication: "Blood pressure",
    });
    const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
    const schedule = makePhaseSchedule(phase.id, { dosage: 10, time: "09:00" });
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      brandName: "Zestril",
      strength: 10,
      currentStock: 40,
    });
    return { prescription, phase, schedule, inventory };
  }

  /** A taken as-needed log: like the real ones, it has no phase or schedule. */
  function makePrnLog(prescriptionId: string, overrides: Partial<DoseLog>): DoseLog {
    const { phaseId: _phaseId, scheduleId: _scheduleId, ...rest } = makeDoseLog(prescriptionId, "", "", {
      kind: "prn",
      status: "taken",
      ...overrides,
    });
    return rest;
  }

  it("renders the prescription name and indication", async () => {
    const { prescription, phase, schedule, inventory } = buildRegimen();
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("Lisinopril")).toBeInTheDocument();
    expect(screen.getByText("Blood pressure")).toBeInTheDocument();
  });

  it("shows the active medicine brand mini-card", async () => {
    const { prescription, phase, schedule, inventory } = buildRegimen();
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("Zestril")).toBeInTheDocument();
  });

  it("flags a negative-stock prescription with a Negative badge", async () => {
    const prescription = makePrescription({ genericName: "Furosemide" });
    const phase = makeMedicationPhase(prescription.id);
    const schedule = makePhaseSchedule(phase.id);
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      currentStock: -3,
      refillAlertPills: 14,
    });

    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("Negative")).toBeInTheDocument();
  });

  it("expands to reveal the CompoundCardExpanded detail when clicked", async () => {
    const user = userEvent.setup();
    const { prescription, phase, schedule, inventory } = buildRegimen();
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    await screen.findByText("Lisinopril");
    // Collapsed: the expanded "Medicines" section header is not present.
    expect(screen.queryByText("Medicines")).not.toBeInTheDocument();

    await user.click(screen.getByText("Lisinopril"));

    expect(await screen.findByText("Medicines")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /prescription details/i }),
    ).toBeInTheDocument();
  });

  it("does NOT show 'Log dose now' for a scheduled prescription", async () => {
    const { prescription, phase, schedule, inventory } = buildRegimen();
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    await screen.findByText("Lisinopril");
    // The phases hook loads async and the PRN affordances are gated on it, so
    // wait for the load to settle before asserting the button stays absent.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /log an as-needed dose/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows 'Log dose now' for an as-needed prescription and logs a PRN dose", async () => {
    const user = userEvent.setup();
    // No phase/schedule → the card treats this as an as-needed (PRN) med.
    const prescription = makePrescription({
      genericName: "Furosemide",
      indication: "Fluid overload",
    });
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      brandName: "Lasix",
      strength: 40,
      currentStock: 30,
    });

    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: { prescriptions: [prescription], inventoryItems: [inventory] },
    });

    await screen.findByText("Furosemide");
    // The name renders straight from the prop, but the "As needed" label and
    // the PRN button wait on the async phases hook — the same settling the
    // scheduled test above waits out. Assert on both with find*, not get*.
    expect(await screen.findByText("As needed")).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", {
        name: /log an as-needed dose of furosemide/i,
      }),
    );

    // The retroactive time picker opens; confirm logs the dose.
    await user.click(await screen.findByRole("button", { name: "Log Dose" }));

    await waitFor(async () => {
      const logs = await db.doseLogs
        .where("prescriptionId")
        .equals(prescription.id)
        .toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.kind).toBe("prn");
      expect(logs[0]?.status).toBe("taken");
      expect(logs[0]?.phaseId).toBeUndefined();
    });
  });

  it("lists logged as-needed doses and undoes one, restoring its stock", async () => {
    const user = userEvent.setup();
    const prescription = makePrescription({ genericName: "Furosemide" });
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      brandName: "Lasix",
      strength: 40,
      currentStock: 30,
    });

    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: { prescriptions: [prescription], inventoryItems: [inventory] },
    });

    await user.click(
      await screen.findByRole("button", { name: /log an as-needed dose of furosemide/i }),
    );
    await user.click(await screen.findByRole("button", { name: "Log Dose" }));
    await waitFor(async () => {
      expect((await db.inventoryItems.get(inventory.id))?.currentStock).toBe(29);
    });

    // The recent-dose list lives in the expanded card.
    await user.click(screen.getByRole("button", { name: /furosemide/i, expanded: false }));

    // First tap arms the removal, the second confirms it.
    await user.click(await screen.findByRole("button", { name: /^undo as-needed dose/i }));
    expect((await db.inventoryItems.get(inventory.id))?.currentStock).toBe(29);
    await user.click(screen.getByRole("button", { name: /confirm undo as-needed dose/i }));

    await waitFor(async () => {
      expect((await db.inventoryItems.get(inventory.id))?.currentStock).toBe(30);
      const logs = await db.doseLogs.where("prescriptionId").equals(prescription.id).toArray();
      expect(logs[0]?.deletedAt).not.toBeNull();
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /undo as-needed dose/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("does not accept a PRN time later than now", async () => {
    const user = userEvent.setup();
    const prescription = makePrescription({ genericName: "Furosemide" });
    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: { prescriptions: [prescription] },
    });

    await user.click(
      await screen.findByRole("button", { name: /log an as-needed dose of furosemide/i }),
    );
    await screen.findByRole("button", { name: "Log Dose" });
    const input = document.querySelector('input[type="time"]') as HTMLInputElement;
    expect(input.max).not.toBe("");
  });

  it("names the last as-needed dose even when it is older than the recent list", async () => {
    const user = userEvent.setup();
    const prescription = makePrescription({ genericName: "Furosemide" });
    const taken = new Date();
    taken.setDate(taken.getDate() - 10);
    taken.setHours(14, 5, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateKey = `${taken.getFullYear()}-${pad(taken.getMonth() + 1)}-${pad(taken.getDate())}`;
    const log = makePrnLog(prescription.id, {
      scheduledDate: dateKey,
      scheduledTime: "14:05",
      actionTimestamp: taken.getTime(),
    });

    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: { prescriptions: [prescription], doseLogs: [log] },
    });

    const day = taken.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    expect(await screen.findByText(`As needed · last ${day} 14:05`)).toBeInTheDocument();
    expect(screen.queryByText(/no doses logged yet/i)).not.toBeInTheDocument();

    // The expanded recent-doses list keeps its 7-day window.
    await user.click(screen.getByRole("button", { name: /furosemide/i, expanded: false }));
    await screen.findByText("Medicines");
    expect(screen.queryByRole("list", { name: /recent as-needed doses/i })).not.toBeInTheDocument();
  });

  it("shows the scheduled dose on a day with no dose", async () => {
    const prescription = makePrescription({ genericName: "Lisinopril" });
    const phase = makeMedicationPhase(prescription.id, { unit: "mg" });
    // A once-weekly schedule on a weekday three days from today.
    const schedule = makePhaseSchedule(phase.id, {
      dosage: 10,
      time: "09:00",
      daysOfWeek: [(new Date().getDay() + 3) % 7],
    });
    const inventory = makeInventoryItem(prescription.id, {
      prescriptionId: prescription.id,
      brandName: "Zestril",
      strength: 10,
      currentStock: 40,
    });

    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: {
        prescriptions: [prescription],
        medicationPhases: [phase],
        phaseSchedules: [schedule],
        inventoryItems: [inventory],
      },
    });

    expect(await screen.findByText("No doses today")).toBeInTheDocument();
    const card = screen.getByTestId("rx-card");
    await waitFor(() => {
      expect(card).toHaveTextContent("10mgNo doses today");
    });
    expect(card).not.toHaveTextContent("—");
    expect(
      screen.getByRole("button", { name: /zestril, active brand/i }),
    ).toHaveTextContent("1 tablet of 10mg");
  });

  it("shows a dash only when the prescription has no schedule", async () => {
    const prescription = makePrescription({ genericName: "Lisinopril" });
    const phase = makeMedicationPhase(prescription.id, { unit: "mg" });

    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: { prescriptions: [prescription], medicationPhases: [phase] },
    });

    expect(await screen.findByText("No doses today")).toBeInTheDocument();
    expect(screen.getByTestId("rx-card")).toHaveTextContent("—No doses today");
  });

  it("gives the as-needed Log dose and Undo buttons a 44px tap target", async () => {
    const user = userEvent.setup();
    const prescription = makePrescription({ genericName: "Furosemide" });
    const log = makePrnLog(prescription.id, {
      scheduledDate: toLocalDateKey(new Date()),
      actionTimestamp: Date.now(),
    });

    await renderWithFixtures(<PrescriptionCard prescription={prescription} />, {
      seed: { prescriptions: [prescription], doseLogs: [log] },
    });

    expect(
      await screen.findByRole("button", { name: /log an as-needed dose of furosemide/i }),
    ).toHaveClass("min-h-11");

    await user.click(screen.getByRole("button", { name: /furosemide/i, expanded: false }));
    const undo = await screen.findByRole("button", { name: /^undo as-needed dose/i });
    expect(undo).toHaveClass("min-h-11");
    await user.click(undo);
    expect(
      screen.getByRole("button", { name: /confirm undo as-needed dose/i }),
    ).toHaveClass("min-h-11");
  });
});
