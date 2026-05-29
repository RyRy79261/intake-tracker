// @vitest-environment jsdom
import { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import { makeUrinationRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  useUrinationRecords,
  useUrinationRecordsByDateRange,
  useAddUrination,
  useUpdateUrination,
  useDeleteUrination,
} from "@/hooks/use-urination-queries";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("useUrinationRecords", () => {
  it("returns seeded records newest-first", async () => {
    await seedDatabase({
      urinationRecords: [
        makeUrinationRecord({ timestamp: 1000, amountEstimate: "small" }),
        makeUrinationRecord({ timestamp: 3000, amountEstimate: "large" }),
        makeUrinationRecord({ timestamp: 2000, amountEstimate: "medium" }),
      ],
    });

    const { result } = renderHook(() => useUrinationRecords(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(3));
    expect(result.current.map((r) => r.timestamp)).toEqual([3000, 2000, 1000]);
  });

  it("respects the limit argument", async () => {
    await seedDatabase({
      urinationRecords: [
        makeUrinationRecord({ timestamp: 1000 }),
        makeUrinationRecord({ timestamp: 2000 }),
        makeUrinationRecord({ timestamp: 3000 }),
      ],
    });

    const { result } = renderHook(() => useUrinationRecords(2), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((r) => r.timestamp)).toEqual([3000, 2000]);
  });

  it("excludes soft-deleted records", async () => {
    await seedDatabase({
      urinationRecords: [
        makeUrinationRecord({ timestamp: 1000 }),
        makeUrinationRecord({ timestamp: 2000, deletedAt: Date.now() }),
      ],
    });

    const { result } = renderHook(() => useUrinationRecords(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.timestamp).toBe(1000);
  });
});

describe("useUrinationRecordsByDateRange", () => {
  it("returns only records inside the range", async () => {
    await seedDatabase({
      urinationRecords: [
        makeUrinationRecord({ timestamp: 500 }),
        makeUrinationRecord({ timestamp: 1500 }),
        makeUrinationRecord({ timestamp: 2500 }),
      ],
    });

    const { result } = renderHook(
      () => useUrinationRecordsByDateRange(1000, 2000),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.timestamp).toBe(1500);
  });

  it("returns an empty array when start is not before end", async () => {
    await seedDatabase({
      urinationRecords: [makeUrinationRecord({ timestamp: 1500 })],
    });

    const { result } = renderHook(
      () => useUrinationRecordsByDateRange(2000, 1000),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toEqual([]));
  });
});

describe("useAddUrination", () => {
  it("writes a new record through to the database", async () => {
    const { result } = renderHook(() => useAddUrination(), { wrapper });

    const created = await result.current.mutateAsync({
      timestamp: 9000,
      amountEstimate: "small",
      note: "morning",
    });

    const stored = await db.urinationRecords.get(created.id);
    expect(stored).toBeDefined();
    expect(stored?.amountEstimate).toBe("small");
    expect(stored?.note).toBe("morning");
    expect(stored?.timestamp).toBe(9000);
  });

  it("makes the new record visible to the live query", async () => {
    const add = renderHook(() => useAddUrination(), { wrapper });
    const list = renderHook(() => useUrinationRecords(), { wrapper });

    await waitFor(() => expect(list.result.current).toEqual([]));

    await add.result.current.mutateAsync({ timestamp: 7000 });

    await waitFor(() => expect(list.result.current).toHaveLength(1));
    expect(list.result.current[0]?.timestamp).toBe(7000);
  });
});

describe("useUpdateUrination", () => {
  it("updates an existing record", async () => {
    const record = makeUrinationRecord({ amountEstimate: "small" });
    await seedDatabase({ urinationRecords: [record] });

    const { result } = renderHook(() => useUpdateUrination(), { wrapper });
    await result.current.mutateAsync({
      id: record.id,
      updates: { amountEstimate: "large", note: "updated" },
    });

    const stored = await db.urinationRecords.get(record.id);
    expect(stored?.amountEstimate).toBe("large");
    expect(stored?.note).toBe("updated");
  });
});

describe("useDeleteUrination", () => {
  it("soft-deletes a record so the live query drops it", async () => {
    const record = makeUrinationRecord({ timestamp: 4000 });
    await seedDatabase({ urinationRecords: [record] });

    const del = renderHook(() => useDeleteUrination(), { wrapper });
    const list = renderHook(() => useUrinationRecords(), { wrapper });

    await waitFor(() => expect(list.result.current).toHaveLength(1));

    await del.result.current.mutateAsync(record.id);

    await waitFor(() => expect(list.result.current).toHaveLength(0));
    const stored = await db.urinationRecords.get(record.id);
    expect(stored?.deletedAt).not.toBeNull();
  });
});
