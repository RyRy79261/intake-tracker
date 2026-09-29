// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@intake/ui/toaster";
import { LogDoseDialog } from "@/components/medications/log-dose-dialog";
import { OtherDosesToday } from "@/components/medications/other-doses-today";
// The test reads the seeded IndexedDB directly to assert the writes. The
// "components must use hooks, not db" rule targets component source, not tests.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makePrescription, makeInventoryItem } from "@/__tests__/fixtures/db-fixtures";
import { toLocalDateKey } from "@/lib/date-utils";

function asNeeded(name = "Furosemide", stock: number | null = 30) {
  const prescription = makePrescription({ genericName: name });
  const inventory =
    stock === null
      ? null
      : makeInventoryItem(prescription.id, { brandName: "Lasix", strength: 40, currentStock: stock });
  return { prescription, inventory };
}

function seedOf(...regs: ReturnType<typeof asNeeded>[]) {
  return {
    prescriptions: regs.map((r) => r.prescription),
    inventoryItems: regs.flatMap((r) => (r.inventory ? [r.inventory] : [])),
  };
}

const maths = () => screen.getByTestId("log-dose-maths");

describe("LogDoseDialog (extra dose)", () => {
  it("shows the pill maths for the default dose: one tablet of the active brand", async () => {
    await renderWithFixtures(<LogDoseDialog open onOpenChange={() => {}} />, {
      seed: seedOf(asNeeded()),
    });

    await waitFor(() => expect(maths()).toHaveTextContent("= 1 tablet of 40mg"));
    expect(maths()).toHaveTextContent("Deducts 1 pill from Lasix · 29 pills left after");
  });

  it("updates the pill maths as the dose changes, including a half tablet", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LogDoseDialog open onOpenChange={() => {}} />, {
      seed: seedOf(asNeeded()),
    });
    const dose = await screen.findByLabelText("Dose");
    await waitFor(() => expect(dose).toHaveValue("40"));

    await user.clear(dose);
    await user.type(dose, "80");
    expect(maths()).toHaveTextContent("= 2 tablets of 40mg (= 80mg)");
    expect(maths()).toHaveTextContent("Deducts 2 pills from Lasix · 28 pills left after");

    await user.clear(dose);
    await user.type(dose, "20");
    expect(maths()).toHaveTextContent("= ½ tablet of 40mg (= 20mg)");
    expect(maths()).toHaveTextContent("Deducts ½ pill from Lasix · 29 ½ pills left after");

    await user.clear(dose);
    expect(maths()).toHaveTextContent("Enter a dose to see how many pills that is.");
    expect(screen.getByRole("button", { name: "Log dose" })).toBeDisabled();
  });

  it("writes a PRN dose log and deducts the pills from the active brand", async () => {
    const user = userEvent.setup();
    const r = asNeeded();
    await renderWithFixtures(
      <>
        <LogDoseDialog open onOpenChange={() => {}} />
        <Toaster />
      </>,
      { seed: seedOf(r) },
    );
    const dose = await screen.findByLabelText("Dose");
    await waitFor(() => expect(dose).toHaveValue("40"));
    await user.clear(dose);
    await user.type(dose, "80");
    await user.type(screen.getByLabelText("Note (optional)"), "swollen ankles");
    await user.click(screen.getByRole("button", { name: "Log dose" }));

    await waitFor(async () => {
      const logs = await db.doseLogs.where("prescriptionId").equals(r.prescription.id).toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        kind: "prn",
        status: "taken",
        doseMg: 80,
        inventoryItemId: r.inventory!.id,
        scheduledDate: toLocalDateKey(new Date()),
        note: "swollen ankles",
      });
    });
    expect((await db.inventoryItems.get(r.inventory!.id))?.currentStock).toBe(28);
    expect(await screen.findByText("Furosemide extra dose logged")).toBeInTheDocument();
    expect(screen.getByText("2 tablets deducted")).toBeInTheDocument();
  });

  it("logs without deducting stock when the prescription has no active brand", async () => {
    const user = userEvent.setup();
    const r = asNeeded("Paracetamol", null);
    await renderWithFixtures(<LogDoseDialog open onOpenChange={() => {}} />, {
      seed: seedOf(r),
    });

    await waitFor(() => expect(maths()).toHaveTextContent("No active brand"));
    await user.type(screen.getByLabelText("Dose"), "500");
    await user.click(screen.getByRole("button", { name: "Log dose" }));

    await waitFor(async () => {
      const logs = await db.doseLogs.where("prescriptionId").equals(r.prescription.id).toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.kind).toBe("prn");
      expect(logs[0]?.doseMg).toBe(500);
      expect(logs[0]?.inventoryItemId).toBeUndefined();
    });
  });

  it("offers only active prescriptions", async () => {
    const active = asNeeded("Furosemide");
    const inactive = asNeeded("Digoxin");
    inactive.prescription.isActive = false;
    await renderWithFixtures(<LogDoseDialog open onOpenChange={() => {}} />, {
      seed: seedOf(active, inactive),
    });

    const select = await screen.findByLabelText("Prescription");
    await waitFor(() => expect(select).toHaveValue(active.prescription.id));
    expect(screen.queryByRole("option", { name: "Digoxin" })).not.toBeInTheDocument();
  });
});

describe("OtherDosesToday", () => {
  it("lists today's extra doses and Undo (confirmed) restores the stock", async () => {
    const user = userEvent.setup();
    const r = asNeeded();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <LogDoseDialog open={open} onOpenChange={setOpen} />
          <OtherDosesToday dateKey={toLocalDateKey(new Date())} isToday />
        </>
      );
    }
    await renderWithFixtures(<Harness />, { seed: seedOf(r) });
    const dose = await screen.findByLabelText("Dose");
    await waitFor(() => expect(dose).toHaveValue("40"));
    await user.click(screen.getByRole("button", { name: "Log dose" }));

    expect(await screen.findByText("Other doses today")).toBeInTheDocument();
    expect(screen.getByText("Extra dose · 1 tablet of Lasix")).toBeInTheDocument();
    expect((await db.inventoryItems.get(r.inventory!.id))?.currentStock).toBe(29);

    await user.click(screen.getByRole("button", { name: /^Undo Furosemide at/ }));
    await user.click(screen.getByRole("button", { name: /^Confirm remove Furosemide at/ }));

    await waitFor(async () =>
      expect((await db.inventoryItems.get(r.inventory!.id))?.currentStock).toBe(30),
    );
    await waitFor(() => expect(screen.queryByText("Other doses today")).not.toBeInTheDocument());
  });
});
