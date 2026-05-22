// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Radix's Select uses Pointer Events APIs jsdom does not implement. Polyfill
// the no-op capture methods so opening the time-format / region selects works.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// MedicationSettingsView reads auth state (to gate the push-reminders card)
// and the dose-reminder toggle (which probes browser notification support).
// Neither is available under jsdom, so stub the underlying modules.
type SessionResult = {
  data: { user: { id: string; email: string } } | null;
  isPending: boolean;
  error: null;
};
const sessionMock = vi.fn<() => SessionResult>(() => ({
  data: null,
  isPending: false,
  error: null,
}));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => sessionMock(),
}));

vi.mock("@/lib/push-notification-service", () => ({
  isNotificationSupported: () => true,
  requestNotificationPermission: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

import { MedicationSettingsView } from "@/components/medications/medication-settings-view";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore } from "@/stores/settings-store";

describe("MedicationSettingsView", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    sessionMock.mockReturnValue({ data: null, isPending: false, error: null });
  });

  it("renders the localization and display sections", async () => {
    await renderWithFixtures(<MedicationSettingsView />);

    expect(
      screen.getByRole("heading", { name: /medication settings/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
    expect(screen.getByText("Localization")).toBeInTheDocument();
    expect(screen.getByText("Primary Region")).toBeInTheDocument();
  });

  it("shows the dose-reminders card when authenticated", async () => {
    sessionMock.mockReturnValue({
      data: { user: { id: "u1", email: "owner@example.test" } },
      isPending: false,
      error: null,
    });

    await renderWithFixtures(<MedicationSettingsView />);

    expect(screen.getByText("Dose Reminders")).toBeInTheDocument();
    expect(screen.getByLabelText(/enable reminders/i)).toBeInTheDocument();
  });

  it("reflects the persisted time format and updates the store on change", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<MedicationSettingsView />, {
      settings: { timeFormat: "24h" },
    });

    // The Select trigger shows the current ("24h") option.
    expect(screen.getByText("24-hour (14:00)")).toBeInTheDocument();

    // Open the time-format select and pick the 12-hour option.
    const triggers = screen.getAllByRole("combobox");
    await user.click(triggers[0]!);
    await user.click(
      await screen.findByRole("option", { name: /12-hour/i }),
    );

    expect(useSettingsStore.getState().timeFormat).toBe("12h");
  });

  it("renders the primary-region combobox seeded from the settings store", async () => {
    await renderWithFixtures(<MedicationSettingsView />, {
      settings: { primaryRegion: "US", secondaryRegion: "" },
    });

    // The CountryCombobox shows the flag + full country name for a set
    // region; the unset secondary region shows the global-search label.
    expect(screen.getByText(/United States/)).toBeInTheDocument();
    expect(
      screen.getByText("Not Specified (Global Search)"),
    ).toBeInTheDocument();
  });
});
