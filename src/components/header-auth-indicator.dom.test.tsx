// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUsePrivy = vi.fn();
const mockUseAiAccess = vi.fn();
const mockRequireAuth = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockUsePrivy(),
}));
vi.mock("@/hooks/use-ai-access", () => ({
  useAiAccess: () => mockUseAiAccess(),
}));
vi.mock("@/components/auth-required-dialog", () => ({
  useRequireAuth: () => ({ requireAuth: mockRequireAuth }),
}));

import { HeaderAuthIndicator } from "./header-auth-indicator";
import { renderWithProviders } from "@/__tests__/react-test-utils";

describe("HeaderAuthIndicator — three-state popover", () => {
  beforeEach(() => {
    mockUsePrivy.mockReset();
    mockUseAiAccess.mockReset();
    mockRequireAuth.mockReset();
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "test-app-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders nothing when Privy isn't configured", () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: false,
      user: null,
      logout: vi.fn(),
    });
    mockUseAiAccess.mockReturnValue({ status: "signed-out" });

    const { container } = renderWithProviders(<HeaderAuthIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it("signed out: shows the sign-in button", () => {
    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: false,
      user: null,
      logout: vi.fn(),
    });
    mockUseAiAccess.mockReturnValue({ status: "signed-out" });

    renderWithProviders(<HeaderAuthIndicator />);

    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("approved: popover shows 'AI & reminders enabled'", async () => {
    const user = userEvent.setup();
    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { email: { address: "alice@example.com" } },
      logout: vi.fn(),
    });
    mockUseAiAccess.mockReturnValue({
      status: "approved",
      email: "alice@example.com",
    });

    renderWithProviders(<HeaderAuthIndicator />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(
      await screen.findByText(/AI & reminders enabled/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Contact admin/i)).not.toBeInTheDocument();
  });

  it("denied: popover shows 'Contact admin for AI access' instead of approved label", async () => {
    const user = userEvent.setup();
    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { email: { address: "bob@example.com" } },
      logout: vi.fn(),
    });
    mockUseAiAccess.mockReturnValue({
      status: "denied",
      reason: "Your account is not authorized to use this app",
    });

    renderWithProviders(<HeaderAuthIndicator />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(
      await screen.findByText(/Contact admin for AI access/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/AI & reminders enabled/i)
    ).not.toBeInTheDocument();
  });

  it("loading: popover shows 'Checking AI access…'", async () => {
    const user = userEvent.setup();
    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { email: { address: "alice@example.com" } },
      logout: vi.fn(),
    });
    mockUseAiAccess.mockReturnValue({ status: "loading" });

    renderWithProviders(<HeaderAuthIndicator />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(
      await screen.findByText(/Checking AI access/i)
    ).toBeInTheDocument();
  });
});
