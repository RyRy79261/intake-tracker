// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLogDrink } from "@/hooks/use-drink-log";
import { db } from "@/lib/db";

describe("useLogDrink", () => {
  it("reopens a severed database and still saves (issue #287)", async () => {
    const { result } = renderHook(() => useLogDrink());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // After close() Dexie rejects every operation with DatabaseClosedError
    // until open() is called — the state a severed connection leaves behind.
    db.close();
    await result.current({ volumeMl: 250, description: "Latte", caffeineMg: 80 });

    const water = await db.intakeRecords.where("type").equals("water").toArray();
    expect(water.map((r) => r.amount)).toEqual([250]);
    warn.mockRestore();
  });
});
