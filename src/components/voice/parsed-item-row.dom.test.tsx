// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ParsedItemRow } from "@/components/voice/parsed-item-row";
import type {
  BloodPressureItem,
  WaterItem,
  VoiceParsedItem,
} from "@/lib/voice-types";

const bpItem: BloodPressureItem = {
  kind: "blood_pressure",
  systolic: 128,
  diastolic: 84,
  heartRate: 72,
};

const waterItem: WaterItem = { kind: "water", ml: 250 };

describe("ParsedItemRow", () => {
  it("renders the kind label and editable fields for a blood-pressure item", () => {
    render(
      <ParsedItemRow
        item={bpItem}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        approved={null}
      />,
    );

    expect(screen.getByText("Blood pressure")).toBeInTheDocument();
    // Field labels aren't wired via htmlFor, so assert on the field captions
    // plus the three numeric inputs carrying the parsed systolic/diastolic/HR.
    expect(screen.getByText("Systolic")).toBeInTheDocument();
    expect(screen.getByText("Diastolic")).toBeInTheDocument();
    expect(screen.getByText("Heart rate")).toBeInTheDocument();
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toHaveValue(128);
    expect(inputs[1]).toHaveValue(84);
    expect(inputs[2]).toHaveValue(72);
  });

  it("emits an updated item via onChange when a field is edited", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ParsedItemRow
        item={waterItem}
        index={1}
        onChange={onChange}
        onApprove={() => {}}
        onReject={() => {}}
        approved={null}
      />,
    );

    expect(screen.getByText("Water (ml)")).toBeInTheDocument();
    const input = screen.getByRole("spinbutton");
    // Typing one digit appends to the existing "250" -> "2503".
    await user.type(input, "3");

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as VoiceParsedItem;
    expect(last).toMatchObject({ kind: "water", ml: 2503 });
  });

  it("fires onApprove and onReject from the action buttons", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ParsedItemRow
        item={waterItem}
        index={2}
        onChange={() => {}}
        onApprove={onApprove}
        onReject={onReject}
        approved={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /approve water/i }));
    await user.click(screen.getByRole("button", { name: /reject water/i }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("disables the editor once the item has been approved", () => {
    render(
      <ParsedItemRow
        item={waterItem}
        index={3}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        approved={true}
      />,
    );

    // An approved row shows the "approved" marker and locks its input.
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toBeDisabled();
  });
});
