// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  useIntakeTotal,
  useDailyIntakeTotal,
  useRecentIntakeRecords,
  useIntakeRecordsByDateRange,
  useSaltTotalsByGroupIds,
  useAddIntake,
  useUpdateIntake,
  useDeleteIntake,
  useIntake,
} from "@/hooks/use-intake-queries";

const HOUR = 3_600_000;
const DAY = 86_400_000;

function makeWrapper() {
  const client = makeTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("use-intake-queries read hooks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("useIntakeTotal sums non-deleted records of a type within 24h", async () => {
    const now = Date.now();
    await seedDatabase({
      intakeRecords: [
        makeIntakeRecord({ type: "water", amount: 250, timestamp: now - HOUR }),
        makeIntakeRecord({ type: "water", amount: 500, timestamp: now - 2 * HOUR }),
        makeIntakeRecord({ type: "salt", amount: 999, timestamp: now - HOUR }),
        // Outside the 24h window — must be excluded.
        makeIntakeRecord({ type: "water", amount: 9999, timestamp: now - 2 * DAY }),
        // Soft-deleted — must be excluded.
        makeIntakeRecord({
          type: "water",
          amount: 7777,
          timestamp: now - HOUR,
          deletedAt: now,
        }),
      ],
    });

    const { result } = renderHook(() => useIntakeTotal("water"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(750));
  });

  it("useDailyIntakeTotal counts only records since the configured day start", async () => {
    // Pin the clock to local midday so a record "1 hour ago" is unambiguously
    // within the current day-start window (default day start is 2am). Without
    // this, the test is wall-clock flaky: when it runs between the day-start
    // hour and one hour after it (e.g. ~02:05 local, which is when CI's
    // UTC+2 timezone jobs run), "now - 1h" falls *before* the 2am day start
    // and the record is correctly excluded — yielding 0 instead of 1000.
    // Only Date is faked so fake-indexeddb transactions and waitFor's
    // real-timer polling keep working.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 2, 12, 0, 0));
    const now = Date.now();
    await seedDatabase({
      intakeRecords: [
        makeIntakeRecord({ type: "salt", amount: 1000, timestamp: now - HOUR }),
        // 3 days ago — before any plausible day start.
        makeIntakeRecord({ type: "salt", amount: 5000, timestamp: now - 3 * DAY }),
      ],
    });

    const { result } = renderHook(() => useDailyIntakeTotal("salt"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(1000));
  });

  it("useRecentIntakeRecords returns the 3 newest records, newest first", async () => {
    const now = Date.now();
    await seedDatabase({
      intakeRecords: [
        makeIntakeRecord({ type: "water", amount: 100, timestamp: now - 4 * HOUR }),
        makeIntakeRecord({ type: "water", amount: 200, timestamp: now - 3 * HOUR }),
        makeIntakeRecord({ type: "water", amount: 300, timestamp: now - 2 * HOUR }),
        makeIntakeRecord({ type: "water", amount: 400, timestamp: now - HOUR }),
      ],
    });

    const { result } = renderHook(() => useRecentIntakeRecords("water"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toHaveLength(3));
    expect(result.current.map((r) => r.amount)).toEqual([400, 300, 200]);
  });

  it("useIntakeRecordsByDateRange filters by time window and type", async () => {
    const base = 2_000_000_000_000;
    await seedDatabase({
      intakeRecords: [
        makeIntakeRecord({ type: "water", amount: 250, timestamp: base + HOUR }),
        makeIntakeRecord({ type: "salt", amount: 5, timestamp: base + 2 * HOUR }),
        makeIntakeRecord({ type: "water", amount: 999, timestamp: base + 10 * DAY }),
      ],
    });

    const { result } = renderHook(
      () => useIntakeRecordsByDateRange(base, base + DAY, "water"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]!.amount).toBe(250);
  });

  it("useSaltTotalsByGroupIds aggregates salt amounts keyed by groupId", async () => {
    await seedDatabase({
      intakeRecords: [
        makeIntakeRecord({ type: "salt", amount: 3, groupId: "g1" }),
        makeIntakeRecord({ type: "salt", amount: 4, groupId: "g1" }),
        makeIntakeRecord({ type: "salt", amount: 10, groupId: "g2" }),
        // Water in g1 — must not count toward salt totals.
        makeIntakeRecord({ type: "water", amount: 250, groupId: "g1" }),
      ],
    });

    const { result } = renderHook(
      () => useSaltTotalsByGroupIds(["g1", "g2"]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.get("g1")).toBe(7));
    expect(result.current.get("g2")).toBe(10);
  });
});

describe("use-intake-queries mutation hooks", () => {
  it("useAddIntake writes a record through to the database", async () => {
    const { result } = renderHook(() => useAddIntake(), {
      wrapper: makeWrapper(),
    });

    const record = await result.current.mutateAsync({
      type: "water",
      amount: 333,
    });

    const stored = await db.intakeRecords.get(record.id);
    expect(stored?.amount).toBe(333);
    expect(stored?.type).toBe("water");
    expect(stored?.deletedAt).toBeNull();
  });

  it("useAddIntake reopens a severed database and still saves (issue #287)", async () => {
    const { result } = renderHook(() => useAddIntake(), {
      wrapper: makeWrapper(),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // After close() Dexie rejects every operation with DatabaseClosedError
    // until open() is called — the state a severed connection leaves behind.
    db.close();
    const record = await result.current.mutateAsync({
      type: "water",
      amount: 250,
    });

    expect((await db.intakeRecords.get(record.id))?.amount).toBe(250);
    warn.mockRestore();
  });

  it("useUpdateIntake reopens a severed database and still saves", async () => {
    const existing = makeIntakeRecord({ type: "water", amount: 100 });
    await seedDatabase({ intakeRecords: [existing] });
    const { result } = renderHook(() => useUpdateIntake(), {
      wrapper: makeWrapper(),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    db.close();
    await result.current.mutateAsync({ id: existing.id, updates: { amount: 150 } });

    expect((await db.intakeRecords.get(existing.id))?.amount).toBe(150);
    warn.mockRestore();
  });

  it("useUpdateIntake mutates an existing record in the database", async () => {
    const existing = makeIntakeRecord({ type: "salt", amount: 5 });
    await seedDatabase({ intakeRecords: [existing] });

    const { result } = renderHook(() => useUpdateIntake(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync({
      id: existing.id,
      updates: { amount: 12 },
    });

    const stored = await db.intakeRecords.get(existing.id);
    expect(stored?.amount).toBe(12);
  });

  it("useDeleteIntake soft-deletes the record", async () => {
    const existing = makeIntakeRecord({ type: "water", amount: 250 });
    await seedDatabase({ intakeRecords: [existing] });

    const { result } = renderHook(() => useDeleteIntake(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync(existing.id);

    const stored = await db.intakeRecords.get(existing.id);
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("useIntake reflects an added record in its live totals", async () => {
    const { result } = renderHook(() => useIntake("water"), {
      wrapper: makeWrapper(),
    });

    expect(result.current.dailyTotal).toBe(0);
    await waitFor(() => expect(result.current.rollingTotal).toBe(0));

    // The record is stamped after the live queries first ran, so its
    // timestamp is past any "now" end bound those queries captured; they
    // must still observe it (a closed range would not be re-notified).
    await new Promise((r) => setTimeout(r, 20));
    await result.current.addRecord(250);

    await waitFor(() => expect(result.current.dailyTotal).toBe(250));
    expect(result.current.rollingTotal).toBe(250);
  });
});
