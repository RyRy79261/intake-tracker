// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseAiAccess = vi.fn();
vi.mock("@/hooks/use-ai-access", () => ({
  useAiAccess: () => mockUseAiAccess(),
}));

import { useAuthGate } from "./auth-guard";

describe("useAuthGate", () => {
  beforeEach(() => {
    mockUseAiAccess.mockReset();
    // useAuthGate short-circuits to `true` when Privy isn't configured
    // (dev mode). Stub the env so we exercise the gated production path.
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "test-app-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when Privy is not configured (dev / CI mode)", () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
    mockUseAiAccess.mockReturnValue({ status: "denied" });
    const { result } = renderHook(() => useAuthGate());
    expect(result.current).toBe(true);
  });

  it("returns true while access status is still loading (no flicker)", () => {
    mockUseAiAccess.mockReturnValue({ status: "loading" });
    const { result } = renderHook(() => useAuthGate());
    expect(result.current).toBe(true);
  });

  it("returns true when the user is approved", () => {
    mockUseAiAccess.mockReturnValue({
      status: "approved",
      email: "alice@example.com",
    });
    const { result } = renderHook(() => useAuthGate());
    expect(result.current).toBe(true);
  });

  it("returns false when the user is signed out", () => {
    mockUseAiAccess.mockReturnValue({ status: "signed-out" });
    const { result } = renderHook(() => useAuthGate());
    expect(result.current).toBe(false);
  });

  it("returns false when the user is signed in but not whitelisted", () => {
    // The core contract: authenticated ≠ approved. Denied users see the
    // same hidden UI as signed-out users.
    mockUseAiAccess.mockReturnValue({
      status: "denied",
      reason: "Your account is not authorized to use this app",
    });
    const { result } = renderHook(() => useAuthGate());
    expect(result.current).toBe(false);
  });
});
