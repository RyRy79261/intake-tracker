// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ParsedItemRow } from "@/components/voice/parsed-item-row";
import type {
  BloodPressureItem,
  WaterItem,
  VoiceParsedItem,
} from "@/lib/voice-types";

const bpItem: BloodPressureItem = {
  kind: "blood_pressure",
  systolic: 128,
  diastolic: 84,
  heartRate: 72,
};

const waterItem: WaterItem = { kind: "water", ml: 250 };

describe("ParsedItemRow", () => {
  it("renders the kind label and editable fields for a blood-pressure item", () => {
    render(
      <ParsedItemRow
        item={bpItem}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        approved={null}
      />,
    );

    expect(screen.getByText("Blood pressure")).toBeInTheDocument();
    // Field labels aren't wired via htmlFor, so assert on the field captions
    // plus the three numeric inputs carrying the parsed systolic/diastolic/HR.
    expect(screen.getByText("Systolic")).toBeInTheDocument();
    expect(screen.getByText("Diastolic")).toBeInTheDocument();
    expect(screen.getByText("Heart rate")).toBeInTheDocument();
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toHaveValue(128);
    expect(inputs[1]).toHaveValue(84);
    expect(inputs[2]).toHaveValue(72);
  });

  it("emits an updated item via onChange when a field is edited", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ParsedItemRow
        item={waterItem}
        index={1}
        onChange={onChange}
        onApprove={() => {}}
        onReject={() => {}}
        approved={null}
      />,
    );

    expect(screen.getByText("Water (ml)")).toBeInTheDocument();
    const input = screen.getByRole("spinbutton");
    // Typing one digit appends to the existing "250" -> "2503".
    await user.type(input, "3");

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as VoiceParsedItem;
    expect(last).toMatchObject({ kind: "water", ml: 2503 });
  });

  it("fires onApprove and onReject from the action buttons", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ParsedItemRow
        item={waterItem}
        index={2}
        onChange={() => {}}
        onApprove={onApprove}
        onReject={onReject}
        approved={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: /approve water/i }));
    await user.click(screen.getByRole("button", { name: /reject water/i }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("disables the editor once the item has been approved", () => {
    render(
      <ParsedItemRow
        item={waterItem}
        index={3}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        approved={true}
      />,
    );

    // An approved row shows the "approved" marker and locks its input.
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toBeDisabled();
  });

  it("shows a drink's sugar and sodium so the user approves what is saved", () => {
    // Caffeine/alcohol rows used to show only caffeine/ABV and volume, while
    // the save wrote the (possibly merged) solutes the user never saw.
    render(
      <ParsedItemRow
        item={{
          kind: "caffeine",
          description: "latte",
          caffeineMg: 80,
          volumeMl: 250,
          sugarG: 12,
          sodiumMg: 900,
        }}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        approved={null}
      />,
    );
    expect(screen.getByText("Sodium (mg)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("900")).toBeInTheDocument();
    // Sugar is on by default; potassium is off, so it stays hidden.
    expect(screen.getByText("Sugar (g)")).toBeInTheDocument();
    expect(screen.queryByText("Potassium (mg)")).not.toBeInTheDocument();
  });

  it("shows solute fields on an alcohol row too", () => {
    render(
      <ParsedItemRow
        item={{ kind: "alcohol", description: "cider", abvPercent: 4.5, volumeMl: 500, sugarG: 20 }}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        approved={null}
      />,
    );
    expect(screen.getByText("Sodium (mg)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
  });

  it("blocks approval of an invalid row and says why", () => {
    render(
      <ParsedItemRow
        item={{ kind: "water", ml: -250 }}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        approved={null}
      />,
    );
    expect(screen.getByRole("button", { name: /approve water/i })).toBeDisabled();
    // Rejecting is always possible.
    expect(screen.getByRole("button", { name: /reject water/i })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/water/i);
  });

  it("requires an amount before a urination row can be approved", () => {
    render(
      <ParsedItemRow
        item={{ kind: "urination" }}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        approved={null}
      />,
    );
    expect(screen.getByRole("button", { name: /approve urination/i })).toBeDisabled();
  });

  describe("time", () => {
    // "Now" is 2026-09-30 14:00 on the device's own wall clock, whatever zone
    // the suite runs in — the row reads the device zone, as it does in the app.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 8, 30, 14, 0));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function renderRow(item: VoiceParsedItem, approved: boolean | null = null) {
      const onChange = vi.fn();
      const view = render(
        <ParsedItemRow
          item={item}
          index={0}
          onChange={onChange}
          onApprove={() => {}}
          onReject={() => {}}
          approved={approved}
        />,
      );
      const input = view.container.querySelector(
        'input[type="datetime-local"]',
      ) as HTMLInputElement;
      return { onChange, input };
    }

    it("pre-fills the parsed time and names the day when it is not now", () => {
      const { input } = renderRow({
        kind: "alcohol",
        description: "beer",
        abvPercent: 5,
        volumeMl: 330,
        at: "2026-09-29T20:00",
      });
      expect(input.value).toBe("2026-09-29T20:00");
      expect(input).toBeEnabled();
      expect(input.max).toBe("2026-09-30T14:00");
      expect(screen.getByTestId("voice-item-0-when")).toHaveTextContent("Yesterday 20:00");
      expect(screen.getByRole("button", { name: /approve alcohol/i })).toBeEnabled();
    });

    it("names an earlier time today", () => {
      renderRow({ kind: "water", ml: 100, at: "2026-09-30T13:00" });
      expect(screen.getByTestId("voice-item-0-when")).toHaveTextContent("Today 13:00");
    });

    it("says 'now' and leaves the input empty when no time was said", () => {
      const { input } = renderRow({ kind: "food", description: "bagel" });
      expect(input.value).toBe("");
      expect(screen.getByTestId("voice-item-0-when")).toHaveTextContent("now, when saved");
      expect(screen.queryByRole("button", { name: "Use now" })).not.toBeInTheDocument();
    });

    it("edits the time, and clears it back to now", () => {
      const { onChange, input } = renderRow({ kind: "water", ml: 250, at: "2026-09-30T13:00" });

      fireEvent.change(input, { target: { value: "2026-09-28T08:15" } });
      expect(onChange.mock.calls.at(-1)![0]).toEqual({
        kind: "water",
        ml: 250,
        at: "2026-09-28T08:15",
      });

      fireEvent.change(input, { target: { value: "" } });
      expect(onChange.mock.calls.at(-1)![0]).toEqual({ kind: "water", ml: 250 });

      fireEvent.click(screen.getByRole("button", { name: "Use now" }));
      expect(onChange.mock.calls.at(-1)![0]).toEqual({ kind: "water", ml: 250 });
    });

    it("blocks approval of a time in the future", () => {
      renderRow({ kind: "water", ml: 250, at: "2026-09-30T18:00" });
      expect(screen.getByRole("alert")).toHaveTextContent(/future/i);
      expect(screen.getByRole("button", { name: /approve water/i })).toBeDisabled();
    });

    it("asks for a second look at a time more than a week back, without blocking", () => {
      renderRow({ kind: "water", ml: 250, at: "2026-09-20T09:00" });
      expect(screen.getByTestId("voice-item-0-when")).toHaveTextContent("Sun 20 Sep 09:00");
      expect(screen.getByText(/More than 7 days ago/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /approve water/i })).toBeEnabled();
    });

    it("locks the time once the row is approved", () => {
      const { input } = renderRow({ kind: "water", ml: 250, at: "2026-09-29T20:00" }, true);
      expect(input).toBeDisabled();
      expect(screen.getByTestId("voice-item-0-when")).toHaveTextContent("Yesterday 20:00");
      expect(screen.queryByRole("button", { name: "Use now" })).not.toBeInTheDocument();
    });
  });

  it("renders notes anchored to the row", () => {
    render(
      <ParsedItemRow
        item={waterItem}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        approved={null}
        notes={[{ tone: "warning", message: "may be the same drink" }]}
      />,
    );
    expect(screen.getByText("may be the same drink")).toBeInTheDocument();
  });

  it("shows a refresh button for a food item and fires onRefresh", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <ParsedItemRow
        item={{ kind: "food", description: "bagel", grams: 100 }}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        onRefresh={onRefresh}
        approved={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Refresh Food with AI" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("disables refresh when the description is empty", () => {
    render(
      <ParsedItemRow
        item={{ kind: "food", description: "  " }}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        onRefresh={() => {}}
        approved={null}
      />,
    );
    expect(screen.getByRole("button", { name: "Refresh Food with AI" })).toBeDisabled();
  });

  it("hides refresh once the row is approved", () => {
    render(
      <ParsedItemRow
        item={{ kind: "food", description: "bagel" }}
        index={0}
        onChange={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        onRefresh={() => {}}
        approved={true}
      />,
    );
    expect(screen.queryByRole("button", { name: /Refresh/ })).not.toBeInTheDocument();
  });
});
