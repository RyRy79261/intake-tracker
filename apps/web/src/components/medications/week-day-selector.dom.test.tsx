// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import { WeekDaySelector } from "@/components/medications/week-day-selector";

describe("WeekDaySelector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 23, 59, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops labelling the old day as Today once midnight passes", () => {
    const selected = new Date(2026, 8, 24, 12, 0);
    render(<WeekDaySelector selectedDate={selected} onSelectDate={() => {}} />);
    expect(screen.getByText(/^Today, Sep 24, 2026$/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.queryByText(/^Today, Sep 24/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Yesterday, Sep 24, 2026$/)).toBeInTheDocument();
  });

  it("starts the week on Monday and ends it on Sunday", () => {
    // Thu 24 Sep 2026 -> week Mon 21 .. Sun 27 Sep.
    render(<WeekDaySelector selectedDate={new Date(2026, 8, 24, 12, 0)} onSelectDate={() => {}} />);
    const days = screen.getAllByRole("button").filter((b) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d+$/.test(b.textContent ?? ""));
    expect(days.map((b) => b.textContent)).toEqual([
      "Mon21", "Tue22", "Wed23", "Thu24", "Fri25", "Sat26", "Sun27",
    ]);
  });

  it("keeps a Sunday in the week that started the Monday before", () => {
    render(<WeekDaySelector selectedDate={new Date(2026, 8, 27, 12, 0)} onSelectDate={() => {}} />);
    const days = screen.getAllByRole("button").filter((b) => /^(Mon|Sun)\d+$/.test(b.textContent ?? ""));
    expect(days.map((b) => b.textContent)).toEqual(["Mon21", "Sun27"]);
  });
});
