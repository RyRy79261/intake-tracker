// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

let signedIn = false;
vi.mock("@/components/auth-guard", () => ({ useAuthGate: () => signedIn }));
vi.mock("@/components/shell/hold-to-talk", () => ({
  HoldToTalk: ({ variant }: { variant?: string }) => (
    <button type="button" aria-label="Hold to talk" data-variant={variant} />
  ),
}));
vi.mock("@/components/report-bug-dialog", () => ({
  ReportBugDialog: ({ open, defaultType }: { open: boolean; defaultType?: string }) =>
    open ? <div role="dialog" aria-label="Report a bug" data-type={defaultType} /> : null,
}));
vi.mock("@intake/ui/use-toast", () => ({ toast: vi.fn() }));

import { DeskBand, DeskIcon } from "@/components/shell/desk-band";
import { MODULE_IDS } from "@/lib/desk-modules";
import { useModuleWindowStore } from "@/stores/module-window-store";
import { useWindowStore } from "@/stores/window-store";

const AREA = { w: 1440, h: 784 };
const mods = () => useModuleWindowStore.getState();
const icons = () => within(screen.getByRole("list", { name: "Minimised modules" })).queryAllByRole("button");

describe("DeskBand", () => {
  beforeEach(() => {
    signedIn = false;
    localStorage.clear();
    useWindowStore.setState({ wins: [], focus: null, area: AREA, z: 0, desktop: true, wide: true });
    useModuleWindowStore.setState({ focus: null, arranged: false });
    mods().arrange(AREA);
    mods().syncZ();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("has no module icons while every module is open", () => {
    render(<DeskBand />);
    expect(icons()).toHaveLength(0);
  });

  it("shows a square icon for each minimised module, with its label", () => {
    mods().minimise("liquids");
    mods().minimise("bp");
    render(<DeskBand />);
    expect(icons()).toHaveLength(2);

    const liquids = screen.getByRole("button", { name: "Open Liquids" });
    expect(liquids).toHaveTextContent("Liquids");
    expect(liquids).toHaveClass("h-14", "w-14");
    expect(liquids.querySelector("svg")).not.toBeNull();
    expect(liquids).toHaveAttribute("data-desk-icon", "liquids");
    expect(screen.getByRole("button", { name: "Open Blood Pressure" })).toHaveTextContent("BP");
  });

  it("an icon appears when its module is minimised and goes when it is restored", () => {
    render(<DeskBand />);
    fireEvent.click(screen.getByRole("button", { name: "Report a bug" })); // unrelated: no icon yet
    expect(screen.queryByRole("button", { name: "Open Food" })).not.toBeInTheDocument();

    mods().minimise("food");
    cleanup();
    render(<DeskBand />);
    const before = { ...mods().wins.food };
    fireEvent.click(screen.getByRole("button", { name: "Open Food" }));
    expect(mods().wins.food.min).toBe(false);
    // Back at the same place and size, in front, with the focus.
    expect(mods().wins.food).toMatchObject({ x: before.x, y: before.y, w: before.w, h: before.h });
    expect(mods().focus).toBe("food");
    expect(mods().wins.food.z).toBe(useWindowStore.getState().z);
    expect(screen.queryByRole("button", { name: "Open Food" })).not.toBeInTheDocument();
  });

  it("restoring moves keyboard focus to the window's title", () => {
    mods().minimise("weight");
    render(
      <>
        <DeskBand />
        <h2 id="wt-m-weight" tabIndex={0}>
          Weight
        </h2>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open Weight" }));
    expect(screen.getByRole("heading", { name: "Weight" })).toHaveFocus();
  });

  it("an icon is a button: Enter on it restores the module", () => {
    mods().minimise("wee");
    render(<DeskIcon id="wee" />);
    const icon = screen.getByRole("button", { name: "Open Urination" });
    expect(icon.tagName).toBe("BUTTON");
    icon.focus();
    expect(icon).toHaveFocus();
    fireEvent.click(icon);
    expect(mods().wins.wee.min).toBe(false);
  });

  it("with every module minimised all seven icons are there, in order", () => {
    for (const id of MODULE_IDS) mods().minimise(id);
    render(<DeskBand />);
    expect(icons().map((b) => b.getAttribute("data-desk-icon"))).toEqual([...MODULE_IDS]);
  });

  it("shows no module icons off the desk (another page)", () => {
    mods().minimise("liquids");
    render(<DeskBand modules={false} />);
    expect(icons()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Report a bug" })).toBeInTheDocument();
  });

  it("the microphone is there only when signed in", () => {
    render(<DeskBand />);
    expect(screen.queryByRole("button", { name: "Hold to talk" })).not.toBeInTheDocument();
    cleanup();

    signedIn = true;
    render(<DeskBand />);
    const mic = screen.getByRole("button", { name: "Hold to talk" });
    expect(mic).toHaveAttribute("data-variant", "corner");
    // Bottom right: the last thing in the band.
    expect(screen.getByTestId("desk-band").lastElementChild).toBe(mic);
  });

  it("the hazard button is first, on the left, and opens the bug report dialog", () => {
    render(<DeskBand />);
    const hazard = screen.getByRole("button", { name: "Report a bug" });
    expect(screen.getByTestId("desk-band").firstElementChild).toBe(hazard);
    expect(hazard).toHaveClass("h-14", "w-14");
    expect(hazard.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(hazard);
    expect(screen.getByRole("dialog", { name: "Report a bug" })).toHaveAttribute("data-type", "bug");
  });
});
