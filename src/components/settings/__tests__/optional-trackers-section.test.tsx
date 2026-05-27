// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OptionalTrackersSection } from "@/components/settings/optional-trackers-section";
import { useSettingsStore } from "@/stores/settings-store";

describe("OptionalTrackersSection", () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  function expand() {
    fireEvent.click(screen.getByRole("button", { name: /Optional Trackers/i }));
  }

  it("renders a row per tracker, hidden inside a collapsed accordion by default", () => {
    render(<OptionalTrackersSection />);
    // Collapsed state: rows are present in the DOM but not visible
    // (Radix Collapsible mounts content lazily, so we must expand first).
    expect(
      screen.queryByTestId("optional-tracker-row-sugar"),
    ).not.toBeInTheDocument();

    expand();

    expect(
      screen.getByTestId("optional-tracker-row-sugar"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("optional-tracker-row-potassium"),
    ).toBeInTheDocument();
  });

  it("each row's switch reflects the current store state", () => {
    render(<OptionalTrackersSection />);
    expand();

    const sugarSwitch = screen.getByRole("switch", {
      name: /sugar tracking enabled/i,
    });
    const potassiumSwitch = screen.getByRole("switch", {
      name: /potassium tracking disabled/i,
    });
    expect(sugarSwitch).toHaveAttribute("data-state", "checked");
    expect(potassiumSwitch).toHaveAttribute("data-state", "unchecked");
  });

  it("toggling a switch updates the store", () => {
    render(<OptionalTrackersSection />);
    expand();
    const potassiumSwitch = screen.getByRole("switch", {
      name: /potassium tracking disabled/i,
    });
    fireEvent.click(potassiumSwitch);
    expect(useSettingsStore.getState().optionalTrackers.potassium).toBe(true);
  });

  it("toggling sugar off persists to the store", () => {
    render(<OptionalTrackersSection />);
    expand();
    const sugarSwitch = screen.getByRole("switch", {
      name: /sugar tracking enabled/i,
    });
    fireEvent.click(sugarSwitch);
    expect(useSettingsStore.getState().optionalTrackers.sugar).toBe(false);
  });
});
