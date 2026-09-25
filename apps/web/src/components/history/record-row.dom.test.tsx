// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { RecordRow } from "@/components/history/record-row";
import { makeIntakeRecord, makeEatingRecord } from "@/__tests__/fixtures/db-fixtures";
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
