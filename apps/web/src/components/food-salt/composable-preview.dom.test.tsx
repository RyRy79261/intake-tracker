// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ComposablePreview, type PreviewRecord } from "@/components/food-salt/composable-preview";
import { renderWithProviders } from "@/__tests__/react-test-utils";

/** A minimal set of preview records spanning every supported type. */
function sampleRecords(): PreviewRecord[] {
  return [
    { type: "eating", description: "Pasta", grams: 250, expanded: false },
    { type: "water", amountMl: 300, expanded: false },
    { type: "salt", amountMg: 480, expanded: false },
  ];
}

describe("ComposablePreview", () => {
  it("renders one collapsible row per record with its label and summary", () => {
    renderWithProviders(
      <ComposablePreview
        records={sampleRecords()}
        onRecordsChange={vi.fn()}
        originalInputText="bowl of pasta"
        reasoning={null}
        onConfirm={vi.fn()}
        onTryAgain={vi.fn()}
        isConfirming={false}
      />,
    );

    expect(screen.getByText("bowl of pasta")).toBeInTheDocument();
    expect(screen.getByText("Eating")).toBeInTheDocument();
    expect(screen.getByText("Pasta")).toBeInTheDocument();
    expect(screen.getByText("Water")).toBeInTheDocument();
    expect(screen.getByText("300 ml")).toBeInTheDocument();
    expect(screen.getByText("Sodium")).toBeInTheDocument();
    expect(screen.getByText("480 mg")).toBeInTheDocument();
  });

  it("removes a record from the list when its remove button is clicked", async () => {
    const user = userEvent.setup();
    const onRecordsChange = vi.fn();
    renderWithProviders(
      <ComposablePreview
        records={sampleRecords()}
        onRecordsChange={onRecordsChange}
        originalInputText="bowl of pasta"
        reasoning={null}
        onConfirm={vi.fn()}
        onTryAgain={vi.fn()}
        isConfirming={false}
      />,
    );

    await user.click(screen.getByLabelText("Remove water record"));

    expect(onRecordsChange).toHaveBeenCalledTimes(1);
    const next = onRecordsChange.mock.calls[0]![0] as PreviewRecord[];
    expect(next).toHaveLength(2);
    expect(next.some((r) => r.type === "water")).toBe(false);
  });

  it("invokes onConfirm and onTryAgain from the footer buttons", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onTryAgain = vi.fn();
    renderWithProviders(
      <ComposablePreview
        records={sampleRecords()}
        onRecordsChange={vi.fn()}
        originalInputText="bowl of pasta"
        reasoning="estimated from typical portion"
        onConfirm={onConfirm}
        onTryAgain={onTryAgain}
        isConfirming={false}
      />,
    );

    expect(screen.getByText("estimated from typical portion")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm All" }));
    await user.click(screen.getByRole("button", { name: "Try Again" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state with a disabled Confirm All when there are no records", () => {
    renderWithProviders(
      <ComposablePreview
        records={[]}
        onRecordsChange={vi.fn()}
        originalInputText="nonsense input"
        reasoning={null}
        onConfirm={vi.fn()}
        onTryAgain={vi.fn()}
        isConfirming={false}
      />,
    );

    expect(
      screen.getByText(/No records to save/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm All" })).toBeDisabled();
  });

  it("disables Confirm All and shows a saving label while confirming", () => {
    renderWithProviders(
      <ComposablePreview
        records={sampleRecords()}
        onRecordsChange={vi.fn()}
        originalInputText="bowl of pasta"
        reasoning={null}
        onConfirm={vi.fn()}
        onTryAgain={vi.fn()}
        isConfirming={true}
      />,
    );

    expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled();
  });
});
