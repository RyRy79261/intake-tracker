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
});
