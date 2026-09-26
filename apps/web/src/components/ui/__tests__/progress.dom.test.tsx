// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress, progressStatusTextClass } from "@intake/ui/progress";

describe("Progress", () => {
  it("exposes its value to assistive tech instead of reading as indeterminate", () => {
    render(<Progress value={40} aria-label="Water intake progress" />);

    const bar = screen.getByRole("progressbar", { name: "Water intake progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).not.toHaveAttribute("data-state", "indeterminate");
  });

  it("announces primary + extended in two-stage mode", () => {
    render(
      <Progress value={75} extendedValue={15} aria-label="Sodium intake progress" />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "90");
  });

  it("clamps the announced value to 0..100", () => {
    render(<Progress value={140} aria-label="Over" />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("progressStatusTextClass", () => {
  it("maps each status to one colour set, falling back to the caller's neutral class", () => {
    expect(progressStatusTextClass("ok", "text-sky-700")).toBe("text-sky-700");
    expect(progressStatusTextClass("extended", "text-sky-700")).toMatch(/orange/);
    expect(progressStatusTextClass("over", "text-sky-700")).toMatch(/red/);
  });
});
