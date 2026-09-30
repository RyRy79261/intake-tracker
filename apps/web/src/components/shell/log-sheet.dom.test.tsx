// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// The existing home-screen cards are the forms; stub each so the test can see
// which one the sheet opened.
vi.mock("@/components/liquids-card", () => ({ LiquidsCard: () => <div>LiquidsCard form</div> }));
vi.mock("@/components/food-salt-card", () => ({ FoodSaltCard: () => <div>FoodSaltCard form</div> }));
// Blood pressure stands in for a real card: scoped field ids and a save that
// reports back through the Log sheet's scope.
vi.mock("@/components/blood-pressure-card", async () => {
  const { useFieldId, useOnLogged } = await import("@/components/log-form-scope");
  function BloodPressureCard() {
    const fid = useFieldId();
    const onLogged = useOnLogged();
    return (
      <div>
        BloodPressureCard form
        <label htmlFor={fid("systolic")}>Systolic (top)</label>
        <input id={fid("systolic")} />
        <button type="button" onClick={onLogged}>
          Save BP
        </button>
      </div>
    );
  }
  return { BloodPressureCard };
});
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

  it("steps the water amount, adds it and closes", async () => {
    const onOpenChange = vi.fn();
    render(<LogSheet open onOpenChange={onOpenChange} />);
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
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open when the water add fails", async () => {
    addRecord.mockRejectedValueOnce(new Error("boom"));
    const onOpenChange = vi.fn();
    render(<LogSheet open onOpenChange={onOpenChange} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add 250 ml water" }));
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("gives the form's fields their own ids, apart from the home-screen card", () => {
    // The home screen's copy of the card sits behind the sheet.
    render(
      <>
        <label htmlFor="systolic">Home systolic</label>
        <input id="systolic" data-testid="home-systolic" />
      </>,
    );
    render(<LogSheet open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Log blood pressure" }));
    const field = screen.getByLabelText("Systolic (top)");
    expect(field).not.toBe(screen.getByTestId("home-systolic"));
    expect(field.id).toBe("log-sheet-systolic");
    expect(document.querySelectorAll("#systolic")).toHaveLength(1);
  });

  it("closes after the embedded form saves", () => {
    const onOpenChange = vi.fn();
    render(<LogSheet open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Log blood pressure" }));
    expect(screen.getByTestId("log-sheet-form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save BP" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reopens on the keys, not the last form", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<LogSheet open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Log weight" }));
    expect(screen.getByTestId("log-sheet-form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<LogSheet open={false} onOpenChange={onOpenChange} />);
    rerender(<LogSheet open onOpenChange={onOpenChange} />);
    expect(screen.queryByTestId("log-sheet-form")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log weight" })).toBeInTheDocument();
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
