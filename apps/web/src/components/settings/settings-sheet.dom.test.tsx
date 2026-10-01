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
import { SETTINGS_GROUP_META, settingsColor } from "@/components/settings/settings-groups";

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

  it("gives every group its own colour and icon, and no two neighbours the same colour", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<Harness />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Settings" });

    const sections = Array.from(sheet.querySelectorAll<HTMLElement>("[data-testid^='settings-group-']")).filter(
      (el) => el.tagName === "SECTION",
    );
    expect(sections).toHaveLength(SETTINGS_GROUP_META.length);

    const colors = sections.map((el) => el.dataset.settingsColor);
    sections.forEach((section, i) => {
      const meta = SETTINGS_GROUP_META[i];
      expect(meta).toBeDefined();
      if (!meta) return;
      expect(colors[i]).toBe(meta.color);
      // The colour itself, as the CSS variable the header icon and stripe read.
      // The colour reaches the header icon, stripe and controls through the
      // domain scope; the neutral group only sets `--c`.
      if (meta.color === "muted") {
        expect(section.style.getPropertyValue("--c")).toBe(settingsColor(meta.color));
        expect(section).not.toHaveAttribute("data-domain");
      } else {
        expect(section).toHaveAttribute("data-domain", meta.color);
      }
      // Its header carries an icon before the title.
      const header = within(section).getByRole("button", { name: meta.title });
      expect(header.querySelector("svg")).not.toBeNull();
      if (i > 0) expect(colors[i], `${meta.title} vs the group above`).not.toBe(colors[i - 1]);
    });
  });

  it("stripes the open group and colours its sub-headings with the group colour", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<Harness />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Settings" });

    const tracking = within(sheet).getByTestId("settings-group-tracking");
    const meds = within(sheet).getByTestId("settings-group-meds");
    expect(tracking.className).toContain("inset_3px_0_0_var(--c)");
    expect(meds.className).not.toContain("inset_3px_0_0_var(--c)");

    const heads = within(tracking).getAllByRole("heading", { level: 3 });
    expect(heads.map((h) => h.textContent)).toEqual([
      "Day & week",
      "Limits · target + buffer",
      "Optional trackers",
      "Steps",
      "Bathroom defaults",
      "Drinks",
    ]);
    for (const h of heads) expect(h.className).toContain("subhead");

    // The selected segment and the switch take the group colour through
    // `--primary`, which the group re-points at its own colour.
    expect(tracking).toHaveAttribute("data-domain", "water");
    const selected = within(tracking).getAllByRole("radio", { checked: true });
    expect(selected.length).toBeGreaterThan(0);
    for (const radio of selected) expect(radio.className).toContain("bg-primary");
  });

  it("keeps the Tracking colour on the Drink presets page", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<Harness />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Settings" });
    const trackingColor = within(sheet).getByTestId("settings-group-tracking").dataset.settingsColor;

    await user.click(within(sheet).getByRole("button", { name: /drink presets/i }));

    const presets = await screen.findByRole("dialog", { name: "Drink presets" });
    expect(within(presets).getByTestId("settings-presets-page").dataset.settingsColor).toBe(trackingColor);
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
