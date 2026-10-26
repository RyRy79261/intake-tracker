// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import NativeSignInBridge from "@/app/native-auth/bridge/page";
import { buildReturnLink } from "@/lib/native-auth-link";

const APP_ORIGIN = "https://intake-tracker.ryanjnoble.dev";

function jsonRes(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NativeSignInBridge page", () => {
  it("mints a code and auto-returns to the App Link carrying that exact code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(200, { code: "abc123" })));
    render(<NativeSignInBridge />);
    await waitFor(() => expect(window.location.replace).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/native-auth/mint",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    // The ?code= contract must stay in sync with native-auth-return's RETURN_PATH.
    expect(window.location.replace).toHaveBeenCalledWith(
      `${APP_ORIGIN}/auth/native-done?code=abc123`,
    );
  });

  it("renders the fallback 'Return to Intake Tracker' link pointing at the App Link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(200, { code: "xyz" })));
    render(<NativeSignInBridge />);
    const link = await screen.findByRole("link", { name: /return to intake tracker/i });
    expect(link).toHaveAttribute("href", `${APP_ORIGIN}/auth/native-done?code=xyz`);
  });

  it("shows the error UI and does not redirect when mint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(401, { error: "no_session" })));
    render(<NativeSignInBridge />);
    expect(await screen.findByText(/sign-in error/i)).toBeInTheDocument();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it("targets the app package on Android so a Chrome-installed web copy can't take the code", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(200, { code: "a/b" })));
    render(<NativeSignInBridge />);
    await waitFor(() => expect(window.location.replace).toHaveBeenCalled());
    const expected =
      "intent://intake-tracker.ryanjnoble.dev/auth/native-done?code=a%2Fb" +
      "#Intent;scheme=https;package=dev.ryanjnoble.intaketracker;end";
    expect(window.location.replace).toHaveBeenCalledWith(expected);
    const link = await screen.findByRole("link", { name: /return to intake tracker/i });
    expect(link).toHaveAttribute("href", expected);
  });

  it("has no browser fallback, so a blocked launch keeps the return button on screen", () => {
    expect(buildReturnLink("c", "Linux; Android 14")).not.toContain("browser_fallback_url");
  });
});
