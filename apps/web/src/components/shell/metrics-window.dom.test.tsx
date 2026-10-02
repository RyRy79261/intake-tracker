// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import type * as MedicationQueries from "@/hooks/use-medication-queries";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/auth-guard", () => ({
  useAuth: () => ({ ready: true, authenticated: false, user: null }),
}));
vi.mock("@/hooks/use-medication-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof MedicationQueries>()),
  useDailyDoseSchedule: () => [],
}));

import { SysBar } from "@/components/shell/sys-bar";
import { TodayGadget } from "@/components/home/today-gadget";
import { WINDOW_APPS } from "@/components/shell/app-registry";
import { useWindowStore } from "@/stores/window-store";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";

/** The Metrics window's body, as the window layer renders it. */
function MetricsWindow() {
  const win = useWindowStore((s) => s.wins.find((w) => w.app === "metrics"));
  if (!win) return null;
  const { Body } = WINDOW_APPS.metrics;
  return (
    <div data-testid="metrics-window">
      <Body win={win} />
    </div>
  );
}

async function renderShell() {
  const now = Date.now() - 60_000;
  await renderWithFixtures(
    <>
      <SysBar />
      <TodayGadget />
      <MetricsWindow />
    </>,
    {
      settings: { analyticsIntroSeen: true },
      seed: {
        intakeRecords: [
          makeIntakeRecord({ type: "water", amount: 250, timestamp: now }),
          makeIntakeRecord({ type: "salt", amount: 480, timestamp: now - 1000 }),
        ],
      },
    },
  );
}

/** A Records filter chip (the range row has its own "All"). */
const chip = (win: HTMLElement, name: string) =>
  within(within(win).getByRole("group", { name: "Filter records" })).getByRole("button", { name });

const metricsWin = () => useWindowStore.getState().wins.find((w) => w.app === "metrics");

describe("Metrics window: History and Today rows open Records", () => {
  beforeEach(() => {
    useWindowStore.setState({ wins: [], focus: null, showHome: true, wide: false, z: 0, nextId: 1 });
    window.history.replaceState(null, "", "/");
  });

  it("the History icon lands on Records, unfiltered", async () => {
    await renderShell();
    fireEvent.click(screen.getByRole("button", { name: "History" }));

    const win = await screen.findByTestId("metrics-window");
    expect(within(win).getByRole("tab", { name: "Records" })).toHaveAttribute("aria-selected", "true");
    expect(chip(win, "All")).toHaveAttribute("aria-pressed", "true");
    expect(await within(win).findByText("250 ml")).toBeInTheDocument();
    expect(within(win).getByText("480 mg")).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe("/analytics?tab=records");
    expect(screen.getByRole("button", { name: "History" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a Today row opens Records filtered to its domain; History resets the filter", async () => {
    await renderShell();
    fireEvent.click(await screen.findByTestId("today-row-sodium"));

    const win = await screen.findByTestId("metrics-window");
    expect(metricsWin()?.st).toMatchObject({ tab: "records", filter: "salt" });
    expect(within(win).getByRole("tab", { name: "Records" })).toHaveAttribute("aria-selected", "true");
    expect(chip(win, "Sodium")).toHaveAttribute("aria-pressed", "true");
    expect(await within(win).findByText("480 mg")).toBeInTheDocument();
    expect(within(win).queryByText("250 ml")).not.toBeInTheDocument();

    // Another row retargets the same window.
    fireEvent.click(screen.getByTestId("today-row-water"));
    expect(await within(win).findByText("250 ml")).toBeInTheDocument();
    expect(within(win).queryByText("480 mg")).not.toBeInTheDocument();
    expect(useWindowStore.getState().wins).toHaveLength(1);

    // History shows everything again.
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(chip(win, "All")).toHaveAttribute("aria-pressed", "true");
    expect(await within(win).findByText("480 mg")).toBeInTheDocument();
  });

  it("keeps a chip picked in the window in the window's state", async () => {
    await renderShell();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const win = await screen.findByTestId("metrics-window");
    fireEvent.click(chip(win, "Water"));
    expect(metricsWin()?.st.filter).toBe("water");
    expect(chip(win, "Water")).toHaveAttribute("aria-pressed", "true");
  });
});
