// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNowTick } from "@/hooks/use-now-tick";

describe("useNowTick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at 0 and does not advance before the interval elapses", () => {
    const { result } = renderHook(() => useNowTick(1000));
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(0);
  });

  it("increments once per interval as time advances", () => {
    const { result } = renderHook(() => useNowTick(1000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(4);
  });

  it("defaults to a 60s interval when called with no argument", () => {
    const { result } = renderHook(() => useNowTick());

    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(1);
  });

  it("falls back to the default interval for invalid (non-positive / NaN) inputs", () => {
    const { result } = renderHook(() => useNowTick(0));

    // 0 is invalid, so it should behave like the 60s default.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(1);

    const nan = renderHook(() => useNowTick(NaN));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(nan.result.current).toBe(1);
  });

  it("shares a single timer across multiple subscribers of the same interval", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const a = renderHook(() => useNowTick(5000));
    const b = renderHook(() => useNowTick(5000));

    // Only one underlying interval is created for the shared period.
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(a.result.current).toBe(1);
    expect(b.result.current).toBe(1);

    setIntervalSpy.mockRestore();
  });

  it("stops ticking after the hook unmounts", () => {
    const { result, unmount } = renderHook(() => useNowTick(1000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Value is frozen at the last render before unmount.
    expect(result.current).toBe(1);
  });
});
