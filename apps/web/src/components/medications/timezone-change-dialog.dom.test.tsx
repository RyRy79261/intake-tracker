// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TimezoneChangeDialog } from "@/components/medications/timezone-change-dialog";

/**
 * The dialog lists every mismatched anchor zone with each dose's time on this
 * device before and after adjusting (gap-timezone-travel-recalc#7).
 */
describe("TimezoneChangeDialog", () => {
  const anchors = [
    {
      anchorTimezone: "Europe/Berlin",
      doses: [{ scheduleId: "s1", name: "Metoprolol", before: "02:30", after: "08:30" }],
    },
    {
      anchorTimezone: "America/Los_Angeles",
      doses: [{ scheduleId: "s2", name: "Entresto", before: "11:00", after: "20:00" }],
    },
  ];

  function renderDialog() {
    render(
      <TimezoneChangeDialog
        open
        oldTimezone="Europe/Berlin"
        newTimezone="America/New_York"
        anchors={anchors}
        isRecalculating={false}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
  }

  it("names every anchor zone, not just the first", () => {
    renderDialog();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getAllByText(/Berlin/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/Los Angeles/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/New York/).length).toBeGreaterThan(0);
  });

  it("shows each dose's before and after time", () => {
    renderDialog();
    const metoprolol = screen.getByTestId("tz-dose-s1");
    expect(metoprolol).toHaveTextContent("Metoprolol");
    expect(metoprolol).toHaveTextContent("02:30");
    expect(metoprolol).toHaveTextContent("08:30");
    const entresto = screen.getByTestId("tz-dose-s2");
    expect(entresto).toHaveTextContent("11:00");
    expect(entresto).toHaveTextContent("20:00");
  });
});
