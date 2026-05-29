// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { InlineEditFormShell } from "@/components/recent-entries-list";

/**
 * Regression for fix 05a0a3e: two InlineEditFormShells sharing the same
 * `idPrefix` used to emit colliding DOM ids, breaking <label htmlFor> ↔ input
 * association. A per-instance useId() suffix must keep their ids distinct.
 */
function noop() {}

function renderTwoShells() {
  return render(
    <div>
      <InlineEditFormShell
        labeled
        idPrefix="edit"
        timestamp="2023-11-14T08:00"
        onTimestampChange={noop}
        note="first"
        onNoteChange={noop}
        onSave={noop}
        onCancel={noop}
      />
      <InlineEditFormShell
        labeled
        idPrefix="edit"
        timestamp="2023-11-14T09:00"
        onTimestampChange={noop}
        note="second"
        onNoteChange={noop}
        onSave={noop}
        onCancel={noop}
      />
    </div>,
  );
}

describe("InlineEditFormShell id collision regression (labeled)", () => {
  it("emits distinct timestamp and note input ids per instance", () => {
    const { container } = renderTwoShells();

    const tsInputs = container.querySelectorAll<HTMLInputElement>(
      'input[type="datetime-local"]',
    );
    expect(tsInputs).toHaveLength(2);
    expect(tsInputs[0]!.id).not.toBe("");
    expect(tsInputs[0]!.id).not.toBe(tsInputs[1]!.id);

    // Every input across both shells has a unique id.
    const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>("input"));
    const ids = allInputs.map((i) => i.id);
    expect(ids.every((id) => id !== "")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each <label htmlFor> resolves to exactly one input", () => {
    const { container } = renderTwoShells();

    const labels = Array.from(container.querySelectorAll<HTMLLabelElement>("label[for]"));
    // Two labels (date/time + note) per shell × 2 shells.
    expect(labels).toHaveLength(4);

    for (const label of labels) {
      const target = label.getAttribute("for")!;
      const matches = container.querySelectorAll(`#${CSS.escape(target)}`);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.tagName).toBe("INPUT");
    }

    // The two "Note" labels point at different inputs (no cross-shell collision).
    const noteLabels = labels.filter((l) => l.textContent?.includes("Note"));
    expect(noteLabels).toHaveLength(2);
    expect(noteLabels[0]!.getAttribute("for")).not.toBe(
      noteLabels[1]!.getAttribute("for"),
    );
  });
});
