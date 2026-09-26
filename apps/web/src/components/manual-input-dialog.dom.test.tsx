// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("uses the title, description and submit label overrides", () => {
    renderWithProviders(
      <ManualInputDialog
        open={true}
        onOpenChange={vi.fn()}
        type="water"
        currentValue={250}
        onSubmit={vi.fn()}
        title="Enter Beverage Amount"
        description="Set the amount, then log it."
        submitLabel="Set Amount"
      />,
    );

    expect(screen.getByText("Enter Beverage Amount")).toBeInTheDocument();
    expect(screen.getByText("Set the amount, then log it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Amount" })).toBeInTheDocument();
  });

  it("parses scientific notation instead of truncating it ('1e3' is 1000, not 1)", async () => {
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

    const input = screen.getByLabelText("Amount (ml)");
    fireEvent.change(input, { target: { value: "1e3" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toBe(1000);
  });

  it("rejects a non-integer amount with a field error instead of truncating", async () => {
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

    const input = screen.getByLabelText("Amount (ml)");
    fireEvent.change(input, { target: { value: "250.7" } });
    fireEvent.submit(input.closest("form")!);

    expect(
      await screen.findByText("Amount must be a whole number", {
        selector: "p.text-destructive",
      }),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables Add Entry and shows an error when the custom time is cleared", async () => {
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

    await user.click(screen.getByRole("button", { name: /Set different time/i }));
    const time = screen.getByLabelText(/When did this happen/i);
    // Mobile pickers' "Clear" action sets the value to "".
    fireEvent.change(time, { target: { value: "" } });

    expect(screen.getByRole("button", { name: "Add Entry" })).toBeDisabled();
    expect(screen.getByText("Enter a valid date and time")).toBeInTheDocument();

    // A forced submit still goes through validation rather than throwing.
    fireEvent.submit(time.closest("form")!);
    await waitFor(() =>
      expect(screen.getByLabelText(/When did this happen/i)).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a custom time in the future", async () => {
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

    await user.click(screen.getByRole("button", { name: /Set different time/i }));
    const nextYear = new Date().getFullYear() + 1;
    fireEvent.change(screen.getByLabelText(/When did this happen/i), {
      target: { value: `${nextYear}-01-01T08:00` },
    });

    expect(screen.getByRole("button", { name: "Add Entry" })).toBeDisabled();
    expect(screen.getByText("Time can't be in the future")).toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText(/When did this happen/i).closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("passes a valid past custom time through as a timestamp", async () => {
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

    await user.click(screen.getByRole("button", { name: /Set different time/i }));
    fireEvent.change(screen.getByLabelText(/When did this happen/i), {
      target: { value: "2024-01-02T08:30" },
    });
    await user.click(screen.getByRole("button", { name: "Add Entry" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![1]).toBe(new Date("2024-01-02T08:30").getTime());
  });
});
