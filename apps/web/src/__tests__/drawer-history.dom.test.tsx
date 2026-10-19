// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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
});
