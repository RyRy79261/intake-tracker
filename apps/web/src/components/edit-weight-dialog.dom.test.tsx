// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditWeightDialog } from "@/components/edit-weight-dialog";
import { EditUrinationDialog } from "@/components/edit-urination-dialog";
import { renderWithProviders } from "@/__tests__/react-test-utils";
import { makeUrinationRecord, makeWeightRecord } from "@/__tests__/fixtures/db-fixtures";

describe("EditWeightDialog", () => {
  it("accepts a weight off the 0.1 grid (72.35 at the default 0.05 increment)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderWithProviders(
      <EditWeightDialog
        record={makeWeightRecord({ weight: 72.35 })}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        weight="72.35"
        onWeightChange={vi.fn()}
        timestamp="2026-05-22T08:00"
        onTimestampChange={vi.fn()}
        note=""
        onNoteChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Weight (kg)") as HTMLInputElement;
    expect(input.validity.stepMismatch).toBe(false);
    expect(input.checkValidity()).toBe(true);

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("EditUrinationDialog", () => {
  it("offers a 'No estimate' option like the defecation dialog", async () => {
    const user = userEvent.setup();
    const onAmountChange = vi.fn();
    renderWithProviders(
      <EditUrinationDialog
        record={makeUrinationRecord({ amountEstimate: "small" })}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        timestamp="2026-05-22T08:00"
        onTimestampChange={vi.fn()}
        amount="small"
        onAmountChange={onAmountChange}
        note=""
        onNoteChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "No estimate" }));
    expect(onAmountChange).toHaveBeenCalledWith("");
  });
});
