// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useEntryGroup,
  useAddComposableEntry,
  useDeleteEntryGroup,
  useDeleteSingleGroupRecord,
  useSyncEatingGroup,
  fetchEntryGroup,
  sodiumKindFromSource,
} from "@/hooks/use-composable-entry";
import { db } from "@/lib/db";

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

beforeEach(() => {
  undoToastCalls.length = 0;
});

describe("sodiumKindFromSource (re-export)", () => {
  it("parses the sodium kind embedded in a source tag", () => {
    expect(sodiumKindFromSource("manual:salt")).toBe("salt");
    expect(sodiumKindFromSource("manual:msg")).toBe("msg");
    expect(sodiumKindFromSource("manual:sodium")).toBe("sodium");
    expect(sodiumKindFromSource(undefined)).toBe("sodium");
  });
});

describe("useAddComposableEntry", () => {
  it("creates linked eating + intake records sharing one groupId", async () => {
    const { result } = renderHook(() => useAddComposableEntry());

    let created!: Awaited<ReturnType<typeof result.current>>;
    await act(async () => {
      created = await result.current(
        {
          eating: { note: "toast", grams: 80 },
          intakes: [{ type: "salt", amount: 500 }],
        },
        1_700_000_000_000,
      );
    });

    expect(created.eatingId).toBeDefined();
    expect(created.intakeIds).toHaveLength(1);

    const group = await fetchEntryGroup(created.groupId);
    expect(group?.eatings).toHaveLength(1);
    expect(group?.intakes).toHaveLength(1);
    expect(group?.eatings[0]?.groupId).toBe(created.groupId);
    expect(group?.intakes[0]?.amount).toBe(500);
  });
});

describe("useEntryGroup", () => {
  it("returns null for an undefined groupId", async () => {
    const { result } = renderHook(() => useEntryGroup(undefined));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("reactively returns the records belonging to a group", async () => {
    const add = renderHook(() => useAddComposableEntry());
    let groupId!: string;
    await act(async () => {
      groupId = (
        await add.result.current(
          { intakes: [{ type: "water", amount: 250 }] },
          1_700_000_000_000,
        )
      ).groupId;
    });

    const { result } = renderHook(() => useEntryGroup(groupId));
    await waitFor(() => {
      expect(result.current?.intakes).toHaveLength(1);
    });
    expect(result.current?.intakes[0]?.amount).toBe(250);
  });
});

describe("useDeleteEntryGroup", () => {
  it("soft-deletes every record in the group and shows an undo toast", async () => {
    const add = renderHook(() => useAddComposableEntry());
    let groupId!: string;
    await act(async () => {
      groupId = (
        await add.result.current(
          {
            eating: { note: "meal" },
            intakes: [{ type: "salt", amount: 300 }],
          },
          1_700_000_000_000,
        )
      ).groupId;
    });

    const { result } = renderHook(() => useDeleteEntryGroup());
    let deleted!: { deletedCount: number };
    await act(async () => {
      deleted = await result.current(groupId);
    });

    expect(deleted.deletedCount).toBe(2);
    expect(await fetchEntryGroup(groupId)).toEqual({
      groupId,
      intakes: [],
      eatings: [],
      substances: [],
    });

    // The undo toast was shown with the correct pluralised title.
    expect(undoToastCalls).toHaveLength(1);
    expect(undoToastCalls[0]?.title).toBe("Deleted 2 linked records");

    // Firing the undo callback restores the group.
    await act(async () => {
      await undoToastCalls[0]!.onUndo();
    });
    const restored = await fetchEntryGroup(groupId);
    expect(restored?.eatings).toHaveLength(1);
    expect(restored?.intakes).toHaveLength(1);
  });
});

describe("useDeleteSingleGroupRecord", () => {
  it("deletes one record, leaves siblings intact, and undo restores it", async () => {
    const add = renderHook(() => useAddComposableEntry());
    let groupId!: string;
    let intakeId!: string;
    await act(async () => {
      const res = await add.result.current(
        {
          eating: { note: "meal" },
          intakes: [{ type: "salt", amount: 300 }],
        },
        1_700_000_000_000,
      );
      groupId = res.groupId;
      intakeId = res.intakeIds[0]!;
    });

    const { result } = renderHook(() => useDeleteSingleGroupRecord());
    await act(async () => {
      await result.current("intakeRecords", intakeId);
    });

    const group = await fetchEntryGroup(groupId);
    expect(group?.intakes).toHaveLength(0);
    // Sibling eating record is untouched.
    expect(group?.eatings).toHaveLength(1);

    expect(undoToastCalls).toHaveLength(1);
    expect(undoToastCalls[0]?.title).toBe("Record deleted");

    await act(async () => {
      await undoToastCalls[0]!.onUndo();
    });
    expect((await fetchEntryGroup(groupId))?.intakes).toHaveLength(1);
  });
});

describe("useSyncEatingGroup", () => {
  it("creates a linked salt intake record for an eating record", async () => {
    const add = renderHook(() => useAddComposableEntry());
    let eatingId!: string;
    await act(async () => {
      eatingId = (
        await add.result.current(
          { eating: { note: "lunch", grams: 200 } },
          1_700_000_000_000,
        )
      ).eatingId!;
    });

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
