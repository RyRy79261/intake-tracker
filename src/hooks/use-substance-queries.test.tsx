// @vitest-environment jsdom
import { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import { makeSubstanceRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  useSubstanceRecords,
  useSubstanceRecordsByDateRange,
  useAddSubstance,
  useUpdateSubstance,
  useDeleteSubstance,
} from "./use-substance-queries";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("useSubstanceRecords", () => {
  it("returns seeded records newest-first", async () => {
    await seedDatabase({
      substanceRecords: [
        makeSubstanceRecord({ timestamp: 1000, type: "caffeine" }),
        makeSubstanceRecord({ timestamp: 3000, type: "alcohol" }),
        makeSubstanceRecord({ timestamp: 2000, type: "caffeine" }),
      ],
    });

    const { result } = renderHook(() => useSubstanceRecords(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(3));
    expect(result.current.map((r) => r.timestamp)).toEqual([3000, 2000, 1000]);
  });

  it("filters by substance type", async () => {
    await seedDatabase({
      substanceRecords: [
        makeSubstanceRecord({ timestamp: 1000, type: "caffeine" }),
        makeSubstanceRecord({ timestamp: 2000, type: "alcohol" }),
      ],
    });

    const { result } = renderHook(() => useSubstanceRecords("alcohol"), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.type).toBe("alcohol");
  });

  it("excludes soft-deleted records", async () => {
    await seedDatabase({
      substanceRecords: [
        makeSubstanceRecord({ timestamp: 1000 }),
        makeSubstanceRecord({ timestamp: 2000, deletedAt: Date.now() }),
      ],
    });

    const { result } = renderHook(() => useSubstanceRecords(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.timestamp).toBe(1000);
  });
});

describe("useSubstanceRecordsByDateRange", () => {
  it("returns only records inside the range", async () => {
    await seedDatabase({
      substanceRecords: [
        makeSubstanceRecord({ timestamp: 500 }),
        makeSubstanceRecord({ timestamp: 1500 }),
        makeSubstanceRecord({ timestamp: 2500 }),
      ],
    });

    const { result } = renderHook(
      () => useSubstanceRecordsByDateRange(1000, 2000),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.timestamp).toBe(1500);
  });

  it("filters by type within the range", async () => {
    await seedDatabase({
      substanceRecords: [
        makeSubstanceRecord({ timestamp: 1200, type: "caffeine" }),
        makeSubstanceRecord({ timestamp: 1500, type: "alcohol" }),
      ],
    });

    const { result } = renderHook(
      () => useSubstanceRecordsByDateRange(1000, 2000, "alcohol"),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.type).toBe("alcohol");
  });
});

describe("useAddSubstance", () => {
  it("writes a new substance record through to the database", async () => {
    const { result } = renderHook(() => useAddSubstance(), { wrapper });

    const created = await result.current({
      type: "caffeine",
      amountMg: 80,
      description: "Espresso",
      timestamp: 9000,
    });

    const stored = await db.substanceRecords.get(created.id);
    expect(stored).toBeDefined();
    expect(stored?.type).toBe("caffeine");
    expect(stored?.amountMg).toBe(80);
    expect(stored?.description).toBe("Espresso");
  });

  it("also creates a linked intake record when volumeMl is supplied", async () => {
    const add = renderHook(() => useAddSubstance(), { wrapper });

    const created = await add.result.current({
      type: "caffeine",
      amountMg: 95,
      volumeMl: 250,
      description: "Coffee",
      timestamp: 8000,
    });

    const linked = await db.intakeRecords
      .where("source")
      .equals(`substance:${created.id}`)
      .toArray();
    expect(linked).toHaveLength(1);
    expect(linked[0]?.amount).toBe(250);
  });
});

describe("useUpdateSubstance", () => {
  it("updates an existing substance record", async () => {
    const record = makeSubstanceRecord({ description: "Coffee", amountMg: 95 });
    await seedDatabase({ substanceRecords: [record] });

    const { result } = renderHook(() => useUpdateSubstance(), { wrapper });
    await result.current(record.id, { description: "Latte", amountMg: 120 });

    const stored = await db.substanceRecords.get(record.id);
    expect(stored?.description).toBe("Latte");
    expect(stored?.amountMg).toBe(120);
  });
});

describe("useDeleteSubstance", () => {
  it("soft-deletes a record so the live query drops it", async () => {
    const record = makeSubstanceRecord({ timestamp: 4000 });
    await seedDatabase({ substanceRecords: [record] });

    const del = renderHook(() => useDeleteSubstance(), { wrapper });
    const list = renderHook(() => useSubstanceRecords(), { wrapper });

    await waitFor(() => expect(list.result.current).toHaveLength(1));

    await del.result.current(record.id);

    await waitFor(() => expect(list.result.current).toHaveLength(0));
    const stored = await db.substanceRecords.get(record.id);
    expect(stored?.deletedAt).not.toBeNull();
  });
});
