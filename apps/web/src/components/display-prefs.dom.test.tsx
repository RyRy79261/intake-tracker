// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DisplayPrefs, BIG_TEXT_CLASS, REDUCE_MOTION_CLASS } from "@/components/display-prefs";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore } from "@/stores/settings-store";

function Harness() {
  return (
    <DisplayPrefs>
      <AppearanceSection />
    </DisplayPrefs>
  );
}

const root = () => document.documentElement.classList;

describe("DisplayPrefs + Appearance", () => {
  afterEach(() => {
    cleanup();
    root().remove(BIG_TEXT_CLASS, REDUCE_MOTION_CLASS);
  });

  it("Bigger text toggles the root font-scale class", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<Harness />);
    expect(root().contains(BIG_TEXT_CLASS)).toBe(false);

    await user.click(screen.getByRole("switch", { name: /bigger text/i }));
    expect(useSettingsStore.getState().bigText).toBe(true);
    expect(root().contains(BIG_TEXT_CLASS)).toBe(true);

    await user.click(screen.getByRole("switch", { name: /bigger text/i }));
    expect(root().contains(BIG_TEXT_CLASS)).toBe(false);
  });

  it("Reduce motion toggles the no-animation class", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<Harness />);

    await user.click(screen.getByRole("switch", { name: /reduce motion/i }));
    expect(useSettingsStore.getState().reduceMotion).toBe(true);
    expect(root().contains(REDUCE_MOTION_CLASS)).toBe(true);
    expect(root().contains(BIG_TEXT_CLASS)).toBe(false);
  });

  it("applies stored preferences on mount", async () => {
    await renderWithFixtures(<Harness />, { settings: { bigText: true, reduceMotion: true } });
    expect(root().contains(BIG_TEXT_CLASS)).toBe(true);
    expect(root().contains(REDUCE_MOTION_CLASS)).toBe(true);
    expect(screen.getByRole("switch", { name: /bigger text/i })).toHaveAttribute("data-state", "checked");
  });
});
