// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WardMedTabs } from "@/components/medications/med-tabs";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makePhaseSchedule,
} from "@/__tests__/fixtures/db-fixtures";

function regimen(name: string) {
  const prescription = makePrescription({ genericName: name });
  const phase = makeMedicationPhase(prescription.id);
  // 23:59 UTC: still open whatever the test machine's clock says.
  const schedule = makePhaseSchedule(phase.id, { dosage: 50, scheduleTimeUTC: 1439 });
  return { prescription, phase, schedule };
}

describe("WardMedTabs", () => {
  it("shows Schedule, Rx, Meds and Titrations, and no Settings tab", async () => {
    await renderWithFixtures(<WardMedTabs activeTab="schedule" onTabChange={() => {}} panelId="p" />, {
      seed: {},
    });
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Schedule", "Rx", "Meds", "Titrations"]);
    expect(screen.getByRole("tab", { name: "Schedule" })).toHaveAttribute("aria-selected", "true");
  });

  it("puts today's open doses on the Schedule pip", async () => {
    const a = regimen("DrugA");
    const b = regimen("DrugB");
    await renderWithFixtures(<WardMedTabs activeTab="prescriptions" onTabChange={() => {}} panelId="p" />, {
      seed: {
        prescriptions: [a.prescription, b.prescription],
        medicationPhases: [a.phase, b.phase],
        phaseSchedules: [a.schedule, b.schedule],
      },
    });
    expect(await screen.findByTestId("med-tab-pip-schedule")).toHaveTextContent("2");
    expect(screen.queryByTestId("med-tab-pip-titrations")).not.toBeInTheDocument();
  });

  it("switches tabs", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    await renderWithFixtures(<WardMedTabs activeTab="schedule" onTabChange={onTabChange} panelId="p" />, {
      seed: {},
    });
    await user.click(screen.getByRole("tab", { name: "Titrations" }));
    expect(onTabChange).toHaveBeenCalledWith("titrations");
  });

  it("implements the ARIA tabs pattern: one tab stop, aria-controls, arrow/Home/End keys", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    await renderWithFixtures(
      <WardMedTabs activeTab="schedule" onTabChange={onTabChange} panelId="meds-panel" />,
      { seed: {} },
    );
    const schedule = screen.getByRole("tab", { name: "Schedule" });
    const rx = screen.getByRole("tab", { name: "Rx" });
    const titrations = screen.getByRole("tab", { name: "Titrations" });
    expect(schedule).toHaveAttribute("tabindex", "0");
    expect(rx).toHaveAttribute("tabindex", "-1");
    expect(schedule).toHaveAttribute("aria-controls", "meds-panel");
    expect(schedule).toHaveAttribute("id", "meds-panel-schedule");

    schedule.focus();
    await user.keyboard("{ArrowRight}");
    expect(onTabChange).toHaveBeenLastCalledWith("prescriptions");
    expect(rx).toHaveFocus();

    schedule.focus();
    await user.keyboard("{ArrowLeft}");
    expect(onTabChange).toHaveBeenLastCalledWith("titrations");
    expect(titrations).toHaveFocus();

    schedule.focus();
    await user.keyboard("{End}");
    expect(onTabChange).toHaveBeenLastCalledWith("titrations");
    await user.keyboard("{Home}");
    expect(onTabChange).toHaveBeenLastCalledWith("schedule");
  });
});
