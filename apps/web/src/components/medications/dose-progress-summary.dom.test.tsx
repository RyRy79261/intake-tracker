// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { DoseProgressSummary } from "@/components/medications/dose-progress-summary";
import type { DoseSlot } from "@/hooks/use-medication-queries";

function slots(...statuses: DoseSlot["status"][]): DoseSlot[] {
  return statuses.map((status) => ({ status }) as DoseSlot);
}

describe("DoseProgressSummary", () => {
  it("does not celebrate a day where every dose was skipped", () => {
    render(<DoseProgressSummary slots={slots("skipped", "skipped")} lowStockWarnings={[]} />);
    expect(screen.queryByText("All done for today!")).not.toBeInTheDocument();
    expect(screen.getByText(/0 taken/)).toBeInTheDocument();
    expect(screen.getByText(/2 skipped/)).toBeInTheDocument();
  });

  it("labels the percentage as handled and shows taken and skipped apart", () => {
    render(
      <DoseProgressSummary slots={slots("taken", "skipped", "pending", "pending")} lowStockWarnings={[]} />,
    );
    expect(screen.getByText(/1 taken/)).toBeInTheDocument();
    expect(screen.getByText(/1 skipped/)).toBeInTheDocument();
    expect(screen.getByText("50% handled")).toBeInTheDocument();
  });

  it("celebrates when every dose is taken", () => {
    render(<DoseProgressSummary slots={slots("taken", "taken")} lowStockWarnings={[]} />);
    expect(screen.getByText("All done for today!")).toBeInTheDocument();
    expect(screen.getByText("2/2 doses taken")).toBeInTheDocument();
  });

  it("marks a day with every dose handled but some skipped as handled, not done", () => {
    render(<DoseProgressSummary slots={slots("taken", "skipped")} lowStockWarnings={[]} />);
    expect(screen.queryByText("All done for today!")).not.toBeInTheDocument();
    expect(screen.getByText("All doses handled")).toBeInTheDocument();
  });
});
