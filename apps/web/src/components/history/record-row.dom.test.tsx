// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecordRow } from "@/components/history/record-row";
import { makeIntakeRecord, makeEatingRecord, makeWeightRecord } from "@/__tests__/fixtures/db-fixtures";
import type { UnifiedRecord } from "@/lib/history-types";

function renderRow(unified: UnifiedRecord) {
  return render(
    <RecordRow unified={unified} onDelete={() => {}} onEdit={() => {}} isDeleting={false} />,
  );
}

describe("RecordRow", () => {
  it.each([
    ["water", 250, "Water", "250 ml"],
    ["salt", 480, "Sodium", "480 mg"],
    ["sugar", 12, "Sugar", "12 g"],
    ["potassium", 400, "Potassium", "400 mg"],
  ] as const)("labels a %s intake row with its own theme and unit", (type, amount, label, text) => {
    renderRow({
      type: "intake",
      record: makeIntakeRecord({ type, amount, source: "manual" }),
    });
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^${text}`))).toBeInTheDocument();
    if (type !== "salt") expect(screen.queryByText("Sodium")).not.toBeInTheDocument();
  });

  it("shows a meal's grams when it has no note", () => {
    const record = makeEatingRecord({ grams: 300 });
    delete record.note;
    renderRow({ type: "eating", record });
    expect(screen.getByText("300 g")).toBeInTheDocument();
  });

  it("joins a meal's grams and note", () => {
    renderRow({ type: "eating", record: makeEatingRecord({ grams: 300, note: "Pasta" }) });
    expect(screen.getByText("Pasta · 300 g")).toBeInTheDocument();
  });

  it("shows a dash for a meal with neither grams nor note", () => {
    const record = makeEatingRecord({});
    delete record.note;
    delete record.grams;
    renderRow({ type: "eating", record });
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

/**
 * The whole row is a keyboard-operable "edit" button (Enter/Space), and it
 * also holds real Edit/Delete buttons. Keyboard activation of those inner
 * buttons must not bubble into the row's handler, which would open the editor
 * and preventDefault the button's own activation.
 */
function renderKeyboardRow() {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <RecordRow
      unified={{ type: "weight", record: makeWeightRecord({ weight: 72.5 }) }}
      onEdit={onEdit}
      onDelete={onDelete}
      isDeleting={false}
    />,
  );
  return { onEdit, onDelete };
}

describe("RecordRow keyboard access", () => {
  it("opens the editor when Enter is pressed on the focused row", async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = renderKeyboardRow();

    screen.getByText("72.5 kg").closest<HTMLElement>("[role=button]")!.focus();
    await user.keyboard("{Enter}");

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes (and does not open the editor) when Enter is pressed on Delete", async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = renderKeyboardRow();

    screen.getByRole("button", { name: "Delete entry" }).focus();
    await user.keyboard("{Enter}");

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("deletes when Space is pressed on Delete", async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = renderKeyboardRow();

    screen.getByRole("button", { name: "Delete entry" }).focus();
    await user.keyboard(" ");

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
