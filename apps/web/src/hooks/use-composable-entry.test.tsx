// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSyncEatingGroup,
  fetchEntryGroup,
  sodiumKindFromSource,
} from "@/hooks/use-composable-entry";
import { useDrink } from "@/hooks/use-drink";
import { db } from "@/lib/db";
import { addComposableEntry } from "@/lib/composable-entry-service";

// Capture the undo callbacks passed to the toast so tests can fire them.
const undoToastCalls: Array<{
  title: string;
  onUndo: () => Promise<void> | void;
}> = [];
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

describe("sodiumKindFromSource (re-export)", () => {
  it("parses the sodium kind embedded in a source tag", () => {
    expect(sodiumKindFromSource("manual:salt")).toBe("salt");
    expect(sodiumKindFromSource("manual:msg")).toBe("msg");
    expect(sodiumKindFromSource("manual:sodium")).toBe("sodium");
    expect(sodiumKindFromSource(undefined)).toBe("sodium");
  });
});

describe("useDrink().remove", () => {
  it("soft-deletes the whole drink and shows an undo toast", async () => {
    const drink = renderHook(() => useDrink());
    let logged!: { groupId: string; waterIntakeId: string };
    await act(async () => {
      logged = await drink.result.current.log({
        volumeMl: 250,
        description: "Juice",
        sugarG: 20,
        timestamp: 1_700_000_000_000,
      });
    });

    await act(async () => {
      await drink.result.current.remove(logged.waterIntakeId);
    });

    expect(await fetchEntryGroup(logged.groupId)).toEqual({
      groupId: logged.groupId,
      intakes: [],
      eatings: [],
      substances: [],
    });

    // The undo toast was shown with the correct pluralised title.
    expect(undoToastCalls).toHaveLength(1);
    expect(undoToastCalls[0]?.title).toBe("Deleted 2 linked records");

    // Firing the undo callback restores the drink.
    await act(async () => {
      await undoToastCalls[0]!.onUndo();
    });
    expect((await fetchEntryGroup(logged.groupId))?.intakes).toHaveLength(2);
  });
});

describe("useSyncEatingGroup", () => {
  it("creates a linked salt intake record for an eating record", async () => {
    const added = await addComposableEntry(
      { eating: { note: "lunch", grams: 200 } },
      1_700_000_000_000,
    );
    if (!added.success) throw new Error(added.error);
    const eatingId = added.data.eatingId!;

    const { result } = renderHook(() => useSyncEatingGroup());
    await act(async () => {
      await result.current(eatingId, {
        timestamp: 1_700_000_500_000,
        note: "lunch",
        grams: 200,
        sodiumMg: 640,
        sodiumKind: "salt",
        waterMl: 0,
        sugarG: 0,
        potassiumMg: 0,
      });
    });

    const eating = await db.eatingRecords.get(eatingId);
    expect(eating?.timestamp).toBe(1_700_000_500_000);

    const groupId = eating!.groupId!;
    const group = await fetchEntryGroup(groupId);
    const salt = group?.intakes.find((r) => r.type === "salt");
    expect(salt?.amount).toBe(640);
    expect(salt?.source).toBe("manual:salt");
  });
});

describe("undo failures are surfaced", () => {
  it("useDrink().remove shows an error toast when the restore fails", async () => {
    const { result } = renderHook(() => useDrink());
    await act(async () => {
      const logged = await result.current.log({
        volumeMl: 250,
        description: "Juice",
        sugarG: 20,
        timestamp: 1_700_000_000_000,
      });
      await result.current.remove(logged.waterIntakeId);
    });

    // Make the restore transaction fail.
    const spy = vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("blocked"));
    await act(async () => {
      await undoToastCalls[0]!.onUndo();
    });
    spy.mockRestore();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Could not restore", variant: "destructive" }),
    );
  });
});
