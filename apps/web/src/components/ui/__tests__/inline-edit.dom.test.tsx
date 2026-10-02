// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(cleanup);
import { InlineEdit } from "@intake/ui/inline-edit";

function setup(className?: string) {
  const onValueChange = vi.fn();
  render(
    <InlineEdit
      value={null}
      onValueChange={onValueChange}
      formatDisplay={(v) => v?.toFixed(2) ?? "--"}
      suffix="kg"
      aria-label="Weight in kilograms"
      {...(className ? { className } : {})}
    />,
  );
  const input = screen.getByLabelText("Weight in kilograms");
  return { input, label: input.closest("label") as HTMLLabelElement, onValueChange };
}

describe("InlineEdit", () => {
  it("lets the host stretch the label so the whole box is the tap target", () => {
    const { label } = setup("h-full w-full justify-center");
    expect(label.className).toContain("h-full");
    expect(label.className).toContain("w-full");
    // The hidden input lives inside the label, so a tap anywhere on it focuses the input.
    expect(label.querySelector("input")).not.toBeNull();
  });

  it("draws a caret while editing, also when nothing is typed yet", () => {
    const { input } = setup();
    expect(screen.queryByTestId("inline-edit-caret")).toBeNull();
    fireEvent.focus(input);
    expect(screen.getByTestId("inline-edit-caret")).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.queryByTestId("inline-edit-caret")).toBeNull();
  });

  it("commits a typed value on Enter", () => {
    const { input, onValueChange } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "78.4" } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenCalledWith(78.4);
  });
});
