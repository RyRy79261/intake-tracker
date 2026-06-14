// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase, weightSeries, bloodPressureSeries } from "@/__tests__/fixtures/scenarios";
import {
  useWeightRecords,
  useLatestWeight,
  useAddWeight,
  useUpdateWeight,
  useDeleteWeight,
  useBloodPressureRecords,
  useLatestBloodPressure,
  useAddBloodPressure,
  useUpdateBloodPressure,
  useDeleteBloodPressure,
} from "@/hooks/use-health-queries";

function makeWrapper() {
  const client = makeTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("use-health-queries weight hooks", () => {
  it("useWeightRecords returns records newest-first capped by limit", async () => {
    await seedDatabase({ weightRecords: weightSeries(5) });

    const { result } = renderHook(() => useWeightRecords(3), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toHaveLength(3));
    // weightSeries index 0 (75.00) is most recent; service sorts desc.
    expect(result.current![0]!.weight).toBe(75);
    expect(result.current![0]!.timestamp).toBeGreaterThan(
      result.current![1]!.timestamp,
    );
  });

  it("useLatestWeight returns the single most recent record", async () => {
    await seedDatabase({ weightRecords: weightSeries(4) });

    const { result } = renderHook(() => useLatestWeight(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!.weight).toBe(75);
  });

  it("useAddWeight writes a weight record to the database", async () => {
    const { result } = renderHook(() => useAddWeight(), {
      wrapper: makeWrapper(),
    });

    const record = await result.current.mutateAsync({ weight: 82.5 });

    const stored = await db.weightRecords.get(record.id);
    expect(stored?.weight).toBe(82.5);
    expect(stored?.deletedAt).toBeNull();
  });

  it("useUpdateWeight changes the stored weight", async () => {
    const seed = weightSeries(1)[0]!;
    await seedDatabase({ weightRecords: [seed] });

    const { result } = renderHook(() => useUpdateWeight(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync({
      id: seed.id,
      updates: { weight: 70.1 },
    });

    const stored = await db.weightRecords.get(seed.id);
    expect(stored?.weight).toBe(70.1);
  });

  it("useDeleteWeight soft-deletes and the live query drops it", async () => {
    const seed = weightSeries(1)[0]!;
    await seedDatabase({ weightRecords: [seed] });

    const list = renderHook(() => useWeightRecords(5), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(list.result.current).toHaveLength(1));

    const del = renderHook(() => useDeleteWeight(), { wrapper: makeWrapper() });
    await del.result.current.mutateAsync(seed.id);

    await waitFor(() => expect(list.result.current).toHaveLength(0));
    const stored = await db.weightRecords.get(seed.id);
    expect(stored?.deletedAt).not.toBeNull();
  });
});

describe("use-health-queries blood pressure hooks", () => {
  it("useBloodPressureRecords returns records newest-first capped by limit", async () => {
    await seedDatabase({ bloodPressureRecords: bloodPressureSeries(5) });

    const { result } = renderHook(() => useBloodPressureRecords(2), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toHaveLength(2));
    // bloodPressureSeries index 0 (118/76) is most recent.
    expect(result.current[0]!.systolic).toBe(118);
    expect(result.current[0]!.diastolic).toBe(76);
  });

  it("useLatestBloodPressure returns the most recent reading", async () => {
    await seedDatabase({ bloodPressureRecords: bloodPressureSeries(3) });

    const { result } = renderHook(() => useLatestBloodPressure(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!.systolic).toBe(118);
  });

  it("useAddBloodPressure writes a reading to the database", async () => {
    const { result } = renderHook(() => useAddBloodPressure(), {
      wrapper: makeWrapper(),
    });

    const record = await result.current.mutateAsync({
      systolic: 130,
      diastolic: 85,
      position: "sitting",
      arm: "left",
      heartRate: 72,
    });

    const stored = await db.bloodPressureRecords.get(record.id);
    expect(stored?.systolic).toBe(130);
    expect(stored?.diastolic).toBe(85);
    expect(stored?.heartRate).toBe(72);
  });

  it("useUpdateBloodPressure changes the stored reading", async () => {
    const seed = bloodPressureSeries(1)[0]!;
    await seedDatabase({ bloodPressureRecords: [seed] });

    const { result } = renderHook(() => useUpdateBloodPressure(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync({
      id: seed.id,
      updates: { systolic: 140 },
    });

    const stored = await db.bloodPressureRecords.get(seed.id);
    expect(stored?.systolic).toBe(140);
  });

  it("useDeleteBloodPressure soft-deletes and the live query drops it", async () => {
    const seed = bloodPressureSeries(1)[0]!;
    await seedDatabase({ bloodPressureRecords: [seed] });

    const list = renderHook(() => useBloodPressureRecords(5), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(list.result.current).toHaveLength(1));

    const del = renderHook(() => useDeleteBloodPressure(), {
      wrapper: makeWrapper(),
    });
    await del.result.current.mutateAsync(seed.id);

    await waitFor(() => expect(list.result.current).toHaveLength(0));
    const stored = await db.bloodPressureRecords.get(seed.id);
    expect(stored?.deletedAt).not.toBeNull();
  });
});
