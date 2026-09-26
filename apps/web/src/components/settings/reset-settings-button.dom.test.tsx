// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme }),
}));

import { ResetSettingsButton } from "@/components/settings/reset-settings-button";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore } from "@/stores/settings-store";

describe("ResetSettingsButton", () => {
  beforeEach(() => setTheme.mockClear());

  it("does nothing until the reset is confirmed", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<ResetSettingsButton />, {
      settings: { waterLimit: 2500 },
    });

    await user.click(screen.getByRole("button", { name: /reset to defaults/i }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(useSettingsStore.getState().waterLimit).toBe(2500);
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("resets preferences and the theme once confirmed", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<ResetSettingsButton />, {
      settings: { waterLimit: 2500, storageMode: "cloud-sync" },
    });

    await user.click(screen.getByRole("button", { name: /reset to defaults/i }));
    await user.click(await screen.findByRole("button", { name: /^reset$/i }));

    expect(useSettingsStore.getState().waterLimit).toBe(1000);
    // Storage mode has its own flow (the sync switch) and is kept.
    expect(useSettingsStore.getState().storageMode).toBe("cloud-sync");
    expect(setTheme).toHaveBeenCalledWith("system");
  });
});
