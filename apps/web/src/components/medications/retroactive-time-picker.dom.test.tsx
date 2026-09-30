// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { RetroactiveTimePicker } from "@/components/medications/retroactive-time-picker";

function renderPicker(props: Partial<Parameters<typeof RetroactiveTimePicker>[0]> = {}) {
  const onConfirm = vi.fn();
  const utils = render(
    <RetroactiveTimePicker
      open
      onOpenChange={() => {}}
      defaultTime="08:00"
      compoundName="Metoprolol"
      onConfirm={onConfirm}
      {...props}
    />,
  );
  const input = () => document.querySelector('input[type="time"]') as HTMLInputElement;
  return { ...utils, onConfirm, input };
}

describe("RetroactiveTimePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 25, 10, 14));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables Log Dose when the field is cleared", () => {
    const { input, onConfirm } = renderPicker();
    fireEvent.change(input(), { target: { value: "" } });

    const logBtn = screen.getByRole("button", { name: "Log Dose" });
    expect(logBtn).toBeDisabled();
    fireEvent.click(logBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("opens the meds scope: the sheet renders outside the Medications window", () => {
    renderPicker();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-domain", "meds");
    const logBtn = screen.getByRole("button", { name: "Log Dose" });
    expect(logBtn.className).toContain("bg-primary");
    expect(logBtn.closest("[data-domain]")).toBe(dialog);
  });

  it("rejects a time later than now when notAfterNow is set", () => {
    const { input, onConfirm } = renderPicker({ notAfterNow: true, defaultTime: "10:00" });
    expect(input().max).toBe("10:14");

    fireEvent.change(input(), { target: { value: "20:00" } });
    expect(screen.getByRole("button", { name: "Log Dose" })).toBeDisabled();

    fireEvent.change(input(), { target: { value: "07:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Log Dose" }));
    expect(onConfirm).toHaveBeenCalledWith("07:30");
  });

  it("allows any valid time without notAfterNow (past dates)", () => {
    const { input, onConfirm } = renderPicker();
    fireEvent.change(input(), { target: { value: "22:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Log Dose" }));
    expect(onConfirm).toHaveBeenCalledWith("22:30");
  });

  it("keeps the typed time when the parent re-renders with a new default while open", () => {
    const { input, rerender } = renderPicker({ defaultTime: "10:14" });
    fireEvent.change(input(), { target: { value: "07:30" } });

    rerender(
      <RetroactiveTimePicker
        open
        onOpenChange={() => {}}
        defaultTime="10:15"
        compoundName="Metoprolol"
        onConfirm={() => {}}
      />,
    );
    expect(input().value).toBe("07:30");
  });

  it("resets to the default when reopened", () => {
    const props = {
      onOpenChange: () => {},
      compoundName: "Metoprolol",
      onConfirm: () => {},
    };
    const { input, rerender } = renderPicker({ defaultTime: "08:00" });
    fireEvent.change(input(), { target: { value: "07:30" } });

    rerender(<RetroactiveTimePicker open={false} defaultTime="08:00" {...props} />);
    rerender(<RetroactiveTimePicker open defaultTime="09:00" {...props} />);
    expect(input().value).toBe("09:00");
  });
});
