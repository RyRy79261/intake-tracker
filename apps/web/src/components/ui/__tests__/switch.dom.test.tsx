// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Switch } from "@intake/ui/switch";

describe("Switch", () => {
  it("keeps a 44x44 touch target around the compact 38x22 track", () => {
    render(<Switch aria-label="Reminders" />);

    const classes = screen
      .getByRole("switch", { name: "Reminders" })
      .className.split(/\s+/);

    // Visible track stays compact...
    expect(classes).toEqual(expect.arrayContaining(["h-[22px]", "w-[38px]"]));
    // ...while a centred, absolutely positioned ::before expands the hit
    // area to 44x44 (size-11) without shifting layout.
    expect(classes).toEqual(
      expect.arrayContaining([
        "relative",
        "before:absolute",
        "before:size-11",
        "before:left-1/2",
        "before:top-1/2",
        "before:-translate-x-1/2",
        "before:-translate-y-1/2",
      ]),
    );
  });
});
