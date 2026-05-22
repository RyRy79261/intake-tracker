// @vitest-environment jsdom
import { ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { makeTestQueryClient } from "@/__tests__/react-test-utils";
import { seedDatabase } from "@/__tests__/fixtures/scenarios";
import { makeDailyNote } from "@/__tests__/fixtures/db-fixtures";
import { useDailyNotes, useAddDailyNote } from "./use-daily-notes-queries";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("useDailyNotes", () => {
  it("returns only notes for the requested date", async () => {
    await seedDatabase({
      dailyNotes: [
        makeDailyNote({ date: "2023-11-14", note: "today" }),
        makeDailyNote({ date: "2023-11-15", note: "tomorrow" }),
      ],
    });

    const { result } = renderHook(() => useDailyNotes("2023-11-14"), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.note).toBe("today");
  });

  it("filters by prescriptionId when provided", async () => {
    await seedDatabase({
      dailyNotes: [
        makeDailyNote({ date: "2023-11-14", prescriptionId: "rx-1", note: "a" }),
        makeDailyNote({ date: "2023-11-14", prescriptionId: "rx-2", note: "b" }),
        makeDailyNote({ date: "2023-11-14", note: "no-rx" }),
      ],
    });

    const { result } = renderHook(
      () => useDailyNotes("2023-11-14", "rx-1"),
      { wrapper },
    );

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.note).toBe("a");
  });

  it("returns an empty array when no notes match the date", async () => {
    await seedDatabase({
      dailyNotes: [makeDailyNote({ date: "2023-11-14" })],
    });

    const { result } = renderHook(() => useDailyNotes("2099-01-01"), {
      wrapper,
    });

    await waitFor(() => expect(result.current).toEqual([]));
  });
});

describe("useAddDailyNote", () => {
  it("writes a new note through to the database", async () => {
    const { result } = renderHook(() => useAddDailyNote(), { wrapper });

    const created = await result.current.mutateAsync({
      date: "2023-11-14",
      note: "felt good",
    });

    const stored = await db.dailyNotes.get(created.id);
    expect(stored).toBeDefined();
    expect(stored?.note).toBe("felt good");
    expect(stored?.date).toBe("2023-11-14");
    expect(stored?.deletedAt).toBeNull();
  });

  it("persists optional prescriptionId and doseLogId", async () => {
    const { result } = renderHook(() => useAddDailyNote(), { wrapper });

    const created = await result.current.mutateAsync({
      date: "2023-11-14",
      prescriptionId: "rx-9",
      doseLogId: "dose-9",
      note: "linked note",
    });

    const stored = await db.dailyNotes.get(created.id);
    expect(stored?.prescriptionId).toBe("rx-9");
    expect(stored?.doseLogId).toBe("dose-9");
  });

  it("makes the new note visible to the live query", async () => {
    const add = renderHook(() => useAddDailyNote(), { wrapper });
    const list = renderHook(() => useDailyNotes("2023-11-14"), { wrapper });

    await waitFor(() => expect(list.result.current).toEqual([]));

    await add.result.current.mutateAsync({
      date: "2023-11-14",
      note: "reactive",
    });

    await waitFor(() => expect(list.result.current).toHaveLength(1));
    expect(list.result.current[0]?.note).toBe("reactive");
  });
});
