// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const check = {
  isUpdateAvailable: true,
  serverVersion: "1.39.0" as string | null,
  applyUpdate: vi.fn(),
  dismissUpdate: vi.fn(),
};
vi.mock("@/hooks/use-version-check", () => ({
  useVersionCheck: () => check,
}));

const env = { capacitor: false };
vi.mock("@/lib/api-fetch", () => ({
  isCapacitorMode: () => env.capacitor,
}));

import { UpdateNotification } from "@/components/update-notification";

describe("UpdateNotification", () => {
  beforeEach(() => {
    check.isUpdateAvailable = true;
    check.serverVersion = "1.39.0";
    check.applyUpdate.mockReset();
    check.dismissUpdate.mockReset();
    env.capacitor = false;
  });
  afterEach(cleanup);

  it("renders nothing when no update is available", () => {
    check.isUpdateAvailable = false;
    render(<UpdateNotification />);
    expect(screen.queryByTestId("update-banner")).not.toBeInTheDocument();
  });

  it("shows a status banner under the sys-bar with the new version", () => {
    render(<UpdateNotification />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("data-testid", "update-banner");
    expect(banner).toHaveTextContent("Update available");
    expect(banner).toHaveTextContent("v1.39.0 is available — tap to refresh");
    expect(banner.className).toContain("top-[calc(44px");
    expect(banner.className).not.toMatch(/rounded/);
  });

  it("applies the update", async () => {
    const user = userEvent.setup();
    render(<UpdateNotification />);
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(check.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it("dismisses", async () => {
    const user = userEvent.setup();
    render(<UpdateNotification />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(check.dismissUpdate).toHaveBeenCalledTimes(1);
  });

  it("has no in-app Update button in the Android app", () => {
    env.capacitor = true;
    render(<UpdateNotification />);
    expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("update from Play Store");
  });
});
