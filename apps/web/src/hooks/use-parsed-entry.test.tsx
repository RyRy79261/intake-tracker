// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLogParsedEntry } from "@/hooks/use-parsed-entry";
import { db } from "@/lib/db";

describe("useLogParsedEntry", () => {
  it("logs a meal and its nutrients as one group", async () => {
    const { result } = renderHook(() => useLogParsedEntry());
    await act(async () => {
      await result.current(
        { kind: "food", description: "toast", grams: 80, sodiumMg: 500 },
        { timestamp: 1_700_000_000_000, origin: "voice" },
      );
    });
    const [meal] = await db.eatingRecords.toArray();
    const [salt] = await db.intakeRecords.toArray();
    expect(meal?.groupId).toBeDefined();
    expect(salt).toMatchObject({ type: "salt", amount: 500, groupId: meal!.groupId });
  });

  it("reopens a severed database and still saves (issue #287)", async () => {
    const { result } = renderHook(() => useLogParsedEntry());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    db.close();
    await act(async () => {
      await result.current(
        { kind: "water", ml: 330 },
        { timestamp: 1_700_000_000_000, origin: "voice" },
      );
    });

    expect(await db.intakeRecords.count()).toBe(1);
    warn.mockRestore();
  });

  it("throws when the entry cannot be written", async () => {
    const { result } = renderHook(() => useLogParsedEntry());
    await expect(
      result.current(
        { kind: "alcohol", description: "beer", abvPercent: 5, volumeMl: 0 },
        { timestamp: 1_700_000_000_000, origin: "voice" },
      ),
    ).rejects.toThrow(/alcohol/);
  });
});
