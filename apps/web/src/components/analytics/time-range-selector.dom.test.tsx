// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TimeRangeSelector } from "@/components/analytics/time-range-selector";
import { useSettingsStore } from "@/stores/settings-store";
import type { TimeRange } from "@intake/types/analytics";

// Local wall-clock dates: jsdom's device zone is the host zone, so these hold
// in any TZ (run with TZ=America/New_York to exercise west-of-UTC parsing).
const local = (m: number, d: number, h = 0) => new Date(2026, m, d, h).getTime();

function renderSelector(customRange: TimeRange | null) {
  const onCustomRangeChange = vi.fn();
  render(
    <TimeRangeSelector
      scope="7d"
      onScopeChange={() => {}}
      customRange={customRange}
      onCustomRangeChange={onCustomRangeChange}
    />,
  );
  return onCustomRangeChange;
}

describe("TimeRangeSelector", () => {
  beforeEach(() => {
    useSettingsStore.setState({ dayStartHour: 2 });
  });

  it("labels the calendar-day preset 'Today' rather than '24h'", () => {
    renderSelector(null);
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "24h" })).not.toBeInTheDocument();
  });

  it("parses a picked start date as that local day, starting at dayStartHour", () => {
    const onChange = renderSelector({ start: local(8, 10, 2), end: local(8, 25, 2) - 1 });
    const [startInput] = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    fireEvent.change(startInput!, { target: { value: "2026-09-20" } });
    expect(onChange).toHaveBeenCalledWith({
      start: local(8, 20, 2),
      end: local(8, 25, 2) - 1,
    });
  });

  it("parses a picked end date as the end of that local logical day", () => {
    const onChange = renderSelector({ start: local(8, 10, 2), end: local(8, 25, 2) - 1 });
    const inputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    fireEvent.change(inputs[1]!, { target: { value: "2026-09-20" } });
    expect(onChange).toHaveBeenCalledWith({
      start: local(8, 10, 2),
      end: local(8, 21, 2) - 1,
    });
  });

  it("shows the logical day of the range ends in the date inputs", () => {
    renderSelector({ start: local(8, 10, 2), end: local(8, 25, 2) - 1 });
    expect(screen.getByDisplayValue("2026-09-10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-09-24")).toBeInTheDocument();
  });
});
