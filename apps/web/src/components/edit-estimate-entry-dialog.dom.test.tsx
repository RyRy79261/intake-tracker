// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditEstimateEntryDialog } from "@/components/edit-estimate-entry-dialog";
import { renderWithProviders } from "@/__tests__/react-test-utils";
import { ESTIMATE_TRACKER_IDS } from "@/lib/estimate-trackers";

const EXPECTED = {
  urination: { title: "Edit Urination Entry", placeholder: "e.g. colour, urgency" },
  defecation: { title: "Edit Defecation Entry", placeholder: "e.g. consistency, urgency" },
} as const;

describe.each(ESTIMATE_TRACKER_IDS)("EditEstimateEntryDialog (%s)", (tracker) => {
  function renderDialog(onAmountChange = vi.fn()) {
    renderWithProviders(
      <EditEstimateEntryDialog
        tracker={tracker}
        open
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
  }

  it("is titled and labelled for its tracker", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: EXPECTED[tracker].title })).toBeInTheDocument();
    expect(screen.getByLabelText("Note (optional)")).toHaveAttribute("placeholder", EXPECTED[tracker].placeholder);
    expect(screen.getByLabelText("Time")).toHaveAttribute("id", `edit-${tracker}-timestamp`);
  });

  it("offers a 'No estimate' option that maps to an empty amount", async () => {
    const user = userEvent.setup();
    const onAmountChange = vi.fn();
    renderDialog(onAmountChange);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "No estimate" }));
    expect(onAmountChange).toHaveBeenCalledWith("");
  });
});
