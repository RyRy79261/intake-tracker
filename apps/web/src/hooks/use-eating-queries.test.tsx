// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import { makeEatingRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  useEatingRecords,
  useEatingRecordsByDateRange,
  useAddEating,
  useUpdateEating,
  useDeleteEating,
} from "@/hooks/use-eating-queries";
import { addComposableEntry } from "@/lib/composable-entry-service";

// Capture the undo callbacks passed to the toast so tests can fire them.
const undoToastCalls: Array<{ title: string; onUndo: () => Promise<void> | void }> = [];
vi.mock("@/components/medications/undo-toast", () => ({
  showUndoToast: (opts: { title: string; onUndo: () => Promise<void> | void }) => {
    undoToastCalls.push(opts);
  },
}));
const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@intake/ui/use-toast", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toast: toastMock,
}));

beforeEach(() => {
  undoToastCalls.length = 0;
  toastMock.mockClear();
});

const HOUR = 3_600_000;
const DAY = 86_400_000;

function makeWrapper() {
  const client = makeTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("use-eating-queries read hooks", () => {
  it("useEatingRecords returns non-deleted records newest-first capped by limit", async () => {
    const base = 1_900_000_000_000;
    await seedDatabase({
      eatingRecords: [
        makeEatingRecord({ grams: 100, timestamp: base + HOUR }),
        makeEatingRecord({ grams: 200, timestamp: base + 2 * HOUR }),
        makeEatingRecord({ grams: 300, timestamp: base + 3 * HOUR }),
        // Soft-deleted — must be excluded.
        makeEatingRecord({ grams: 999, timestamp: base + 4 * HOUR, deletedAt: base }),
      ],
    });

    const { result } = renderHook(() => useEatingRecords(2), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((r) => r.grams)).toEqual([300, 200]);
  });

  it("useEatingRecordsByDateRange filters records to the time window", async () => {
    const base = 1_900_000_000_000;
    await seedDatabase({
      eatingRecords: [
        makeEatingRecord({ grams: 150, timestamp: base + HOUR }),
        makeEatingRecord({ grams: 250, timestamp: base + 10 * DAY }),
      ],
    });

    const { result } = renderHook(
      () => useEatingRecordsByDateRange(base, base + DAY),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.grams).toBe(150);
  });

  it("useEatingRecordsByDateRange returns empty when start is not before end", async () => {
    const base = 1_900_000_000_000;
    await seedDatabase({
      eatingRecords: [makeEatingRecord({ grams: 150, timestamp: base })],
    });

    const { result } = renderHook(
      () => useEatingRecordsByDateRange(base + DAY, base),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current).toEqual([]));
  });
});

describe("use-eating-queries mutation hooks", () => {
  it("useAddEating writes an eating record to the database", async () => {
    const { result } = renderHook(() => useAddEating(), {
      wrapper: makeWrapper(),
    });

    const record = await result.current.mutateAsync({
      grams: 175,
      note: "Lunch",
    });

    const stored = await db.eatingRecords.get(record.id);
    expect(stored?.grams).toBe(175);
    expect(stored?.note).toBe("Lunch");
    expect(stored?.deletedAt).toBeNull();
  });

  it("useUpdateEating changes the stored record", async () => {
    const existing = makeEatingRecord({ grams: 100 });
    await seedDatabase({ eatingRecords: [existing] });

    const { result } = renderHook(() => useUpdateEating(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync({
      id: existing.id,
      updates: { grams: 420 },
    });

    const stored = await db.eatingRecords.get(existing.id);
    expect(stored?.grams).toBe(420);
  });

  it("useDeleteEating soft-deletes and the live query drops it", async () => {
    const existing = makeEatingRecord({ grams: 200 });
    await seedDatabase({ eatingRecords: [existing] });

    const list = renderHook(() => useEatingRecords(10), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(list.result.current).toHaveLength(1));

    const del = renderHook(() => useDeleteEating(), { wrapper: makeWrapper() });
    await del.result.current.mutateAsync(existing.id);

    await waitFor(() => expect(list.result.current).toHaveLength(0));
    const stored = await db.eatingRecords.get(existing.id);
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("useDeleteEating takes the meal's linked rows, and Undo brings them back", async () => {
    const created = await addComposableEntry({
      eating: { note: "Pizza" },
      intakes: [
        { type: "salt", amount: 1200, source: "manual:sodium" },
        { type: "water", amount: 150, source: "manual:food_water_content" },
      ],
    });
    if (!created.success) throw new Error("add failed");

    const del = renderHook(() => useDeleteEating(), { wrapper: makeWrapper() });
    await del.result.current.mutateAsync(created.data.eatingId!);

    const live = async () =>
      (await db.intakeRecords.toArray()).filter((r) => r.deletedAt === null);
    expect(await live()).toHaveLength(0);

    await waitFor(() => expect(undoToastCalls).toHaveLength(1));
    await undoToastCalls[0]!.onUndo();
    await waitFor(async () => expect(await live()).toHaveLength(2));
    expect((await db.eatingRecords.get(created.data.eatingId!))!.deletedAt).toBeNull();
  });

  it("useDeleteEating surfaces a failed Undo instead of swallowing it", async () => {
    const existing = makeEatingRecord({ grams: 200 });
    await seedDatabase({ eatingRecords: [existing] });

    const del = renderHook(() => useDeleteEating(), { wrapper: makeWrapper() });
    await del.result.current.mutateAsync(existing.id);
    await waitFor(() => expect(undoToastCalls).toHaveLength(1));

    // The row vanishes before the user taps Undo, so the restore fails.
    await db.eatingRecords.delete(existing.id);
    await undoToastCalls[0]!.onUndo();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
  });

  it("useUpdateEating moves the meal's linked rows with it and can clear the note", async () => {
    const created = await addComposableEntry(
      {
        eating: { note: "Dinner" },
        intakes: [{ type: "salt", amount: 1400, source: "manual:sodium" }],
      },
      1_900_000_000_000,
    );
    if (!created.success) throw new Error("add failed");

    const { result } = renderHook(() => useUpdateEating(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      id: created.data.eatingId!,
      updates: { timestamp: 1_899_990_000_000, note: undefined },
    });

    const eating = await db.eatingRecords.get(created.data.eatingId!);
    expect(eating?.timestamp).toBe(1_899_990_000_000);
    expect(eating?.note).toBeUndefined();
    const salt = await db.intakeRecords.get(created.data.intakeIds[0]!);
    expect(salt?.timestamp).toBe(1_899_990_000_000);
  });
});
