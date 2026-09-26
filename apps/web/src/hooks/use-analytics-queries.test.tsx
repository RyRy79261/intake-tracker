// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

import {
  useFluidBalance,
  useWeightTrend,
  useBPTrend,
  useSaltVsWeight,
  useTimeScopeRange,
} from "@/hooks/use-analytics-queries";
import { useSettingsStore } from "@/stores/settings-store";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeUrinationRecord,
} from "@/__tests__/fixtures/db-fixtures";
import type { TimeRange } from "@intake/types/analytics";

function makeWrapper() {
  const client = makeTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const DAY = 86_400_000;
// A wide range that comfortably contains everything seeded below.
const RANGE: TimeRange = { start: 0, end: Date.now() + DAY };

describe("useFluidBalance", () => {
  it("aggregates water intake minus urination output into a daily balance", async () => {
    // One day: 1000ml water in, one "medium" urination (~300ml) out.
    const ts = Date.UTC(2024, 5, 10, 9, 0, 0);
    await seedDatabase({
      intakeRecords: [
        makeIntakeRecord({ type: "water", amount: 600, timestamp: ts }),
        makeIntakeRecord({ type: "water", amount: 400, timestamp: ts + 3_600_000 }),
      ],
      urinationRecords: [
        makeUrinationRecord({ amountEstimate: "medium", timestamp: ts + 7_200_000 }),
      ],
    });

    const { result } = renderHook(() => useFluidBalance(RANGE), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.value.daily.length).toBe(1);
    });

    const day = result.current.value.daily[0]!;
    expect(day.intakeMl).toBe(1000);
    expect(day.urinationCount).toBe(1);
    // balance = intake - estimated output; output is positive, so balance < intake.
    expect(day.balance).toBeLessThan(1000);
    expect(day.balance).toBe(1000 - day.urinationEstimatedMl);
    expect(result.current.value.daysTotal).toBe(1);
  });

  it("returns the empty default when no fluid records exist", async () => {
    const { result } = renderHook(() => useFluidBalance(RANGE), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.value.daysTotal).toBe(0);
    });
    expect(result.current.value.daily).toEqual([]);
    expect(result.current.value.avgBalance).toBe(0);
  });
});

describe("useWeightTrend", () => {
  it("computes average, min and max across seeded weight readings", async () => {
    const base = Date.UTC(2024, 5, 1);
    await seedDatabase({
      weightRecords: [
        makeWeightRecord({ weight: 80, timestamp: base }),
        makeWeightRecord({ weight: 78, timestamp: base + DAY }),
        makeWeightRecord({ weight: 76, timestamp: base + 2 * DAY }),
      ],
    });

    const { result } = renderHook(() => useWeightTrend(RANGE), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.value.readings.length).toBe(3);
    });

    expect(result.current.value.avg).toBeCloseTo(78, 5);
    expect(result.current.value.min).toBe(76);
    expect(result.current.value.max).toBe(80);
    // A steady downward run should not be reported as rising.
    expect(result.current.value.trend.direction).not.toBe("rising");
  });
});

describe("useBPTrend", () => {
  it("averages systolic and diastolic readings over the range", async () => {
    const base = Date.UTC(2024, 5, 1);
    await seedDatabase({
      bloodPressureRecords: [
        makeBloodPressureRecord({ systolic: 120, diastolic: 80, timestamp: base }),
        makeBloodPressureRecord({ systolic: 130, diastolic: 90, timestamp: base + DAY }),
      ],
    });

    const { result } = renderHook(() => useBPTrend(RANGE), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.value.readings.length).toBe(2);
    });

    expect(result.current.value.avg.systolic).toBe(125);
    expect(result.current.value.avg.diastolic).toBe(85);
  });
});

describe("useSaltVsWeight", () => {
  it("produces a correlation result with paired series from salt and weight data", async () => {
    const base = Date.UTC(2024, 5, 1);
    await seedDatabase({
      intakeRecords: [
        makeIntakeRecord({ type: "salt", amount: 2000, timestamp: base }),
        makeIntakeRecord({ type: "salt", amount: 3000, timestamp: base + DAY }),
        makeIntakeRecord({ type: "salt", amount: 4000, timestamp: base + 2 * DAY }),
      ],
      weightRecords: [
        makeWeightRecord({ weight: 75, timestamp: base }),
        makeWeightRecord({ weight: 76, timestamp: base + DAY }),
        makeWeightRecord({ weight: 77, timestamp: base + 2 * DAY }),
      ],
    });

    // lagDays 0 keeps salt and weight aligned on the same calendar day.
    const { result } = renderHook(() => useSaltVsWeight(RANGE, 0), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.value.pairedDays).toBe(3);
    });

    // Salt and weight both rise together -> a positive coefficient.
    expect(result.current.value.coefficient).toBeGreaterThan(0);
    expect(result.current.unit).toBe("correlation");
  });
});

describe("useTimeScopeRange", () => {
  // Local wall-clock dates: jsdom's device zone is the host zone.
  const local = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    useSettingsStore.setState({ dayStartHour: 2 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aligns presets to logical days that start at dayStartHour", () => {
    vi.setSystemTime(local(20, 23, 30));
    const { result } = renderHook(() => useTimeScopeRange("7d"));
    expect(result.current).toEqual({ start: local(14, 2), end: local(21, 2) - 1 });
  });

  it("treats 'Today' as the current logical day, even after midnight", () => {
    vi.setSystemTime(local(21, 1, 0));
    const { result } = renderHook(() => useTimeScopeRange("24h"));
    expect(result.current).toEqual({ start: local(20, 2), end: local(21, 2) - 1 });
  });

  it("moves the range forward when the day rolls over with the page open", () => {
    vi.setSystemTime(local(20, 23, 30));
    const { result } = renderHook(() => useTimeScopeRange("7d"));
    const before = result.current;

    vi.setSystemTime(local(21, 8, 0));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.end).toBe(local(22, 2) - 1);
    expect(result.current.start).toBe(local(15, 2));

    // Within the same logical day the object stays referentially stable.
    const after = result.current;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(after);
    expect(before).not.toBe(after);
  });
});
