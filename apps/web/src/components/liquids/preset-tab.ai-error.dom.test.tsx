// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Open the auth gate so the AI lookup input renders.
vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => true,
}));

const { apiFetchSpy, toastSpy } = vi.hoisted(() => ({
  apiFetchSpy: vi.fn(),
  toastSpy: vi.fn(),
}));
vi.mock("@/lib/api-fetch", () => ({ apiFetch: apiFetchSpy }));
vi.mock("@intake/ui/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
  toast: toastSpy,
}));

import { PresetTab } from "@/components/liquids/preset-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";

describe("PresetTab AI lookup errors", () => {
  it("shows the server's NO_AI_KEY message instead of a generic failure", async () => {
    apiFetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "No anthropic API key configured. Add one in Settings → AI features.",
          code: "NO_AI_KEY",
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    await renderWithFixtures(<PresetTab tab="coffee" />);

    await user.type(
      screen.getByLabelText("Search beverages for AI lookup"),
      "flat white",
    );
    await user.click(screen.getByLabelText("Look up substance content"));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Lookup failed",
          description: expect.stringMatching(/Add one in Settings/),
          variant: "destructive",
        }),
      );
    });
  });
});
