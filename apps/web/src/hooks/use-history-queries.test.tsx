// @vitest-environment jsdom
import { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

import { useHistoryData } from "@/hooks/use-history-queries";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  makeIntakeRecord,
  makeWeightRecord,
  makeBloodPressureRecord,
  makeEatingRecord,
  makeUrinationRecord,
  makeDefecationRecord,
} from "@/__tests__/fixtures/db-fixtures";
import { db } from "@/lib/db";

function makeWrapper() {
  const client = makeTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useHistoryData", () => {
  it("loads records from every domain table", async () => {
    await seedDatabase({
      intakeRecords: [
        makeIntakeRecord({ type: "water", amount: 250 }),
        makeIntakeRecord({ type: "salt", amount: 1000 }),
      ],
      weightRecords: [makeWeightRecord({ weight: 74 })],
      bloodPressureRecords: [makeBloodPressureRecord({ systolic: 121 })],
      eatingRecords: [makeEatingRecord({ grams: 300 })],
      urinationRecords: [makeUrinationRecord()],
      defecationRecords: [makeDefecationRecord()],
    });

    const { result } = renderHook(() => useHistoryData(100), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.intakeRecords.length).toBe(2);
    });

    expect(result.current.data.weightRecords.length).toBe(1);
    expect(result.current.data.bpRecords.length).toBe(1);
    expect(result.current.data.eatingRecords.length).toBe(1);
    expect(result.current.data.urinationRecords.length).toBe(1);
    expect(result.current.data.defecationRecords.length).toBe(1);
  });

  it("excludes soft-deleted records from the result", async () => {
    await seedDatabase({
      weightRecords: [
        makeWeightRecord({ weight: 70 }),
        makeWeightRecord({ weight: 71, deletedAt: Date.now() }),
      ],
    });

    const { result } = renderHook(() => useHistoryData(100), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.weightRecords.length).toBe(1);
    });
    expect(result.current.data.weightRecords[0]!.weight).toBe(70);
  });

  it("respects the limit argument when fetching intake records", async () => {
    const now = Date.now();
    await seedDatabase({
      intakeRecords: Array.from({ length: 5 }, (_, i) =>
        makeIntakeRecord({ type: "water", amount: 250, timestamp: now - i * 1000 }),
      ),
    });

    const { result } = renderHook(() => useHistoryData(3), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.intakeRecords.length).toBe(3);
    });
  });

  it("deleteWeight soft-deletes the record and the live query drops it", async () => {
    const record = makeWeightRecord({ weight: 88 });
    await seedDatabase({ weightRecords: [record] });

    const { result } = renderHook(() => useHistoryData(100), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.weightRecords.length).toBe(1);
    });

    await act(async () => {
      await result.current.deleteWeight(record.id);
    });

    await waitFor(() => {
      expect(result.current.data.weightRecords.length).toBe(0);
    });

    const row = await db.weightRecords.get(record.id);
    expect(row?.deletedAt).not.toBeNull();
  });

  it("deleteBP soft-deletes a blood pressure record", async () => {
    const record = makeBloodPressureRecord({ systolic: 145 });
    await seedDatabase({ bloodPressureRecords: [record] });

    const { result } = renderHook(() => useHistoryData(100), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data.bpRecords.length).toBe(1);
    });

    await act(async () => {
      await result.current.deleteBP(record.id);
    });

    await waitFor(() => {
      expect(result.current.data.bpRecords.length).toBe(0);
    });

    const row = await db.bloodPressureRecords.get(record.id);
    expect(row?.deletedAt).not.toBeNull();
  });
});
