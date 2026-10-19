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

// MedicationPrefsSection reads auth state (to gate the push-reminders card)
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

import { MedicationPrefsSection } from "@/components/settings/medication-prefs-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore } from "@/stores/settings-store";

describe("MedicationPrefsSection (Settings › Medications)", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    sessionMock.mockReturnValue({ data: null, isPending: false, error: null });
  });

  it("renders the region, time format and home timezone", async () => {
    await renderWithFixtures(<MedicationPrefsSection />, {
      settings: { homeTimezone: "Africa/Johannesburg" },
    });

    expect(screen.getByRole("combobox", { name: "Region" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /second region/i })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Time format" })).toBeInTheDocument();
    expect(screen.getByTestId("home-timezone")).toHaveTextContent("Africa/Johannesburg");
    // Signed out, web push reminders are not offered.
    expect(screen.queryByRole("switch", { name: /dose reminders/i })).not.toBeInTheDocument();
    expect(screen.getByText(/sign in to turn on dose reminders/i)).toBeInTheDocument();
  });

  it('offers dose reminders when signed in, with "Remind me every" and the reminder period', async () => {
    sessionMock.mockReturnValue({
      data: { user: { id: "u1", email: "owner@example.test" } },
      isPending: false,
      error: null,
    });

    await renderWithFixtures(<MedicationPrefsSection />, {
      settings: { doseRemindersEnabled: true, reminderFollowUpInterval: 10, reminderPeriodMinutes: 30 },
    });

    expect(screen.getByRole("switch", { name: /dose reminders/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Remind me every" })).toHaveTextContent("10 minutes");
    expect(screen.getByRole("combobox", { name: "Reminder period" })).toHaveTextContent("30 minutes");
    expect(screen.getByTestId("reminder-period-help")).toHaveTextContent("08:30, 08:40, 08:50, 09:00");
    // The old reminder count is gone: the period sets how many repeat.
    expect(screen.queryByRole("combobox", { name: "Reminders" })).not.toBeInTheDocument();
    expect(screen.queryByText(/follow-up/i)).not.toBeInTheDocument();
  });

  it("changes the reminder period, the late window and the skip question", async () => {
    sessionMock.mockReturnValue({
      data: { user: { id: "u1", email: "owner@example.test" } },
      isPending: false,
      error: null,
    });
    const user = userEvent.setup();
    await renderWithFixtures(<MedicationPrefsSection />, {
      settings: { doseRemindersEnabled: true, reminderPeriodMinutes: 30, lateWindowMinutes: 40, askSkipReason: true },
    });

    expect(screen.getByRole("combobox", { name: "Late window" })).toHaveTextContent("40 minutes");
    expect(screen.getByText("Ask for the time taken when you take a dose later than this.")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Reminder period" }));
    await user.click(await screen.findByRole("option", { name: "60 minutes" }));
    expect(useSettingsStore.getState().reminderPeriodMinutes).toBe(60);

    await user.click(screen.getByRole("combobox", { name: "Late window" }));
    await user.click(await screen.findByRole("option", { name: "Never ask" }));
    expect(useSettingsStore.getState().lateWindowMinutes).toBe(-1);

    await user.click(screen.getByRole("switch", { name: /ask me every time/i }));
    expect(useSettingsStore.getState().askSkipReason).toBe(false);
  });

  it("reflects the persisted time format and updates the store on change", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<MedicationPrefsSection />, {
      settings: { timeFormat: "24h" },
    });

    const h24 = screen.getByRole("radio", { name: "24h" });
    expect(h24).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "12h" }));
    expect(useSettingsStore.getState().timeFormat).toBe("12h");
  });

  it("renders the region comboboxes seeded from the settings store", async () => {
    await renderWithFixtures(<MedicationPrefsSection />, {
      settings: { primaryRegion: "US", secondaryRegion: "" },
    });

    expect(screen.getByText(/United States/)).toBeInTheDocument();
    expect(screen.getByText("Not Specified (Global Search)")).toBeInTheDocument();
  });
});
