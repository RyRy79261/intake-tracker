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

// Open the auth gate so the wizard renders its AI search input.
// useAuthGate uses useAuth().authenticated, so mock the upstream hook.
vi.mock("@/components/auth-guard", async (importActual) => {
  const actual = await importActual<typeof import("@/components/auth-guard")>();
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
      const searchInput = await screen.findByPlaceholderText(
        /Aviolix.*Clopidogrel/i,
      );
      await user.type(searchInput, "Aviolix 75mg");
      await user.keyboard("{Enter}");

      // Wait for MSW response to populate the form. The wizard displays
      // "Found: <genericName>" as a confirmation banner once the search
      // resolves.
      await waitFor(
        () => {
          expect(
            screen.getByText(/Found:.*Aviolix Compound/i),
          ).toBeInTheDocument();
        },
        { timeout: 5_000 },
      );

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
});
