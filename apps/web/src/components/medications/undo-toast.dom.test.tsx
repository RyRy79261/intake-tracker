// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { Toaster } from "@intake/ui/toaster";
import { showUndoToast, resetUndoToastForTests } from "@/components/medications/undo-toast";

afterEach(() => {
  resetUndoToastForTests();
});

describe("showUndoToast", () => {
  it("keeps an earlier action undoable when a second undo toast replaces it", () => {
    render(<Toaster />);
    const first = vi.fn();
    const second = vi.fn();
    act(() => {
      showUndoToast({ title: "A taken", onUndo: first });
    });
    act(() => {
      showUndoToast({ title: "B taken", onUndo: second });
    });

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("does not run an undo twice", () => {
    render(<Toaster />);
    const first = vi.fn();
    act(() => {
      showUndoToast({ title: "A taken", onUndo: first });
    });
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    const second = vi.fn();
    act(() => {
      showUndoToast({ title: "B taken", onUndo: second });
    });
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
