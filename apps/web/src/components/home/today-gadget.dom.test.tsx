// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";

import { TodayGadget } from "@/components/home/today-gadget";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeIntakeRecord,
  makeSubstanceRecord,
} from "@/__tests__/fixtures/db-fixtures";

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime(); // September 2026

/** Today's column for a metric (the outlined, wider one). */
function todayCell(metric: string): HTMLElement {
  const cell = screen
    .getAllByTestId(`today-cell-${metric}`)
    .find((c) => c.classList.contains("t"));
  if (!cell) throw new Error(`no today cell for ${metric}`);
  return cell;
}

function cellFor(metric: string, day: string): HTMLElement {
  const cell = screen
    .getAllByTestId(`today-cell-${metric}`)
    .find((c) => c.dataset.day === day);
  if (!cell) throw new Error(`no ${day} cell for ${metric}`);
  return cell;
}

describe("TodayGadget", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows today's totals with what is left, and caffeine and alcohol without a limit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 27, 18, 42)); // Sun 27 Sep
    await renderWithFixtures(<TodayGadget />, {
      settings: { waterLimit: 1000, waterExtendedBuffer: 500 },
      seed: {
        intakeRecords: [makeIntakeRecord({ type: "water", amount: 946, timestamp: at(27, 10) })],
        substanceRecords: [
          makeSubstanceRecord({ type: "caffeine", amountMg: 143, timestamp: at(27, 8) }),
          makeSubstanceRecord({ type: "alcohol", amountStandardDrinks: 1.4, timestamp: at(27, 18) }),
        ],
      },
    });

    await waitFor(() => expect(screen.getByTestId("today-water-value")).toHaveTextContent("946"));
    expect(screen.getByTestId("today-water-status")).toHaveTextContent("54 ml left");
    expect(screen.getByTestId("today-row-water")).toHaveAttribute("data-status", "ok");
    expect(screen.getByTestId("today-caffeine-value")).toHaveTextContent("143");
    expect(screen.getByTestId("today-alcohol-value")).toHaveTextContent("1.4");
    expect(screen.getByText("caffeine, alcohol: no limit")).toBeInTheDocument();
    // Monday week start (the default): Sunday is the last, wider column.
    const labels = screen.getAllByTestId("today-day-label");
    expect(labels.map((l) => l.textContent)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    expect(labels[6]).toHaveClass("t");
    expect(screen.getByText("week 21–27 Sep")).toBeInTheDocument();
  });

  it("hatches a day over the target and fills a day over the limit solid", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 24, 18, 0)); // Thu 24 Sep
    await renderWithFixtures(<TodayGadget />, {
      settings: {
        waterLimit: 1000,
        waterExtendedBuffer: 500,
        saltLimit: 1500,
        saltExtendedBuffer: 500,
      },
      seed: {
        intakeRecords: [
          // Wednesday: over the limit (1000 + 500).
          makeIntakeRecord({ type: "water", amount: 1700, timestamp: at(23, 12) }),
          // Today: over the target, inside the buffer.
          makeIntakeRecord({ type: "water", amount: 1200, timestamp: at(24, 9) }),
          // Today's sodium: over the limit.
          makeIntakeRecord({ type: "salt", amount: 2100, timestamp: at(24, 13) }),
        ],
      },
    });

    await waitFor(() => expect(screen.getByTestId("today-water-value")).toHaveTextContent("1,200"));

    // Over target: hatched fill, bold "over target" line.
    const water = screen.getByTestId("today-row-water");
    expect(water).toHaveAttribute("data-status", "over");
    expect(screen.getByTestId("today-water-status")).toHaveTextContent("200 ml over target");
    expect(screen.getByTestId("today-water-status")).toHaveClass("over");
    const today = todayCell("water");
    expect(today).toHaveAttribute("data-status", "over");
    expect(today.querySelector("b")).toHaveClass("h");

    // Over the limit on an earlier day: solid fill with the ink cap.
    const wed = cellFor("water", "2026-09-23");
    expect(wed).toHaveAttribute("data-status", "lim");
    expect(wed.querySelector("b")).toHaveClass("x");

    // Over the limit today: an inverse "▲ over limit" block.
    expect(screen.getByTestId("today-row-sodium")).toHaveAttribute("data-status", "lim");
    const sodiumStatus = screen.getByTestId("today-sodium-status");
    expect(within(sodiumStatus).getByText("▲ 100 mg over limit")).toHaveClass("wc-inv");
    expect(todayCell("sodium").querySelector("b")).toHaveClass("x");

    // Later days this week have no bar yet.
    const fri = cellFor("water", "2026-09-25");
    expect(fri).toHaveAttribute("data-status", "future");
    expect(fri).toHaveClass("fut");
    expect(fri.querySelector("b")).toBeNull();
  });

  it("starts the week on Sunday when chosen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0)); // Wed 30 Sep
    await renderWithFixtures(<TodayGadget />, {
      settings: { weekStartsOn: 0 },
      seed: {
        intakeRecords: [
          // Sunday 27 Sep is in this week; Saturday 26 Sep is not.
          makeIntakeRecord({ type: "water", amount: 400, timestamp: at(27, 12) }),
          makeIntakeRecord({ type: "water", amount: 900, timestamp: at(26, 12) }),
        ],
      },
    });

    await waitFor(() =>
      expect(cellFor("water", "2026-09-27").querySelector("b")).not.toBeNull(),
    );
    const labels = screen.getAllByTestId("today-day-label");
    expect(labels.map((l) => l.textContent)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(labels[3]).toHaveClass("t");
    expect(screen.getByText("week 27 Sep–3 Oct")).toBeInTheDocument();
    const cells = screen.getAllByTestId("today-cell-water");
    expect(cells.map((c) => c.dataset.day)).toEqual([
      "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30",
      "2026-10-01", "2026-10-02", "2026-10-03",
    ]);
    expect(cells[3]).toHaveClass("t");
    expect(screen.getByTestId("today-row-water")).toHaveAccessibleName(/Sun 400, Mon 0, Tue 0, Wed 0, Thu no data yet/);
  });

  it("counts the small hours toward the previous day with a 02:00 day start", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 24, 1, 30)); // Thu 24 Sep 01:30 = still Wednesday
    await renderWithFixtures(<TodayGadget />, {
      settings: { dayStartHour: 2, waterLimit: 1000, waterExtendedBuffer: 500 },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 300, timestamp: at(23, 20) }),
          // 00:45 Thursday still belongs to Wednesday's logical day.
          makeIntakeRecord({ type: "water", amount: 250, timestamp: at(24, 0, 45) }),
          // 01:59 Wednesday belongs to Tuesday.
          makeIntakeRecord({ type: "water", amount: 700, timestamp: at(23, 1, 59) }),
        ],
      },
    });

    await waitFor(() => expect(screen.getByTestId("today-water-value")).toHaveTextContent("550"));
    expect(todayCell("water")).toHaveAttribute("data-day", "2026-09-23");
    expect(screen.getByTestId("today-water-status")).toHaveTextContent("450 ml left");
    expect(cellFor("water", "2026-09-22").querySelector("b")).not.toBeNull();
    expect(screen.getByTestId("today-row-water")).toHaveAccessibleName(/Tue 700, Wed 550, Thu no data yet/);
  });

  it("wide (Home on the desktop): dated day labels, a total under each day, and full rows for caffeine and alcohol", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 23, 12, 0)); // Wed 23 Sep
    await renderWithFixtures(<TodayGadget wide />, {
      settings: { waterLimit: 1000, waterExtendedBuffer: 500 },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 700, timestamp: at(22, 10) }),
          makeIntakeRecord({ type: "water", amount: 550, timestamp: at(23, 9) }),
        ],
        substanceRecords: [makeSubstanceRecord({ type: "caffeine", amountMg: 143, timestamp: at(23, 8) })],
      },
    });

    await waitFor(() => expect(screen.getByTestId("today-water-value")).toHaveTextContent("550"));
    expect(screen.getByTestId("today-gadget")).toHaveClass("wc-today-wide");
    expect(screen.getAllByTestId("today-day-label").map((l) => l.textContent)).toEqual([
      "Mon 21",
      "Tue 22",
      "Wed 23",
      "Thu 24",
      "Fri 25",
      "Sat 26",
      "Sun 27",
    ]);
    // Each day's total sits under its column; days to come show a dash.
    expect(cellFor("water", "2026-09-22").querySelector("em")).toHaveTextContent("700");
    expect(todayCell("water").querySelector("em")).toHaveTextContent("550");
    expect(cellFor("water", "2026-09-24").querySelector("em")).toHaveTextContent("—");
    // Caffeine and alcohol are rows like the rest, with no limit.
    const caffeine = screen.getByTestId("today-row-caffeine");
    expect(caffeine).toHaveClass("wc-tg-row");
    expect(within(caffeine).getByTestId("today-caffeine-value")).toHaveTextContent("143");
    expect(screen.getByTestId("today-caffeine-status")).toHaveTextContent("no limit set");
    expect(screen.getByTestId("today-row-alcohol")).toHaveClass("wc-tg-row");
    expect(screen.queryByText("caffeine, alcohol: no limit")).not.toBeInTheDocument();
  });

  it("phone: no totals under the columns", async () => {
    await renderWithFixtures(<TodayGadget />, {});
    await waitFor(() => expect(screen.getByTestId("today-gadget")).toBeInTheDocument());
    expect(screen.getByTestId("today-gadget")).not.toHaveClass("wc-today-wide");
    expect(screen.getByTestId("today-gadget").querySelector("em")).toBeNull();
    expect(screen.getByTestId("today-row-caffeine")).toHaveClass("wc-tg-half");
  });
});
