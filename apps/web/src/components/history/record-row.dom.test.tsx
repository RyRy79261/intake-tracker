// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecordRow } from "@/components/history/record-row";
import { makeWeightRecord } from "@/__tests__/fixtures/db-fixtures";

/**
 * The whole row is a keyboard-operable "edit" button (Enter/Space), and it
 * also holds real Edit/Delete buttons. Keyboard activation of those inner
 * buttons must not bubble into the row's handler, which would open the editor
 * and preventDefault the button's own activation.
 */
function renderRow() {
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
    const { onEdit, onDelete } = renderRow();

    screen.getByText("72.5 kg").closest<HTMLElement>("[role=button]")!.focus();
    await user.keyboard("{Enter}");

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes (and does not open the editor) when Enter is pressed on Delete", async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = renderRow();

    screen.getByRole("button", { name: "Delete entry" }).focus();
    await user.keyboard("{Enter}");

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("deletes when Space is pressed on Delete", async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = renderRow();

    screen.getByRole("button", { name: "Delete entry" }).focus();
    await user.keyboard(" ");

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
