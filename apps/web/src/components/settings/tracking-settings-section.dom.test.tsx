// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Radix Select uses Pointer Events APIs jsdom does not implement.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

import { TrackingSettingsSection } from "@/components/settings/tracking-settings-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { useSettingsStore } from "@/stores/settings-store";

async function typeAndBlur(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, text: string) {
  await user.clear(input);
  await user.type(input, text);
  await user.tab();
}

const render = (settings = {}) =>
  renderWithFixtures(<TrackingSettingsSection onOpenPresets={() => {}} />, { settings });

describe("TrackingSettingsSection", () => {
  it("saves the day start and shows what it means", async () => {
    const user = userEvent.setup();
    await render({ dayStartHour: 2 });
    expect(screen.getByText("Records before 2 am count toward the previous day.")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /day starts at/i }));
    await user.click(await screen.findByRole("option", { name: "4:00 AM" }));
    expect(useSettingsStore.getState().dayStartHour).toBe(4);
    expect(screen.getByText("Records before 4 am count toward the previous day.")).toBeInTheDocument();
  });

  it("shows Monday by default and saves the chosen first day of the week", async () => {
    const user = userEvent.setup();
    await render();
    const trigger = screen.getByRole("combobox", { name: /week starts on/i });
    expect(trigger).toHaveTextContent("Monday");

    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Sunday" }));
    expect(useSettingsStore.getState().weekStartsOn).toBe(0);
  });

  it("clamps an over-max water limit and explains it inline", async () => {
    const user = userEvent.setup();
    await render();
    const input = screen.getByLabelText("Water daily limit (ml)");
    await typeAndBlur(user, input, "15000");

    expect(useSettingsStore.getState().waterLimit).toBe(10000);
    expect(input).toHaveValue(10000);
    expect(screen.getByRole("alert")).toHaveTextContent(/100.*10000/);
  });

  it("shows the stored value when a fraction rounds to the current one", async () => {
    const user = userEvent.setup();
    await render({ sugarLimit: 30 });
    const input = screen.getByLabelText("Sugar daily limit (g)");
    await typeAndBlur(user, input, "30.4");

    expect(useSettingsStore.getState().sugarLimit).toBe(30);
    expect(input).toHaveValue(30);
  });

  it("saves the buffers as the second number in each row", async () => {
    const user = userEvent.setup();
    await render();
    await typeAndBlur(user, screen.getByLabelText("Sodium buffer (mg)"), "300");
    expect(useSettingsStore.getState().saltExtendedBuffer).toBe(300);

    await typeAndBlur(user, screen.getByLabelText("Sugar buffer (g)"), "900");
    expect(useSettingsStore.getState().sugarExtendedBuffer).toBe(500);
    expect(screen.getByRole("alert")).toHaveTextContent(/0.*500/);
  });

  it("shows a limit row only for trackers that are on", async () => {
    const user = userEvent.setup();
    await render({ optionalTrackers: { sugar: true, potassium: false } });
    expect(screen.getByLabelText("Sugar daily limit (g)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/potassium daily target/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: /potassium/i }));
    expect(useSettingsStore.getState().optionalTrackers.potassium).toBe(true);
    expect(screen.getByLabelText("Potassium daily target (mg)")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: /sugar/i }));
    expect(useSettingsStore.getState().optionalTrackers.sugar).toBe(false);
    expect(screen.queryByLabelText("Sugar daily limit (g)")).not.toBeInTheDocument();
  });

  it("saves the +/- steps and the bathroom defaults", async () => {
    const user = userEvent.setup();
    await render();
    await typeAndBlur(user, screen.getByLabelText("Weight step (kg)"), "0.1");
    expect(useSettingsStore.getState().weightIncrement).toBe(0.1);

    const uri = screen.getByRole("radiogroup", { name: "Urination default amount" });
    await user.click(screen.getAllByRole("radio", { name: "Large" })[0]!);
    expect(uri).toBeInTheDocument();
    expect(useSettingsStore.getState().urinationDefaultAmount).toBe("large");
  });

  it("links to the Drink presets page with a count", async () => {
    const user = userEvent.setup();
    const onOpenPresets = vi.fn();
    await renderWithFixtures(<TrackingSettingsSection onOpenPresets={onOpenPresets} />);
    const n = useSettingsStore.getState().liquidPresets.length;
    const row = screen.getByRole("button", { name: new RegExp(`Drink presets.*${n} presets`) });
    await user.click(row);
    expect(onOpenPresets).toHaveBeenCalledOnce();
  });
});
