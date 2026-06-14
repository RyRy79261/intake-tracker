// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEditRecord } from "@/hooks/use-edit-record";
import { timestampToDateTimeLocal } from "@/lib/date-utils";

// Mock the toast module so the hook's destructured `toast` is observable.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@intake/ui/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
  toast: toastSpy,
}));

interface TestRecord {
  id: string;
  timestamp: number;
  note?: string;
}

const RECORD: TestRecord = {
  id: "rec-1",
  timestamp: new Date("2026-01-15T08:30:00").getTime(),
  note: "morning entry",
};

describe("useEditRecord", () => {
  beforeEach(() => {
    toastSpy.mockClear();
  });

  it("starts with no record being edited", () => {
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({
        buildUpdates: () => ({}),
        mutateAsync: async () => {},
      }),
    );
    expect(result.current.editingRecord).toBeNull();
    expect(result.current.editTimestamp).toBe("");
    expect(result.current.editNote).toBe("");
  });

  it("openEdit populates common fields and invokes onOpen for extras", () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({
        onOpen,
        buildUpdates: () => ({}),
        mutateAsync: async () => {},
      }),
    );

    act(() => result.current.openEdit(RECORD));

    expect(result.current.editingRecord).toEqual(RECORD);
    expect(result.current.editTimestamp).toBe(
      timestampToDateTimeLocal(RECORD.timestamp),
    );
    expect(result.current.editNote).toBe("morning entry");
    expect(onOpen).toHaveBeenCalledWith(RECORD);
  });

  it("closeEdit clears the editing record", () => {
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({
        buildUpdates: () => ({}),
        mutateAsync: async () => {},
      }),
    );
    act(() => result.current.openEdit(RECORD));
    expect(result.current.editingRecord).not.toBeNull();

    act(() => result.current.closeEdit());
    expect(result.current.editingRecord).toBeNull();
  });

  it("handleEditSubmit calls mutateAsync with parsed timestamp + trimmed note, then closes", async () => {
    const mutateAsync = vi.fn(async () => {});
    const buildUpdates = vi.fn((ts: number, note: string | undefined) => ({
      timestamp: ts,
      note,
    }));
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({ buildUpdates, mutateAsync }),
    );

    act(() => result.current.openEdit(RECORD));
    act(() => result.current.setEditNote("  updated note  "));
    act(() => result.current.setEditTimestamp("2026-02-01T09:00"));

    await act(async () => {
      await result.current.handleEditSubmit();
    });

    const expectedTs = new Date("2026-02-01T09:00").getTime();
    expect(buildUpdates).toHaveBeenCalledWith(expectedTs, "updated note");
    expect(mutateAsync).toHaveBeenCalledWith({
      id: "rec-1",
      updates: { timestamp: expectedTs, note: "updated note" },
    });
    expect(result.current.editingRecord).toBeNull();
    expect(toastSpy).toHaveBeenCalledWith({ title: "Entry updated" });
  });

  it("handleEditSubmit passes undefined note when the field is blank", async () => {
    const buildUpdates = vi.fn(() => ({}));
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({
        buildUpdates,
        mutateAsync: async () => {},
      }),
    );

    const { note: _omitted, ...noteless } = RECORD;
    act(() => result.current.openEdit(noteless));
    act(() => result.current.setEditNote("   "));

    await act(async () => {
      await result.current.handleEditSubmit();
    });

    expect(buildUpdates).toHaveBeenCalledWith(expect.any(Number), undefined);
  });

  it("does not call mutateAsync when the timestamp cannot be parsed", async () => {
    const mutateAsync = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({ buildUpdates: () => ({}), mutateAsync }),
    );

    act(() => result.current.openEdit(RECORD));
    act(() => result.current.setEditTimestamp("not-a-date"));

    // dateTimeLocalToTimestamp throws on an unparseable value; the handler
    // catches it, surfaces the toast, and returns without rejecting.
    await act(async () => {
      await expect(result.current.handleEditSubmit()).resolves.toBeUndefined();
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Invalid date/time", variant: "destructive" }),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    // Dialog stays open so the user can correct the value.
    expect(result.current.editingRecord).not.toBeNull();
  });

  it("aborts silently when buildUpdates returns null", async () => {
    const mutateAsync = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({ buildUpdates: () => null, mutateAsync }),
    );

    act(() => result.current.openEdit(RECORD));
    await act(async () => {
      await result.current.handleEditSubmit();
    });

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(result.current.editingRecord).not.toBeNull();
  });

  it("shows an error toast and keeps the dialog open when the mutation throws", async () => {
    const mutateAsync = vi.fn(async () => {
      throw new Error("network down");
    });
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({ buildUpdates: () => ({}), mutateAsync }),
    );

    act(() => result.current.openEdit(RECORD));
    await act(async () => {
      await result.current.handleEditSubmit();
    });

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith({
        title: "Error",
        description: "Could not update the entry",
        variant: "destructive",
      });
    });
    expect(result.current.editingRecord).not.toBeNull();
  });

  it("does nothing when submitted with no record open", async () => {
    const mutateAsync = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({ buildUpdates: () => ({}), mutateAsync }),
    );

    await act(async () => {
      await result.current.handleEditSubmit();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("calls preventDefault on a supplied form event", async () => {
    const { result } = renderHook(() =>
      useEditRecord<TestRecord>({
        buildUpdates: () => ({}),
        mutateAsync: async () => {},
      }),
    );
    act(() => result.current.openEdit(RECORD));

    const preventDefault = vi.fn();
    await act(async () => {
      await result.current.handleEditSubmit({
        preventDefault,
      } as unknown as React.FormEvent);
    });
    expect(preventDefault).toHaveBeenCalled();
  });
});
