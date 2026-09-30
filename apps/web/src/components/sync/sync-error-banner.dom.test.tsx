// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/auth-guard", () => ({ useAuth: () => ({ authenticated: true }) }));

import { SyncErrorBanner } from "@/components/sync/sync-error-banner";
import { useSyncStatusStore } from "@/stores/sync-status-store";

const ABOVE_BAR = "bottom-[calc(56px+env(safe-area-inset-bottom,0px)+16px)]";

describe("SyncErrorBanner", () => {
  beforeEach(() => {
    useSyncStatusStore.setState({ lastError: "Server error" });
  });
  afterEach(cleanup);

  // The bottom bar is fixed to the bottom edge at the same z-index; a banner
  // at bottom-4 would cover Home, Windows, Hold to talk and Log.
  it.each(["/", "/medications", "/analytics", "/history", "/profile", "/settings", "/help", "/help/weight"])(
    "sits above the shell's bottom bar on %s",
    (route) => {
      pathname = route;
      render(<SyncErrorBanner />);
      const classes = screen.getByTestId("sync-error-banner").className.split(" ");
      expect(classes).toContain(ABOVE_BAR);
      expect(classes).not.toContain("bottom-4");
    },
  );

  it("stays at the bottom edge on routes without the bar", () => {
    pathname = "/privacy";
    render(<SyncErrorBanner />);
    const classes = screen.getByTestId("sync-error-banner").className.split(" ");
    expect(classes).toContain("bottom-4");
    expect(classes).not.toContain(ABOVE_BAR);
  });
});
