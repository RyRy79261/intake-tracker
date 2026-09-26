// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { aiFetchSpy, toastSpy } = vi.hoisted(() => ({
  aiFetchSpy: vi.fn(),
  toastSpy: vi.fn(),
}));

vi.mock("@/components/auth-guard", () => ({ useAuthGate: () => true }));
vi.mock("@/hooks/use-ai-fetch", () => ({ useAiFetch: () => aiFetchSpy }));
vi.mock("@intake/ui/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
  toast: toastSpy,
}));
// Editing a plan prefills one entry per phase prescription, which is what
// enables "AI Suggest" without driving the entry cards.
vi.mock("@/hooks/use-medication-queries", () => ({
  useCreateTitrationPlan: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTitrationPlan: () => ({ mutate: vi.fn(), isPending: false }),
  usePhasesForTitrationPlan: () => [{ prescriptionId: "rx-1" }],
}));
vi.mock("@/components/medications/titrations/rx-entry-card", () => ({
  RxEntryCard: () => null,
  EditPhaseScheduleLoader: () => null,
}));

import { TitrationDrawer } from "@/components/medications/titrations/titration-drawer";
import { renderWithProviders } from "@/__tests__/react-test-utils";
import { makePrescription, makeTitrationPlan } from "@/__tests__/fixtures/db-fixtures";

describe("TitrationDrawer AI Suggest errors", () => {
  it("shows the server's NO_AI_KEY message instead of failing silently", async () => {
    aiFetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "No anthropic API key configured. Add one in Settings → AI features.",
          code: "NO_AI_KEY",
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <TitrationDrawer
        open
        onOpenChange={() => {}}
        prescriptions={[makePrescription({ id: "rx-1", genericName: "Bisoprolol" })]}
        editingPlan={makeTitrationPlan()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /AI Suggest/ }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringMatching(/Add one in Settings/),
          variant: "destructive",
        }),
      );
    });
  });
});
