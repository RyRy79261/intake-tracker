// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { Drawer, DrawerContent, DrawerTitle } from "@intake/ui/drawer";

/**
 * A drawer pushes a history entry so Back closes it. A sheet opened over a
 * drawer (the time-taken sheet over "Mark all doses") pushes a second one.
 * Closing both at once must step back over exactly those two entries, and
 * each entry keeps the screen's own state (the window tags).
 */
function Two({ outer, inner }: { outer: boolean; inner: boolean }) {
  return (
    <>
      <Drawer open={outer} onOpenChange={() => {}}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle>Outer</DrawerTitle>
        </DrawerContent>
      </Drawer>
      <Drawer open={inner} onOpenChange={() => {}}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle>Inner</DrawerTitle>
        </DrawerContent>
      </Drawer>
    </>
  );
}

describe("Drawer history", () => {
  it("keeps the entry's state and steps back over both entries when both close", async () => {
    window.history.replaceState({ wardWin: "w1", wardSeq: 7 }, "");
    const start = window.history.length;
    const { rerender } = render(<Two outer={false} inner={false} />);

    rerender(<Two outer inner={false} />);
    rerender(<Two outer inner />);
    expect(window.history.length).toBe(start + 2);
    expect(window.history.state).toMatchObject({ wardWin: "w1", wardSeq: 7 });

    // The inner sheet closes, then the outer drawer, in the same moment.
    act(() => rerender(<Two outer inner={false} />));
    act(() => rerender(<Two outer={false} inner={false} />));

    await waitFor(() => expect(window.history.state?.drawerId).toBeUndefined());
    expect(window.history.state).toMatchObject({ wardWin: "w1", wardSeq: 7 });
  });

  it("three stacked: closing the top sheet leaves the two under it open, and Back closes them one at a time", async () => {
    window.history.replaceState({ wardWin: "w1" }, "");
    const closeModal = vi.fn();
    const closeDialog = vi.fn();
    const Three = ({ modal, dialog, sheet }: { modal: boolean; dialog: boolean; sheet: boolean }) => (
      <>
        <Drawer open={modal} onOpenChange={(o) => !o && closeModal()}>
          <DrawerContent aria-describedby={undefined}>
            <DrawerTitle>Modal</DrawerTitle>
          </DrawerContent>
        </Drawer>
        <Drawer open={dialog} onOpenChange={(o) => !o && closeDialog()}>
          <DrawerContent aria-describedby={undefined}>
            <DrawerTitle>Dialog</DrawerTitle>
          </DrawerContent>
        </Drawer>
        <Drawer open={sheet} onOpenChange={() => {}}>
          <DrawerContent aria-describedby={undefined}>
            <DrawerTitle>Sheet</DrawerTitle>
          </DrawerContent>
        </Drawer>
      </>
    );
    const { rerender } = render(<Three modal={false} dialog={false} sheet={false} />);
    rerender(<Three modal dialog={false} sheet={false} />);
    rerender(<Three modal dialog sheet={false} />);
    rerender(<Three modal dialog sheet />);
    expect(window.history.state?.drawerDepth).toBe(3);

    // Cancel on the sheet: it steps back to the dialog's entry.
    act(() => rerender(<Three modal dialog sheet={false} />));
    await waitFor(() => expect(window.history.state?.drawerDepth).toBe(2));
    expect(closeModal).not.toHaveBeenCalled();
    expect(closeDialog).not.toHaveBeenCalled();

    // Back closes the dialog only.
    act(() => window.history.back());
    await waitFor(() => expect(closeDialog).toHaveBeenCalledTimes(1));
    expect(window.history.state?.drawerDepth).toBe(1);
    expect(closeModal).not.toHaveBeenCalled();
    rerender(<Three modal dialog={false} sheet={false} />);

    // The next Back closes the modal, with no entry left over.
    act(() => window.history.back());
    await waitFor(() => expect(closeModal).toHaveBeenCalledTimes(1));
    expect(window.history.state?.drawerId).toBeUndefined();
    expect(window.history.state).toMatchObject({ wardWin: "w1" });
  });
});
