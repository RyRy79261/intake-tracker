// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditBloodPressureDialog } from "@/components/edit-blood-pressure-dialog";
import { renderWithProviders } from "@/__tests__/react-test-utils";
import { makeBloodPressureRecord } from "@/__tests__/fixtures/db-fixtures";
import type { BloodPressureRecord } from "@/lib/db";

/**
 * EditBloodPressureDialog is a fully controlled presentational component.
 * This harness wires the controlled string props to local state so typing
 * actually updates the inputs, mirroring how the real card uses it.
 */
function DialogHarness({
  record,
  onSubmit,
  onClose,
}: {
  record: BloodPressureRecord | null;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  const [systolic, setSystolic] = useState("120");
  const [diastolic, setDiastolic] = useState("80");
  const [heartRate, setHeartRate] = useState("70");
  const [position, setPosition] = useState<"sitting" | "standing">("sitting");
  const [arm, setArm] = useState<"left" | "right">("left");
  const [irregular, setIrregular] = useState(false);
  const [timestamp, setTimestamp] = useState("2026-05-22T08:00");
  const [note, setNote] = useState("");

  return (
    <EditBloodPressureDialog
      record={record}
      onClose={onClose}
      onSubmit={onSubmit}
      systolic={systolic}
      onSystolicChange={setSystolic}
      diastolic={diastolic}
      onDiastolicChange={setDiastolic}
      heartRate={heartRate}
      onHeartRateChange={setHeartRate}
      position={position}
      onPositionChange={setPosition}
      arm={arm}
      onArmChange={setArm}
      irregularHeartbeat={irregular}
      onIrregularHeartbeatChange={setIrregular}
      timestamp={timestamp}
      onTimestampChange={setTimestamp}
      note={note}
      onNoteChange={setNote}
    />
  );
}

describe("EditBloodPressureDialog", () => {
  it("renders its fields with the supplied controlled values when a record is set", () => {
    renderWithProviders(
      <DialogHarness
        record={makeBloodPressureRecord()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Edit Blood Pressure Entry")).toBeInTheDocument();
    expect(screen.getByLabelText("Systolic")).toHaveValue(120);
    expect(screen.getByLabelText("Diastolic")).toHaveValue(80);
    expect(screen.getByLabelText(/Heart Rate/i)).toHaveValue(70);
  });

  it("does not render the dialog content when record is null", () => {
    renderWithProviders(
      <DialogHarness record={null} onSubmit={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.queryByText("Edit Blood Pressure Entry")).not.toBeInTheDocument();
  });

  it("propagates input edits through the controlled change handlers", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DialogHarness
        record={makeBloodPressureRecord()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const systolic = screen.getByLabelText("Systolic");
    await user.clear(systolic);
    await user.type(systolic, "135");
    expect(systolic).toHaveValue(135);

    const note = screen.getByLabelText(/Note \(optional\)/i);
    await user.type(note, "morning reading");
    expect(note).toHaveValue("morning reading");
  });

  it("calls onSubmit when the form is submitted via Save Changes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderWithProviders(
      <DialogHarness
        record={makeBloodPressureRecord()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <DialogHarness
        record={makeBloodPressureRecord()}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits the irregular-heartbeat field when no change handler is provided", () => {
    renderWithProviders(
      <EditBloodPressureDialog
        record={makeBloodPressureRecord()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        systolic="120"
        onSystolicChange={vi.fn()}
        diastolic="80"
        onDiastolicChange={vi.fn()}
        heartRate="70"
        onHeartRateChange={vi.fn()}
        position="sitting"
        onPositionChange={vi.fn()}
        arm="left"
        onArmChange={vi.fn()}
        timestamp="2026-05-22T08:00"
        onTimestampChange={vi.fn()}
        note=""
        onNoteChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("Irregular Heartbeat")).not.toBeInTheDocument();
  });
});
