// @vitest-environment jsdom
/**
 * SignInForm's post-sign-in routing.
 *
 * The MCP connector sends a signed-out user here with
 * `?callbackURL=/api/mcp/oauth/authorize?…`. Handing that value straight
 * to Neon Auth made Google return the browser to an API route, where the
 * `?neon_auth_session_verifier=` it appends can never be exchanged for a
 * session cookie — so the authorize endpoint bounced the user back here
 * and the sign-in loop began. The form must keep the OAuth return trip on
 * this page and forward afterwards.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockSearchParams, mockSession, signInEmail, signInSocial, routerReplace } =
  vi.hoisted(() => ({
    mockSearchParams: { current: new URLSearchParams() },
    mockSession: {
      current: { data: null as unknown, isPending: false },
    },
    signInEmail: vi.fn(async (_opts: { callbackURL: string }) => ({
      data: {},
      error: null,
    })),
    signInSocial: vi.fn(async (_opts: { callbackURL: string }) => ({
      data: {},
      error: null,
    })),
    routerReplace: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: signInEmail, social: signInSocial },
  useSession: () => mockSession.current,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("@/lib/api-fetch", () => ({
  isCapacitorMode: () => false,
}));

import { SignInForm } from "@/app/auth/sign-in-form";

const AUTHORIZE_URL =
  "/api/mcp/oauth/authorize?response_type=code&client_id=c1&state=s1&mcp_signin=retry";

/** Put the browser on /auth as the MCP authorize endpoint would. */
function landOnAuthPage(callbackURL: string, extra = "") {
  const search = `?callbackURL=${encodeURIComponent(callbackURL)}${extra}`;
  mockSearchParams.current = new URLSearchParams(search);
  window.history.replaceState({}, "", `/auth${search}`);
}

beforeEach(() => {
  signInEmail.mockClear();
  signInSocial.mockClear();
  routerReplace.mockClear();
  mockSession.current = { data: null, isPending: false };
  mockSearchParams.current = new URLSearchParams();
  window.history.replaceState({}, "", "/auth");
});

describe("SignInForm — Google sign-in return target", () => {
  it("never hands Neon Auth an API route to return to", async () => {
    landOnAuthPage(AUTHORIZE_URL);
    render(<SignInForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    expect(signInSocial).toHaveBeenCalledTimes(1);
    const { callbackURL } = signInSocial.mock.calls[0]![0];
    expect(callbackURL.startsWith("/api/")).toBe(false);
    expect(callbackURL.startsWith("/auth")).toBe(true);
    // The real destination rides along so this page can forward to it.
    expect(
      new URLSearchParams(callbackURL.slice(callbackURL.indexOf("?"))).get(
        "callbackURL",
      ),
    ).toBe(AUTHORIZE_URL);
  });

  it("drops a spent session verifier from the return target", async () => {
    landOnAuthPage(AUTHORIZE_URL, "&neon_auth_session_verifier=spent");
    render(<SignInForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    const { callbackURL } = signInSocial.mock.calls[0]![0];
    expect(callbackURL).not.toContain("neon_auth_session_verifier");
  });

  it("passes a page destination through unchanged", async () => {
    landOnAuthPage("/history");
    render(<SignInForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    expect(signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/history",
    });
  });

  it("uses the same page-safe target for email sign-in", async () => {
    landOnAuthPage(AUTHORIZE_URL);
    render(<SignInForm />);

    await userEvent.type(screen.getByLabelText(/email/i), "user@example.test");
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2hunter2");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(signInEmail).toHaveBeenCalledTimes(1));
    const { callbackURL } = signInEmail.mock.calls[0]![0];
    expect(callbackURL.startsWith("/api/")).toBe(false);
  });
});

describe("SignInForm — forwarding once signed in", () => {
  it("forwards to the API-route destination when a session exists", async () => {
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace, pathname: "/auth", search: "" },
    });

    landOnAuthPage(AUTHORIZE_URL);
    mockSession.current = {
      data: { user: { id: "u1", email: "user@example.test" } },
      isPending: false,
    };
    render(<SignInForm />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(AUTHORIZE_URL));
  });

  it("stays put while the session is still resolving", async () => {
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace, pathname: "/auth", search: "" },
    });

    landOnAuthPage(AUTHORIZE_URL);
    mockSession.current = { data: null, isPending: true };
    render(<SignInForm />);

    expect(replace).not.toHaveBeenCalled();
  });
});
