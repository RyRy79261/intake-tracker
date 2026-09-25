// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTodayKey, useRollingSelectedDate } from "@/hooks/use-today-key";
import { toLocalDateKey } from "@/lib/date-utils";

describe("useTodayKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 23, 59, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolls over to the new calendar day without any other re-render", () => {
    const { result } = renderHook(() => useTodayKey());
    expect(result.current).toBe("2026-09-24");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe("2026-09-25");
  });
});

describe("useRollingSelectedDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 23, 59, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves a today selection to the new today at midnight", () => {
    const { result } = renderHook(() => useRollingSelectedDate());
    expect(toLocalDateKey(result.current.selectedDate)).toBe("2026-09-24");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.todayKey).toBe("2026-09-25");
    expect(toLocalDateKey(result.current.selectedDate)).toBe("2026-09-25");
  });

  it("leaves a deliberately browsed day alone at midnight", () => {
    const { result } = renderHook(() => useRollingSelectedDate());
    act(() => {
      result.current.setSelectedDate(new Date(2026, 8, 20));
    });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(toLocalDateKey(result.current.selectedDate)).toBe("2026-09-20");
  });
});
