// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WindowFrame, type WindowFrameProps } from "@/components/shell/window-frame";
import type { Win } from "@/stores/window-store";

const meds: Win = { id: "w1", app: "meds", st: {}, z: 3, min: false, max: false, x: 16, y: 12, w: 720, h: 520 };

function setup(props: Partial<WindowFrameProps> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onHome: vi.fn(),
    onMinimise: vi.fn(),
    onToggleMax: vi.fn(),
    onFocus: vi.fn(),
  };
  const utils = render(
    <WindowFrame win={meds} index={1} total={1} phone visible focused {...handlers} {...props}>
      <p>Body content</p>
    </WindowFrame>,
  );
  return { ...utils, ...handlers };
}

describe("WindowFrame", () => {
  it("phone: a full-screen window with ← Home, the title and close", () => {
    const { onHome, onClose } = setup();
    const region = screen.getByRole("region", { name: "Medications" });
    expect(region).toHaveClass("absolute", "inset-0", "flex");
    expect(screen.getByText("Body content")).toBeInTheDocument();
    // No window counter with a single window, and no min/max on a phone.
    expect(screen.queryByLabelText(/Window 1 of/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Minimise/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to home" }));
    expect(onHome).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close Medications" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("phone: shows n/N when several windows are open", () => {
    setup({ index: 2, total: 3 });
    expect(screen.getByLabelText("Window 2 of 3")).toHaveTextContent("2/3");
  });

  it("moves focus to the title when it opens focused", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Medications" })).toHaveFocus();
  });

  it("stays mounted but hidden when not on screen", () => {
    setup({ visible: false, focused: false });
    const region = screen.getByRole("region", { hidden: true, name: "Medications" });
    expect(region).toHaveClass("hidden");
    expect(region).not.toHaveClass("flex");
    // Content is still in the DOM (queries and form state survive).
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("wide: positioned by its rect, with minimise, maximise and close", () => {
    const { onMinimise, onToggleMax, onClose } = setup({ phone: false, rect: { x: 8, y: 8, w: 400, h: 600 } });
    const region = screen.getByRole("region", { name: "Medications" });
    expect(region.style.left).toBe("8px");
    expect(region.style.width).toBe("400px");
    expect(region.style.zIndex).toBe("3");
    expect(screen.queryByRole("button", { name: "Back to home" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Minimise Medications" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximise Medications" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Medications" }));
    expect(onMinimise).toHaveBeenCalledTimes(1);
    expect(onToggleMax).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wide: offers Restore when maximised", () => {
    setup({ phone: false, win: { ...meds, max: true } });
    expect(screen.getByRole("button", { name: "Restore Medications" })).toBeInTheDocument();
  });

  it("wide: pressing in a background window focuses it", () => {
    const { onFocus } = setup({ phone: false, focused: false });
    fireEvent.pointerDown(screen.getByText("Body content"));
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("restores the body's scroll position when shown again", () => {
    const { rerender, ...h } = setup();
    const body = screen.getByTestId("window-body");
    body.scrollTop = 240;
    fireEvent.scroll(body);
    const props = { win: meds, index: 1, total: 1, phone: true, focused: true, ...h };
    rerender(
      <WindowFrame {...props} visible={false}>
        <p>Body content</p>
      </WindowFrame>,
    );
    body.scrollTop = 0; // display:none drops it in a real browser
    rerender(
      <WindowFrame {...props} visible>
        <p>Body content</p>
      </WindowFrame>,
    );
    expect(body.scrollTop).toBe(240);
  });
});
