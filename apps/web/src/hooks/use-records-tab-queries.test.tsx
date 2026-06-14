// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

import { useRecordsTabData } from "@/hooks/use-records-tab-queries";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeEatingRecord,
  makeSubstanceRecord,
} from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";
import type { TimeRange } from "@/lib/analytics-types";

function makeWrapper() {
  const client = makeTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const DAY = 86_400_000;
const RANGE: TimeRange = { start: 0, end: Date.now() + DAY };

describe("useRecordsTabData", () => {
  it("merges all domains into one array sorted newest-first", async () => {
    const base = Date.UTC(2024, 5, 1, 8, 0, 0);
    await seedDatabase({
      intakeRecords: [makeIntakeRecord({ type: "water", amount: 250, timestamp: base })],
      weightRecords: [makeWeightRecord({ weight: 72, timestamp: base + 2 * DAY })],
      bloodPressureRecords: [
        makeBloodPressureRecord({ systolic: 120, timestamp: base + DAY }),
      ],
      eatingRecords: [makeEatingRecord({ grams: 200, timestamp: base + 3 * DAY })],
    });

    const { result } = renderHook(() => useRecordsTabData(RANGE), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.length).toBe(4);
    });

    // Sorted descending by timestamp -> eating (newest) first, intake (oldest) last.
    expect(result.current.data[0]!.type).toBe("eating");
    expect(result.current.data[result.current.data.length - 1]!.type).toBe("intake");
    const timestamps = result.current.data.map((r) => r.record.timestamp);
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });

  it("maps substance records to their caffeine/alcohol type", async () => {
    const base = Date.UTC(2024, 5, 1, 8, 0, 0);
    await seedDatabase({
      substanceRecords: [
        makeSubstanceRecord({ type: "caffeine", amountMg: 95, timestamp: base }),
        makeSubstanceRecord({ type: "alcohol", amountMg: 0, timestamp: base + DAY }),
      ],
    });

    const { result } = renderHook(() => useRecordsTabData(RANGE), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.length).toBe(2);
    });

    const types = result.current.data.map((r) => r.type).sort();
    expect(types).toEqual(["alcohol", "caffeine"]);
  });

  it("excludes records whose timestamp falls outside the range", async () => {
    const inRange = Date.UTC(2024, 5, 15);
    const outOfRange = Date.UTC(2030, 0, 1);
    await seedDatabase({
      weightRecords: [
        makeWeightRecord({ weight: 70, timestamp: inRange }),
        makeWeightRecord({ weight: 99, timestamp: outOfRange }),
      ],
    });

    const range: TimeRange = {
      start: Date.UTC(2024, 5, 1),
      end: Date.UTC(2024, 5, 30),
    };
    const { result } = renderHook(() => useRecordsTabData(range), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });
    expect(result.current.data[0]!.record.id).toBeDefined();
    expect((result.current.data[0]!.record as { weight: number }).weight).toBe(70);
  });

  it("deleteSubstance soft-deletes and the live query removes the row", async () => {
    const base = Date.UTC(2024, 5, 1, 8, 0, 0);
    const substance = makeSubstanceRecord({
      type: "caffeine",
      amountMg: 80,
      timestamp: base,
    });
    await seedDatabase({ substanceRecords: [substance] });

    const { result } = renderHook(() => useRecordsTabData(RANGE), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });

    await act(async () => {
      await result.current.deleteSubstance(substance.id);
    });

    await waitFor(() => {
      expect(result.current.data.length).toBe(0);
    });

    const row = await db.substanceRecords.get(substance.id);
    expect(row?.deletedAt).not.toBeNull();
  });
});
