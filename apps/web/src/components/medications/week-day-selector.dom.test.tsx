// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import { WeekDaySelector } from "@/components/medications/week-day-selector";
import { useSettingsStore } from "@/stores/settings-store";

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

  describe("with a user-chosen week start", () => {
    afterEach(() => {
      useSettingsStore.setState(useSettingsStore.getInitialState());
    });

    it("starts the week on Sunday when the user chose Sunday", () => {
      useSettingsStore.setState({ weekStartsOn: 0 });
      render(<WeekDaySelector selectedDate={new Date(2026, 8, 24, 12, 0)} onSelectDate={() => {}} />);
      const days = screen.getAllByRole("button").filter((b) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d+$/.test(b.textContent ?? ""));
      expect(days.map((b) => b.textContent)).toEqual([
        "Sun20", "Mon21", "Tue22", "Wed23", "Thu24", "Fri25", "Sat26",
      ]);
    });

    it("moves the strip when the setting changes", () => {
      render(<WeekDaySelector selectedDate={new Date(2026, 8, 27, 12, 0)} onSelectDate={() => {}} />);
      const firstDay = () =>
        screen.getAllByRole("button").find((b) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d+$/.test(b.textContent ?? ""))!.textContent;
      expect(firstDay()).toBe("Mon21");
      act(() => {
        useSettingsStore.setState({ weekStartsOn: 6 });
      });
      expect(firstDay()).toBe("Sat26");
    });
  });
});
