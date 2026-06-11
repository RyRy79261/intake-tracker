// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ManualInputDialog } from "@/components/manual-input-dialog";
import { renderWithProviders } from "@/__tests__/react-test-utils";

describe("ManualInputDialog", () => {
  it("renders water-specific title and unit when type is water", () => {
    renderWithProviders(
      <ManualInputDialog
        open={true}
        onOpenChange={vi.fn()}
        type="water"
        currentValue={0}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Enter Water Amount")).toBeInTheDocument();
    expect(screen.getByText(/exact amount in ml/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Amount (ml)")).toBeInTheDocument();
  });

  it("renders sodium-specific title and unit when type is salt", () => {
    renderWithProviders(
      <ManualInputDialog
        open={true}
        onOpenChange={vi.fn()}
        type="salt"
        currentValue={0}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Enter Sodium Amount")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount (mg)")).toBeInTheDocument();
  });

  it("submits the typed amount through onSubmit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ManualInputDialog
        open={true}
        onOpenChange={vi.fn()}
        type="water"
        currentValue={0}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByLabelText("Amount (ml)");
    await user.clear(input);
    await user.type(input, "750");
    await user.click(screen.getByRole("button", { name: "Add Entry" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toBe(750);
  });

  it("fills the input from a quick-select button", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ManualInputDialog
        open={true}
        onOpenChange={vi.fn()}
        type="water"
        currentValue={0}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "500ml" }));
    expect(screen.getByLabelText("Amount (ml)")).toHaveValue(500);

    await user.click(screen.getByRole("button", { name: "Add Entry" }));
    expect(onSubmit.mock.calls[0]![0]).toBe(500);
  });

  it("shows a validation error and does not submit when the amount is empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ManualInputDialog
        open={true}
        onOpenChange={vi.fn()}
        type="salt"
        currentValue={0}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByLabelText("Amount (mg)");
    await user.clear(input);
    // The Add Entry button is disabled for an empty value; dispatch a submit
    // event on the form directly to exercise the zod validation path.
    const form = input.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    // zod flags the missing amount; the error renders below the input.
    // zod 4: the schema's `error` message ("Amount is required") covers the
    // missing/undefined case too — zod 3 ignored `invalid_type_error` for
    // undefined and fell back to its default "Required" message.
    const error = await screen.findByText("Amount is required", {
      selector: "p.text-destructive",
    });
    expect(error).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <ManualInputDialog
        open={true}
        onOpenChange={onOpenChange}
        type="water"
        currentValue={250}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reveals the note field and includes the note in the submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ManualInputDialog
        open={true}
        onOpenChange={vi.fn()}
        type="water"
        currentValue={250}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Add a note/i }));
    await user.type(screen.getByLabelText(/Note \(optional\)/i), "after gym");
    await user.click(screen.getByRole("button", { name: "Add Entry" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toBe(250);
    expect(onSubmit.mock.calls[0]![2]).toBe("after gym");
  });
});
