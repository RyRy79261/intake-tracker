// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// The existing home-screen cards are the forms; stub each so the test can see
// which one the sheet opened.
vi.mock("@/components/liquids-card", () => ({ LiquidsCard: () => <div>LiquidsCard form</div> }));
vi.mock("@/components/food-salt-card", () => ({ FoodSaltCard: () => <div>FoodSaltCard form</div> }));
vi.mock("@/components/blood-pressure-card", () => ({ BloodPressureCard: () => <div>BloodPressureCard form</div> }));
vi.mock("@/components/weight-card", () => ({ WeightCard: () => <div>WeightCard form</div> }));
vi.mock("@/components/urination-card", () => ({ UrinationCard: () => <div>UrinationCard form</div> }));
vi.mock("@/components/defecation-card", () => ({ DefecationCard: () => <div>DefecationCard form</div> }));

const addRecord = vi.fn(async () => undefined);
vi.mock("@/hooks/use-intake-queries", () => ({
  useIntake: () => ({ addRecord }),
}));

const toast = vi.fn();
vi.mock("@intake/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

import { LogSheet } from "@/components/shell/log-sheet";
import { useSettingsStore } from "@/stores/settings-store";

describe("LogSheet", () => {
  beforeEach(() => {
    addRecord.mockClear();
    toast.mockClear();
    useSettingsStore.setState({ waterIncrement: 250 });
  });

  it.each([
    ["Log drink", "LiquidsCard form"],
    ["Log food", "FoodSaltCard form"],
    ["Log blood pressure", "BloodPressureCard form"],
    ["Log weight", "WeightCard form"],
    ["Log urination", "UrinationCard form"],
    ["Log defecation", "DefecationCard form"],
  ])("%s opens the existing form", (key, form) => {
    render(<LogSheet open onOpenChange={() => {}} />);
    expect(screen.queryByText(form)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: key }));
    expect(screen.getByText(form)).toBeInTheDocument();
    // The keys give way to the form, and Back returns to them.
    expect(screen.queryByRole("button", { name: "Log food" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to log keys" }));
    expect(screen.queryByText(form)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: key })).toBeInTheDocument();
  });

  it("steps the water amount and adds it", async () => {
    render(<LogSheet open onOpenChange={() => {}} />);
    expect(screen.getByTestId("log-water-amount")).toHaveTextContent("250 ml");
    fireEvent.click(screen.getByRole("button", { name: "50 ml more" }));
    fireEvent.click(screen.getByRole("button", { name: "50 ml more" }));
    fireEvent.click(screen.getByRole("button", { name: "50 ml less" }));
    expect(screen.getByTestId("log-water-amount")).toHaveTextContent("300 ml");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add 300 ml water" }));
    });
    expect(addRecord).toHaveBeenCalledWith(300, "manual");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("does not step water below 50 ml", () => {
    useSettingsStore.setState({ waterIncrement: 100 });
    render(<LogSheet open onOpenChange={() => {}} />);
    const less = screen.getByRole("button", { name: "50 ml less" });
    fireEvent.click(less);
    expect(screen.getByTestId("log-water-amount")).toHaveTextContent("50 ml");
    expect(less).toBeDisabled();
  });

  it("renders nothing while closed", () => {
    render(<LogSheet open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Log drink" })).not.toBeInTheDocument();
  });
});
