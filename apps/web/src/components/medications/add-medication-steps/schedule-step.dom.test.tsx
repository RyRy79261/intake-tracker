// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ScheduleStep } from "@/components/medications/add-medication-steps/schedule-step";
import type { AddMedicationFormState } from "@/hooks/use-add-medication-form";
import { useSettingsStore } from "@/stores/settings-store";

const DAY_LABEL = /^(Su|Mo|Tu|We|Th|Fr|Sa)$/;

function renderStep(daysOfWeek: number[] = [0, 1, 2, 3, 4, 5, 6]) {
  const onFieldChange = vi.fn();
  const formState = { schedules: [{ time: "08:00", daysOfWeek }] } as unknown as AddMedicationFormState;
  render(<ScheduleStep formState={formState} onFieldChange={onFieldChange} />);
  const dayButtons = screen.getAllByRole("button").filter((b) => DAY_LABEL.test(b.textContent ?? ""));
  return { onFieldChange, dayButtons };
}

describe("ScheduleStep day picker", () => {
  afterEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it("lists the days Monday first by default", () => {
    const { dayButtons } = renderStep();
    expect(dayButtons.map((b) => b.textContent)).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });

  it("lists the days from the week start the user chose", () => {
    useSettingsStore.setState({ weekStartsOn: 0 });
    const { dayButtons } = renderStep();
    expect(dayButtons.map((b) => b.textContent)).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
  });

  it("still stores Sunday-indexed days whatever the display order", async () => {
    useSettingsStore.setState({ weekStartsOn: 6 });
    const { dayButtons, onFieldChange } = renderStep([1]);
    expect(dayButtons[0]!.textContent).toBe("Sa");
    await userEvent.click(dayButtons[0]!);
    expect(onFieldChange).toHaveBeenCalledWith("schedules", [{ time: "08:00", daysOfWeek: [1, 6] }]);
  });
});
