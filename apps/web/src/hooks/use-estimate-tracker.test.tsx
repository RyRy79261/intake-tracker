// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import {
  estimateSeed,
  estimateTable,
  makeEstimateRecord,
} from "@/__tests__/fixtures/estimate-tracker-fixtures";
import { ESTIMATE_TRACKER_IDS } from "@/lib/estimate-trackers";
import {
  useEstimateRecords,
  useEstimateRecordsBetween,
  useAddEstimateRecord,
  useUpdateEstimateRecord,
  useDeleteEstimateRecord,
} from "@/hooks/use-estimate-tracker";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe.each(ESTIMATE_TRACKER_IDS)("estimate-tracker hooks (%s)", (tracker) => {
  const make = (overrides: Parameters<typeof makeEstimateRecord>[1]) => makeEstimateRecord(tracker, overrides);
  const seed = (...records: ReturnType<typeof make>[]) => seedDatabase(estimateSeed(tracker, records));

  describe("useEstimateRecords", () => {
    it("returns seeded records newest-first", async () => {
      await seed(
        make({ timestamp: 1000, amountEstimate: "small" }),
        make({ timestamp: 3000, amountEstimate: "large" }),
        make({ timestamp: 2000, amountEstimate: "medium" }),
      );

      const { result } = renderHook(() => useEstimateRecords(tracker), { wrapper });

      await waitFor(() => expect(result.current).toHaveLength(3));
      expect(result.current.map((r) => r.timestamp)).toEqual([3000, 2000, 1000]);
    });

    it("respects the limit argument", async () => {
      await seed(make({ timestamp: 1000 }), make({ timestamp: 2000 }), make({ timestamp: 3000 }));

      const { result } = renderHook(() => useEstimateRecords(tracker, 2), { wrapper });

      await waitFor(() => expect(result.current).toHaveLength(2));
      expect(result.current.map((r) => r.timestamp)).toEqual([3000, 2000]);
    });

    it("excludes soft-deleted records", async () => {
      await seed(make({ timestamp: 1000 }), make({ timestamp: 2000, deletedAt: Date.now() }));

      const { result } = renderHook(() => useEstimateRecords(tracker), { wrapper });

      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0]?.timestamp).toBe(1000);
    });
  });

  describe("useEstimateRecordsBetween", () => {
    it("returns only records inside the range", async () => {
      await seed(make({ timestamp: 500 }), make({ timestamp: 1500 }), make({ timestamp: 2500 }));

      const { result } = renderHook(() => useEstimateRecordsBetween(tracker, 1000, 2000), { wrapper });

      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0]?.timestamp).toBe(1500);
    });

    it("returns an empty array when start is not before end", async () => {
      await seed(make({ timestamp: 1500 }));

      const { result } = renderHook(() => useEstimateRecordsBetween(tracker, 2000, 1000), { wrapper });

      await waitFor(() => expect(result.current).toEqual([]));
    });
  });

  describe("useAddEstimateRecord", () => {
    it("writes a new record through to the database", async () => {
      const { result } = renderHook(() => useAddEstimateRecord(tracker), { wrapper });

      const created = await result.current.mutateAsync({
        timestamp: 9000,
        amountEstimate: "large",
        note: "after lunch",
      });

      const stored = await estimateTable(tracker).get(created.id);
      expect(stored).toBeDefined();
      expect(stored?.amountEstimate).toBe("large");
      expect(stored?.note).toBe("after lunch");
      expect(stored?.timestamp).toBe(9000);
    });

    it("makes the new record visible to the live query", async () => {
      const add = renderHook(() => useAddEstimateRecord(tracker), { wrapper });
      const list = renderHook(() => useEstimateRecords(tracker), { wrapper });

      await waitFor(() => expect(list.result.current).toEqual([]));

      await add.result.current.mutateAsync({ timestamp: 7000 });

      await waitFor(() => expect(list.result.current).toHaveLength(1));
      expect(list.result.current[0]?.timestamp).toBe(7000);
    });
  });

  describe("useUpdateEstimateRecord", () => {
    it("updates an existing record", async () => {
      const record = make({ amountEstimate: "small" });
      await seed(record);

      const { result } = renderHook(() => useUpdateEstimateRecord(tracker), { wrapper });
      await result.current.mutateAsync({
        id: record.id,
        updates: { amountEstimate: "large", note: "updated" },
      });

      const stored = await estimateTable(tracker).get(record.id);
      expect(stored?.amountEstimate).toBe("large");
      expect(stored?.note).toBe("updated");
    });

    it("rejects when the record does not exist", async () => {
      const { result } = renderHook(() => useUpdateEstimateRecord(tracker), { wrapper });
      await expect(result.current.mutateAsync({ id: "missing", updates: {} })).rejects.toThrow();
    });
  });

  describe("useDeleteEstimateRecord", () => {
    it("soft-deletes a record so the live query drops it", async () => {
      const record = make({ timestamp: 4000 });
      await seed(record);

      const del = renderHook(() => useDeleteEstimateRecord(tracker), { wrapper });
      const list = renderHook(() => useEstimateRecords(tracker), { wrapper });

      await waitFor(() => expect(list.result.current).toHaveLength(1));

      await del.result.current.mutateAsync(record.id);

      await waitFor(() => expect(list.result.current).toHaveLength(0));
      const stored = await estimateTable(tracker).get(record.id);
      expect(stored?.deletedAt).not.toBeNull();
    });
  });
});
