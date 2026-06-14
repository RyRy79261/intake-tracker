// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDeleteWithToast } from "@/hooks/use-delete-with-toast";

// Mock the toast module so the hook's destructured `toast` is observable.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@intake/ui/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
  toast: toastSpy,
}));

describe("useDeleteWithToast", () => {
  beforeEach(() => {
    toastSpy.mockClear();
  });

  it("starts with no row marked as deleting", () => {
    const { result } = renderHook(() =>
      useDeleteWithToast({ mutateAsync: async () => {} }, "Removed"),
    );
    expect(result.current.deletingId).toBeNull();
  });

  it("calls mutateAsync with the id and shows a success toast", async () => {
    const mutateAsync = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useDeleteWithToast({ mutateAsync }, "Water entry removed"),
    );

    await act(async () => {
      await result.current.handleDelete("row-9");
    });

    expect(mutateAsync).toHaveBeenCalledWith("row-9");
    expect(toastSpy).toHaveBeenCalledWith({
      title: "Entry deleted",
      description: "Water entry removed",
    });
    // deletingId is cleared in the finally block.
    expect(result.current.deletingId).toBeNull();
  });

  it("marks the row as deleting while the mutation is in flight", async () => {
    let resolve!: () => void;
    const mutateAsync = vi.fn(
      () => new Promise<void>((r) => (resolve = r)),
    );
    const { result } = renderHook(() =>
      useDeleteWithToast({ mutateAsync }, "Removed"),
    );

    let pending: Promise<void>;
    act(() => {
      pending = result.current.handleDelete("row-3");
    });

    // While the promise is unresolved the row is flagged.
    await waitFor(() => {
      expect(result.current.deletingId).toBe("row-3");
    });

    await act(async () => {
      resolve();
      await pending;
    });
    expect(result.current.deletingId).toBeNull();
  });

  it("shows a destructive error toast when the mutation fails", async () => {
    const mutateAsync = vi.fn(async () => {
      throw new Error("db locked");
    });
    const { result } = renderHook(() =>
      useDeleteWithToast({ mutateAsync }, "Removed"),
    );

    await act(async () => {
      await result.current.handleDelete("row-x");
    });

    expect(toastSpy).toHaveBeenCalledWith({
      title: "Error",
      description: "Could not delete the entry",
      variant: "destructive",
    });
    // Even on failure the deleting flag is cleared.
    expect(result.current.deletingId).toBeNull();
  });
});
