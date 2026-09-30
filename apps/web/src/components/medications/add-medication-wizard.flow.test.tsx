// @vitest-environment jsdom
/**
 * MSW-backed integration flow for the AddMedicationWizard — the most
 * complex multi-step user flow in the app.
 *
 * Paradigm (docs/TESTING_STRATEGY.md §2.1 — "missing middle"): the
 * existing add-medication-wizard.dom.test.tsx walks the 6 steps but
 * deliberately mocks `useMedicineSearch` to skip the AI surface, using
 * the signed-out path so the test stays deterministic. This file flips
 * the question — exercises the SIGNED-IN path with the *real* hook
 * firing through MSW, then asserts that:
 *   1. The AI response populates the wizard form correctly across
 *      multiple fields (genericName, dosageStrength, pillShape,
 *      pillColor, foodInstruction, foodNote).
 *   2. The pre-populated form walks every wizard step.
 *   3. The save mutation writes a coherent record graph across FOUR
 *      Dexie tables (prescriptions, medicationPhases, phaseSchedules,
 *      inventoryItems) — not just the prescription row.
 *
 * What this catches that single-card tests can't:
 *   - Multi-endpoint state propagation (AI search → form patch →
 *     multi-step navigation → atomic Dexie write).
 *   - FK consistency across the prescription → phase → schedule →
 *     inventory chain.
 *   - React Query mutation chaining + cache invalidation across hooks.
 *   - useAuthGate / signed-in branch coverage (the existing test only
 *     exercises the signed-out branch).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type * as AuthGuardMod from "@/components/auth-guard";

// Open the auth gate so the wizard renders its AI search input.
// useAuthGate uses useAuth().authenticated, so mock the upstream hook.
vi.mock("@/components/auth-guard", async (importActual) => {
  const actual = await importActual<typeof AuthGuardMod>();
  return {
    ...actual,
    useAuthGate: () => true,
  };
});

// The wizard wires in useInteractionCheck for the conflict-detection
// step. We mock it as a no-op so the wizard doesn't try to hit
// /api/ai/interaction-check (orthogonal to the flow under test).
vi.mock("@/hooks/use-interaction-check", () => ({
  useInteractionCheck: () => ({
    check: vi.fn().mockResolvedValue({ conflicts: [] }),
    data: null,
    reset: vi.fn(),
  }),
}));

import { AddMedicationWizard } from "@/components/medications/add-medication-wizard";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makePrescription, makeMedicationPhase } from "@/__tests__/fixtures/db-fixtures";
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";

const MEDICINE_SEARCH_RESPONSE = {
  brandNames: ["Aviolix"],
  localAlternatives: [],
  genericName: "Aviolix Compound",
  dosageStrengths: ["75mg"],
  activeIngredients: ["Aviolix Compound"],
  strengthOptions: [],
  commonIndications: ["Testing"],
  foodInstruction: "after" as const,
  foodNote: "Take with food",
  pillColor: "purple",
  pillShape: "round",
  pillDescription: "A purple reddish round pill",
  drugClass: "Test Class",
  contraindications: [],
  warnings: [],
  isGenericFallback: false,
};

const server = setupServer(
  // MSW v2 normalises relative paths against the request origin, so
  // a single relative-path handler matches both forms the app may
  // emit (relative for direct apiFetch, absolute after jsdom resolves
  // against location.href).
  http.post("/api/ai/medicine-search", () =>
    HttpResponse.json(MEDICINE_SEARCH_RESPONSE),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AddMedicationWizard — full AI-search flow (MSW integration)", () => {
  it(
    "searches via AI, populates the form, walks all 6 steps, writes the full record graph to Dexie",
    async () => {
      const user = userEvent.setup();
      await renderWithFixtures(
        <AddMedicationWizard open onOpenChange={() => {}} />,
      );

      // ─── Step 1: AI search ──────────────────────────────────────
      const searchInput = await screen.findByLabelText("Medicine name or brand");
      await user.type(searchInput, "Aviolix 75mg");
      await user.keyboard("{Enter}");

      // The lookup panel shows the result; nothing is filled in until the
      // user applies the ticked groups.
      await waitFor(
        () => {
          expect(
            screen.getByText(/Found:.*Aviolix Compound/i),
          ).toBeInTheDocument();
        },
        { timeout: 5_000 },
      );
      expect(screen.getByPlaceholderText("e.g. Aviolix")).toHaveValue("");
      // The only strength is picked for the user.
      expect(screen.getByRole("checkbox", { name: /^Strength/ })).toHaveAttribute("aria-checked", "true");
      await user.click(screen.getByRole("button", { name: "Apply to form" }));

      expect(screen.getByText("Filled in from AI lookup")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("e.g. Aviolix")).toHaveValue("Aviolix 75");
      expect(screen.getByPlaceholderText("e.g. Clopidogrel")).toHaveValue("Aviolix Compound");
      expect(screen.getByLabelText("Strength per pill")).toHaveValue("75mg");

      // ─── Steps 2-5: walk through with pre-populated state ──────
      await user.click(screen.getByRole("button", { name: /next/i }));
      await screen.findByText("Pill Appearance");

      await user.click(screen.getByRole("button", { name: /next/i }));
      await screen.findByText("Indication & Notes");

      await user.click(screen.getByRole("button", { name: /next/i }));
      await screen.findByText("Dosage");

      await user.click(screen.getByRole("button", { name: /next/i }));
      await screen.findByText("Schedule");

      await user.click(screen.getByRole("button", { name: /next/i }));

      // ─── Step 6: Inventory + Save ─────────────────────────────
      await screen.findByText("Inventory");
      const save = await screen.findByRole("button", {
        name: /save medication/i,
      });
      await user.click(save);

      // ─── Assert the full record graph landed in Dexie ──────────
      // A coherent add-prescription write produces records across four
      // tables, FK-linked. Any single missing/orphaned row is a real
      // bug class (broken prescription showing on the medications page
      // with no schedule, etc.).
      await waitFor(
        async () => {
          const prescriptions = await db.prescriptions.toArray();
          expect(prescriptions.length).toBeGreaterThan(0);
        },
        { timeout: 10_000 },
      );

      const prescriptions = await db.prescriptions.toArray();
      const aviolix = prescriptions.find((p) =>
        /aviolix/i.test(p.genericName ?? ""),
      );
      expect(aviolix, `expected an Aviolix prescription, got: ${JSON.stringify(prescriptions.map((p) => p.genericName))}`).toBeDefined();

      // The AI response said "after" for foodInstruction; verify it
      // propagated all the way through to the saved phase record.
      const phases = await db.medicationPhases.toArray();
      const ourPhase = phases.find((p) => p.prescriptionId === aviolix!.id);
      expect(ourPhase, "phase must be created and FK-linked to the prescription").toBeDefined();
      expect(ourPhase!.foodInstruction).toBe("after");
      expect(ourPhase!.foodNote).toBe("Take with food");

      // Inventory: pillShape and pillColor came from the AI search.
      const inventoryItems = await db.inventoryItems.toArray();
      const ourInventory = inventoryItems.find(
        (i) => i.prescriptionId === aviolix!.id,
      );
      expect(ourInventory, "inventory item must be created and FK-linked").toBeDefined();
      expect(ourInventory!.pillShape).toBe("round");
      // The brand came from the lookup's brand + picked strength.
      expect(ourInventory!.brandName).toBe("Aviolix 75");
      // pillColor: AI returned "purple" which the wizard maps to a hex
      // value via COLOR_NAME_MAP. The exact hex is an implementation
      // detail; assert the field is non-empty.
      expect(ourInventory!.pillColor).toBeTruthy();

      // Schedules: at least one schedule row, FK-linked to our phase.
      const schedules = await db.phaseSchedules.toArray();
      const ourSchedules = schedules.filter(
        (s) => s.phaseId === ourPhase!.id,
      );
      expect(
        ourSchedules.length,
        "at least one schedule must be created and FK-linked to the phase",
      ).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    "a compact lookup on a later step looks up the entered name and fills in only that step",
    async () => {
      const user = userEvent.setup();
      await renderWithFixtures(<AddMedicationWizard open onOpenChange={() => {}} />);

      // Step 1 by hand: no lookup yet.
      await user.type(await screen.findByPlaceholderText("e.g. Aviolix"), "Aviolix");
      await user.type(screen.getByLabelText("Strength per pill"), "75mg");
      await user.click(screen.getByRole("button", { name: /next/i }));
      await screen.findByText("Pill Appearance");

      expect(screen.getByText(/Uses the name you entered/)).toHaveTextContent("Aviolix");
      await user.click(screen.getByRole("button", { name: "Look up with AI" }));
      expect(await screen.findByText("Shape, colour and markings:")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Use this" }));

      // Purple round, from the lookup.
      expect(screen.getByRole("radio", { name: "Colour #9C27B0" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: /Round/ })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByText("Filled in from AI lookup")).toBeInTheDocument();

      // The Indication step offers its own groups from the same result.
      await user.click(screen.getByRole("button", { name: /next/i }));
      await screen.findByText("Indication & Notes");
      await user.click(screen.getByRole("button", { name: "Show result" }));
      expect(screen.getByRole("checkbox", { name: /What it is for/ })).toHaveTextContent("Testing");
      await user.click(screen.getByRole("button", { name: "Apply to form" }));
      expect(screen.getByRole("radio", { name: "After eating" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByDisplayValue("Testing")).toBeInTheDocument();
    },
    30_000,
  );

  it(
    "adding a brand to an existing combination prescription fills brand, per-pill strengths and appearance",
    async () => {
      server.use(
        http.post("/api/ai/medicine-search", () =>
          HttpResponse.json({
            ...MEDICINE_SEARCH_RESPONSE,
            brandNames: ["Entresto", "Vymada"],
            genericName: "Sacubitril/valsartan",
            activeIngredients: ["Sacubitril", "Valsartan"],
            dosageStrengths: ["50 mg", "100 mg"],
            strengthOptions: [
              { label: "50 mg", compounds: [{ name: "Sacubitril", strength: 24 }, { name: "Valsartan", strength: 26 }] },
              { label: "100 mg", compounds: [{ name: "Sacubitril", strength: 49 }, { name: "Valsartan", strength: 51 }] },
            ],
            pillColor: "yellow",
            pillShape: "oval",
          }),
        ),
      );
      const rx = makePrescription({
        genericName: "Sacubitril/valsartan",
        compounds: [
          { name: "Sacubitril", strength: 49 },
          { name: "Valsartan", strength: 51 },
        ],
      });
      const phase = makeMedicationPhase(rx.id, { unit: "mg" });
      const user = userEvent.setup();
      await renderWithFixtures(<AddMedicationWizard open onOpenChange={() => {}} />, {
        seed: { prescriptions: [rx], medicationPhases: [phase] },
      });

      await user.selectOptions(await screen.findByRole("combobox"), rx.id);
      await screen.findByText("Add medication");
      await user.type(
        screen.getByPlaceholderText("e.g. Sacubitril/valsartan or a brand name"),
        "Vymada 100{Enter}",
      );
      expect(await screen.findByText("Found: Sacubitril/valsartan")).toBeInTheDocument();
      // The add-brand host offers brand, strength and appearance only.
      expect(screen.getByRole("checkbox", { name: /Brand name/ })).toHaveTextContent("Vymada 100");
      expect(screen.queryByRole("checkbox", { name: /What it is for/ })).not.toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /100 mg/ })).toHaveAttribute("aria-checked", "true");
      await user.click(screen.getByRole("button", { name: "Apply to form" }));

      expect(screen.getByPlaceholderText("e.g. Aviolix")).toHaveValue("Vymada 100");
      expect(screen.getByLabelText("Sacubitril strength per pill")).toHaveValue(49);
      expect(screen.getByLabelText("Valsartan strength per pill")).toHaveValue(51);
    },
    30_000,
  );
});
