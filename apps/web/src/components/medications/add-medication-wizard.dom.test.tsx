// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The wizard reads auth state via `useSession` to gate the AI search box and
// the (AI-driven) conflict check. jsdom has no Neon Auth session, so stub the
// module. Returning a null session keeps the wizard in its signed-out path:
// the AI search input is hidden and the conflict check is skipped, which makes
// the multi-step flow deterministic to drive in a test.
const sessionMock = vi.fn(() => ({ data: null, isPending: false, error: null }));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => sessionMock(),
}));

// The medicine-search hook hits the server Claude API; never exercised on the
// signed-out path, but the module is imported eagerly so provide a stub that
// preserves the named `MedicineSearchCancelledError` export the wizard imports.
vi.mock("@/hooks/use-medicine-search", () => ({
  useMedicineSearch: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  MedicineSearchCancelledError: class MedicineSearchCancelledError extends Error {},
}));

import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
// A test asserting a write reached Dexie needs the db handle directly; the
// no-restricted-imports rule targets app components, not test files.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import {
  makePrescription,
  makeMedicationPhase,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";

type User = ReturnType<typeof userEvent.setup>;

async function next(user: User, heading: string) {
  await user.click(screen.getByRole("button", { name: /next/i }));
  await screen.findByText(heading);
}

/** Fill the search step and click through to the Inventory step. */
async function walkToInventory(user: User, brand: string, strength: string) {
  await user.type(screen.getByPlaceholderText(/e\.g\. Aviolix/i), brand);
  await user.type(screen.getByPlaceholderText(/e\.g\. 75mg/i), strength);
  await next(user, "Pill Appearance");
  await next(user, "Indication & Notes");
  await next(user, "Dosage");
  await next(user, "Schedule");
  await next(user, "Inventory");
}

// Multi-step walks type into several fields; give them room under a loaded
// parallel test run.
const WALK_TIMEOUT = 20_000;

describe("AddMedicationWizard", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    sessionMock.mockReturnValue({ data: null, isPending: false, error: null });
  }, WALK_TIMEOUT);

  it("opens on the Search step for a brand-new prescription", async () => {
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    // Header shows the search step label and the step counter. With no
    // existing prescriptions and the schedule step active, there are 6 steps.
    expect(await screen.findByText("Search Medicine")).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument();
    // The brand-name field is the gateway field on the search step.
    expect(screen.getByPlaceholderText(/e\.g\. Aviolix/i)).toBeInTheDocument();
  }, WALK_TIMEOUT);

  it("blocks Next until the required brand name is supplied", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    // Advancing with an empty brand name fails validation and stays on step 1.
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(
      await screen.findByText(/medication name is required/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument();
  }, WALK_TIMEOUT);

  it("advances to the Appearance step once a brand name is entered", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    await user.type(
      screen.getByPlaceholderText(/e\.g\. Aviolix/i),
      "Aspirin",
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. 75mg/i), "75mg");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 2 is "Pill Appearance".
    expect(await screen.findByText("Pill Appearance")).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 6/i)).toBeInTheDocument();
    // A Back button now appears so the user can return to Search.
    expect(
      screen.getByRole("button", { name: /back/i }),
    ).toBeInTheDocument();
  }, WALK_TIMEOUT);

  it("Back returns from Appearance to the Search step", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    await user.type(
      screen.getByPlaceholderText(/e\.g\. Aviolix/i),
      "Ibuprofen",
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. 75mg/i), "200mg");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Pill Appearance");

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(await screen.findByText("Search Medicine")).toBeInTheDocument();
    // The typed brand name is preserved when stepping back.
    expect(screen.getByDisplayValue("Ibuprofen")).toBeInTheDocument();
  }, WALK_TIMEOUT);

  it("walks every step and saves a new prescription to the database", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(
      <AddMedicationWizard open onOpenChange={() => {}} />,
    );

    // Step 1 — Search: supply the required brand name.
    await user.type(
      screen.getByPlaceholderText(/e\.g\. Aviolix/i),
      "Paracetamol",
    );
    await user.type(screen.getByPlaceholderText(/e\.g\. 75mg/i), "500mg");

    // Steps 2–5 (Appearance, Indication, Dosage, Schedule) carry valid
    // defaults from the form's initial state, so Next clears each one.
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Pill Appearance");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Indication & Notes");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Dosage");
    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Schedule");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 6 — Inventory: the final step shows the Save button.
    expect(await screen.findByText("Inventory")).toBeInTheDocument();
    const save = await screen.findByRole("button", {
      name: /save medication/i,
    });
    await user.click(save);

    // The addPrescription mutation writes the prescription through to Dexie.
    await vi.waitFor(async () => {
      const all = await db.prescriptions.toArray();
      expect(all.some((p) => p.genericName === "Paracetamol")).toBe(true);
    });
  }, WALK_TIMEOUT);

  it("blocks Next when the strength can't be read instead of saving a silent 1mg", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<AddMedicationWizard open onOpenChange={() => {}} />);

    await user.type(screen.getByPlaceholderText(/e\.g\. Aviolix/i), "Aspirin");
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText(/enter the strength/i)).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 6/i)).toBeInTheDocument();
  }, WALK_TIMEOUT);

  it("saves '1,000 mg' as a 1000mg pill and shows the parsed strength", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<AddMedicationWizard open onOpenChange={() => {}} />);

    await user.type(screen.getByPlaceholderText(/e\.g\. Aviolix/i), "Metformin");
    await user.type(screen.getByPlaceholderText(/e\.g\. 75mg/i), "1,000 mg");
    await next(user, "Pill Appearance");
    await next(user, "Indication & Notes");
    await next(user, "Dosage");
    // The dosage preview reads the same parsed value that gets saved.
    expect(screen.getByText(/1 pill = 1000 mg/i)).toBeInTheDocument();
    await next(user, "Schedule");
    await next(user, "Inventory");
    await user.click(screen.getByRole("button", { name: /save medication/i }));

    await vi.waitFor(async () => {
      const items = await db.inventoryItems.toArray();
      expect(items).toHaveLength(1);
      expect(items[0]!.strength).toBe(1000);
      expect(items[0]!.unit).toBe("mg");
      const schedules = await db.phaseSchedules.toArray();
      expect(schedules[0]!.dosage).toBe(1000);
    });
  }, WALK_TIMEOUT);

  it("rejects a negative custom dose on the Dosage step", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<AddMedicationWizard open onOpenChange={() => {}} />);

    await user.type(screen.getByPlaceholderText(/e\.g\. Aviolix/i), "Bisoprolol");
    await user.type(screen.getByPlaceholderText(/e\.g\. 75mg/i), "5mg");
    await next(user, "Pill Appearance");
    await next(user, "Indication & Notes");
    await next(user, "Dosage");

    await user.type(screen.getByPlaceholderText(/e\.g\. 10mg/i), "-10");
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText(/dose must be more than 0/i)).toBeInTheDocument();
    expect(screen.queryByText("When should this medication be taken?")).not.toBeInTheDocument();
  }, WALK_TIMEOUT);

  it("keeps a fractional starting stock instead of truncating it", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<AddMedicationWizard open onOpenChange={() => {}} />);

    await walkToInventory(user, "Warfarin", "5mg");
    await user.type(screen.getByPlaceholderText("e.g. 36"), "27.5");
    await user.click(screen.getByRole("button", { name: /save medication/i }));

    await vi.waitFor(async () => {
      const txs = await db.inventoryTransactions.toArray();
      expect(txs.map((t) => t.amount)).toEqual([27.5]);
      // The opening count is an 'initial' entry, not a refill that never happened.
      expect(txs.map((t) => t.type)).toEqual(["initial"]);
    });
  }, WALK_TIMEOUT);

  it("warns about a duplicate active prescription and offers to add to it instead", async () => {
    const user = userEvent.setup();
    const existing = makePrescription({ genericName: "Sacubitril/valsartan" });
    const phase = makeMedicationPhase(existing.id);
    await renderWithFixtures(<AddMedicationWizard open onOpenChange={() => {}} />, {
      seed: { prescriptions: [existing], medicationPhases: [phase] },
    });

    await walkToInventory(user, "Valsartan / Sacubitril", "100mg");
    await user.type(screen.getByPlaceholderText("e.g. 36"), "10");
    await user.click(screen.getByRole("button", { name: /save medication/i }));

    expect(await screen.findByText(/already have an active prescription/i)).toBeInTheDocument();
    // Nothing is written until the user picks an option.
    expect(await db.prescriptions.count()).toBe(1);

    await user.click(screen.getByRole("button", { name: /add to existing/i }));

    await vi.waitFor(async () => {
      expect(await db.prescriptions.count()).toBe(1);
      const items = await db.inventoryItems.toArray();
      expect(items).toHaveLength(1);
      expect(items[0]!.prescriptionId).toBe(existing.id);
    });
  }, WALK_TIMEOUT);

  it("converts a new brand's strength into the prescription's unit", async () => {
    const user = userEvent.setup();
    const rx = makePrescription({ genericName: "Levothyroxine" });
    const phase = makeMedicationPhase(rx.id, { unit: "mcg" });
    const old = makeInventoryItem(rx.id, { brandName: "Eltroxin", strength: 100, unit: "mcg" });
    await renderWithFixtures(<AddMedicationWizard open onOpenChange={() => {}} />, {
      seed: { prescriptions: [rx], medicationPhases: [phase], inventoryItems: [old] },
    });

    await user.selectOptions(await screen.findByRole("combobox"), rx.id);
    await user.type(screen.getByPlaceholderText(/e\.g\. Aviolix/i), "Synthroid");
    await user.type(screen.getByPlaceholderText(/e\.g\. 75mg/i), "0.1 mg");
    await next(user, "Pill Appearance");
    await next(user, "Inventory");
    await user.type(screen.getByPlaceholderText("e.g. 36"), "30");
    await user.click(screen.getByRole("button", { name: /save medication/i }));

    await vi.waitFor(async () => {
      const added = (await db.inventoryItems.toArray()).find((i) => i.brandName === "Synthroid");
      expect(added?.strength).toBe(100);
      expect(added?.unit).toBe("mcg");
    });
  }, WALK_TIMEOUT);

  it("asks for the stock on hand when adding a replacement box", async () => {
    const user = userEvent.setup();
    const rx = makePrescription({ genericName: "Bisoprolol" });
    const phase = makeMedicationPhase(rx.id);
    await renderWithFixtures(<AddMedicationWizard open onOpenChange={() => {}} />, {
      seed: { prescriptions: [rx], medicationPhases: [phase] },
    });

    await user.selectOptions(await screen.findByRole("combobox"), rx.id);
    await user.type(screen.getByPlaceholderText(/e\.g\. Aviolix/i), "Concor");
    await user.type(screen.getByPlaceholderText(/e\.g\. 75mg/i), "5mg");
    await next(user, "Pill Appearance");
    await next(user, "Inventory");
    await user.click(screen.getByRole("button", { name: /save medication/i }));

    expect(await screen.findByText(/how many pills you have/i)).toBeInTheDocument();
    expect(await db.inventoryItems.count()).toBe(0);
  }, WALK_TIMEOUT);
});
