// @vitest-environment jsdom
import { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import { makeDefecationRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  useDefecationRecords,
  useDefecationRecordsByDateRange,
  useAddDefecation,
  useUpdateDefecation,
  useDeleteDefecation,
} from "@/hooks/use-defecation-queries";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("useDefecationRecords", () => {
  it("returns seeded records newest-first", async () => {
    await seedDatabase({
      defecationRecords: [
        makeDefecationRecord({ timestamp: 1000, amountEstimate: "small" }),
        makeDefecationRecord({ timestamp: 3000, amountEstimate: "large" }),
        makeDefecationRecord({ timestamp: 2000, amountEstimate: "medium" }),
      ],
    });

    const { result } = renderHook(() => useDefecationRecords(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(3));
    expect(result.current.map((r) => r.timestamp)).toEqual([3000, 2000, 1000]);
  });

  it("respects the limit argument", async () => {
    await seedDatabase({
      defecationRecords: [
        makeDefecationRecord({ timestamp: 1000 }),
        makeDefecationRecord({ timestamp: 2000 }),
        makeDefecationRecord({ timestamp: 3000 }),
      ],
    });

    const { result } = renderHook(() => useDefecationRecords(2), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((r) => r.timestamp)).toEqual([3000, 2000]);
  });

  it("excludes soft-deleted records", async () => {
    await seedDatabase({
      defecationRecords: [
        makeDefecationRecord({ timestamp: 1000 }),
        makeDefecationRecord({ timestamp: 2000, deletedAt: Date.now() }),
      ],
    });

    const { result } = renderHook(() => useDefecationRecords(), { wrapper });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.timestamp).toBe(1000);
  });
});

describe("useDefecationRecordsByDateRange", () => {
  it("returns only records inside the range", async () => {
    await seedDatabase({
      defecationRecords: [
        makeDefecationRecord({ timestamp: 500 }),
        makeDefecationRecord({ timestamp: 1500 }),
        makeDefecationRecord({ timestamp: 2500 }),
      ],
    });

    const { result } = renderHook(
      () => useDefecationRecordsByDateRange(1000, 2000),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.timestamp).toBe(1500);
  });

  it("returns an empty array when start is not before end", async () => {
    await seedDatabase({
      defecationRecords: [makeDefecationRecord({ timestamp: 1500 })],
    });

    const { result } = renderHook(
      () => useDefecationRecordsByDateRange(2000, 1000),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toEqual([]));
  });
});

describe("useAddDefecation", () => {
  it("writes a new record through to the database", async () => {
    const { result } = renderHook(() => useAddDefecation(), { wrapper });

    const created = await result.current.mutateAsync({
      timestamp: 9000,
      amountEstimate: "large",
      note: "after lunch",
    });

    const stored = await db.defecationRecords.get(created.id);
    expect(stored).toBeDefined();
    expect(stored?.amountEstimate).toBe("large");
    expect(stored?.note).toBe("after lunch");
    expect(stored?.timestamp).toBe(9000);
  });

  it("makes the new record visible to the live query", async () => {
    const add = renderHook(() => useAddDefecation(), { wrapper });
    const list = renderHook(() => useDefecationRecords(), { wrapper });

    await waitFor(() => expect(list.result.current).toEqual([]));

    await add.result.current.mutateAsync({ timestamp: 7000 });

    await waitFor(() => expect(list.result.current).toHaveLength(1));
    expect(list.result.current[0]?.timestamp).toBe(7000);
  });
});

describe("useUpdateDefecation", () => {
  it("updates an existing record", async () => {
    const record = makeDefecationRecord({ amountEstimate: "small" });
    await seedDatabase({ defecationRecords: [record] });

    const { result } = renderHook(() => useUpdateDefecation(), { wrapper });
    await result.current.mutateAsync({
      id: record.id,
      updates: { amountEstimate: "large", note: "updated" },
    });

    const stored = await db.defecationRecords.get(record.id);
    expect(stored?.amountEstimate).toBe("large");
    expect(stored?.note).toBe("updated");
  });

  it("rejects when the record does not exist", async () => {
    const { result } = renderHook(() => useUpdateDefecation(), { wrapper });
    await expect(
      result.current.mutateAsync({ id: "missing", updates: {} }),
    ).rejects.toThrow();
  });
});

describe("useDeleteDefecation", () => {
  it("soft-deletes a record so the live query drops it", async () => {
    const record = makeDefecationRecord({ timestamp: 4000 });
    await seedDatabase({ defecationRecords: [record] });

    const del = renderHook(() => useDeleteDefecation(), { wrapper });
    const list = renderHook(() => useDefecationRecords(), { wrapper });

    await waitFor(() => expect(list.result.current).toHaveLength(1));

    await del.result.current.mutateAsync(record.id);

    await waitFor(() => expect(list.result.current).toHaveLength(0));
    const stored = await db.defecationRecords.get(record.id);
    expect(stored?.deletedAt).not.toBeNull();
  });
});
