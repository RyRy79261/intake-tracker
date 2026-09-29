// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/auth-guard", () => ({
  useAuth: () => ({ ready: true, authenticated: false, user: null }),
  useAuthGate: () => false,
}));

vi.mock("@/hooks/use-medication-queries", () => ({
  useDailyDoseSchedule: () => [],
}));

import { SysBar } from "@/components/shell/sys-bar";
import { SettingsSheet } from "@/components/settings/settings-sheet";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsSheetStore } from "@/stores/settings-sheet-store";
import { __resetWindowHistoryForTests } from "@/hooks/use-window-history";

function Harness() {
  return (
    <>
      <SysBar />
      <SettingsSheet />
    </>
  );
}

describe("SettingsSheet", () => {
  beforeEach(() => {
    __resetWindowHistoryForTests();
    useSettingsSheetStore.setState({ open: false, page: "main", groups: { tracking: true } });
    window.history.replaceState(null, "", "/");
  });
  afterEach(cleanup);

  it("opens from the sys-bar gear with the groups in prototype order", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    const sheet = await screen.findByRole("dialog", { name: "Settings" });
    const groups = within(sheet)
      .getAllByRole("button", { expanded: true })
      .concat(within(sheet).getAllByRole("button", { expanded: false }))
      .map((b) => b.textContent);
    for (const name of [
      "Tracking",
      "Appearance",
      "Medications",
      "AI features",
      "Data & storage",
      "Privacy",
      "System",
      "Help & Manual",
      "Feedback",
      "About",
    ]) {
      expect(groups).toContain(name);
    }
    // Tracking starts open; the retired sections are gone.
    expect(within(sheet).getByRole("button", { name: "Tracking" })).toHaveAttribute("aria-expanded", "true");
    expect(within(sheet).queryByText(/swipe navigation|quick nav|animation timing/i)).not.toBeInTheDocument();
  });

  it("expands and collapses a group", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<Harness />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Settings" });

    const appearance = within(sheet).getByRole("button", { name: "Appearance" });
    await user.click(appearance);
    expect(appearance).toHaveAttribute("aria-expanded", "true");
    expect(within(sheet).getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();

    await user.click(appearance);
    expect(within(sheet).queryByRole("radiogroup", { name: "Theme" })).not.toBeInTheDocument();
  });

  it("opens Drink presets as its own page and Back returns to the groups", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<Harness />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    let sheet = await screen.findByRole("dialog", { name: "Settings" });

    await user.click(within(sheet).getByRole("button", { name: /drink presets/i }));

    sheet = await screen.findByRole("dialog", { name: "Drink presets" });
    expect(within(sheet).getByText("Espresso")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /add preset/i })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Tracking" })).not.toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Back to settings" }));

    sheet = await screen.findByRole("dialog", { name: "Settings" });
    expect(within(sheet).getByRole("button", { name: "Tracking" })).toBeInTheDocument();
    expect(within(sheet).queryByText("Espresso")).not.toBeInTheDocument();
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<Harness />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Settings" });

    await user.click(within(sheet).getByRole("button", { name: "Close" }));

    expect(useSettingsSheetStore.getState().open).toBe(false);
  });
});
