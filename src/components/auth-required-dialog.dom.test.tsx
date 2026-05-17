// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";

const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockAuthState: {
  authenticated: boolean;
  ready: boolean;
} = { authenticated: false, ready: true };

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    ...mockAuthState,
    login: mockLogin,
    logout: mockLogout,
  }),
}));

import {
  AuthRequiredProvider,
  useRequireAuth,
} from "./auth-required-dialog";
import { renderWithProviders } from "@/__tests__/react-test-utils";

/**
 * Test harness that opens the dialog via requireAuth() on mount and
 * surfaces the resolved value through a callback.
 */
function Harness({
  variant = "ai" as const,
  onResolved,
}: {
  variant?: "ai" | "push" | "expired" | "general";
  onResolved: (success: boolean) => void;
}) {
  const { requireAuth } = useRequireAuth();
  useEffect(() => {
    let cancelled = false;
    void requireAuth(variant).then((ok) => {
      if (!cancelled) onResolved(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [requireAuth, variant, onResolved]);
  return null;
}

describe("AuthRequiredProvider — Privy modal hand-off", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockLogout.mockReset();
    mockAuthState.authenticated = false;
    mockAuthState.ready = true;
    // The provider returns a noop context when Privy isn't configured.
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "test-app-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("opens the dialog when requireAuth is called while unauthenticated", async () => {
    const onResolved = vi.fn();
    renderWithProviders(
      <AuthRequiredProvider>
        <Harness onResolved={onResolved} />
      </AuthRequiredProvider>
    );

    expect(
      await screen.findByRole("heading", {
        name: /sign in to use AI features/i,
      })
    ).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("clicking Sign In calls Privy login (this is the hand-off point)", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AuthRequiredProvider>
        <Harness onResolved={vi.fn()} />
      </AuthRequiredProvider>
    );

    const signIn = await screen.findByRole("button", { name: /sign in/i });
    await user.click(signIn);

    expect(mockLogin).toHaveBeenCalledOnce();
  });

  it("clicking Sign In closes the local dialog so Privy's modal isn't blocked", async () => {
    // This is the core regression test: Radix Dialog applies a
    // pointer-events lock to the rest of the page when open. If we leave
    // it open while Privy opens its own modal on top, the user can't
    // click anything in the Privy modal.
    const user = userEvent.setup();
    renderWithProviders(
      <AuthRequiredProvider>
        <Harness onResolved={vi.fn()} />
      </AuthRequiredProvider>
    );

    const signIn = await screen.findByRole("button", { name: /sign in/i });
    await user.click(signIn);

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", {
          name: /sign in to use AI features/i,
        })
      ).not.toBeInTheDocument();
    });
  });

  it("Sign In does NOT resolve the promise as cancelled — it stays pending until auth flips", async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn();
    renderWithProviders(
      <AuthRequiredProvider>
        <Harness onResolved={onResolved} />
      </AuthRequiredProvider>
    );

    const signIn = await screen.findByRole("button", { name: /sign in/i });
    await user.click(signIn);

    // Give the close microtask a chance to run.
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", {
          name: /sign in to use AI features/i,
        })
      ).not.toBeInTheDocument();
    });

    expect(onResolved).not.toHaveBeenCalled();
  });

  it("'Not now' dismisses the dialog and resolves the promise as false", async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn();
    renderWithProviders(
      <AuthRequiredProvider>
        <Harness onResolved={onResolved} />
      </AuthRequiredProvider>
    );

    const cancel = await screen.findByRole("button", { name: /not now/i });
    await user.click(cancel);

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(false));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("when called while already authenticated, resolves immediately with true (no dialog)", async () => {
    mockAuthState.authenticated = true;
    const onResolved = vi.fn();

    renderWithProviders(
      <AuthRequiredProvider>
        <Harness onResolved={onResolved} />
      </AuthRequiredProvider>
    );

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(true));
    expect(
      screen.queryByRole("heading", {
        name: /sign in to use AI features/i,
      })
    ).not.toBeInTheDocument();
  });
});
