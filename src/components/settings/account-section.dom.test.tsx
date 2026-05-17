// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";

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

import { AccountSection } from "./account-section";
import { renderWithProviders } from "@/__tests__/react-test-utils";

describe("AccountSection", () => {
  beforeEach(() => {
    mockUsePrivy.mockReset();
    mockUseAiAccess.mockReset();
    mockRequireAuth.mockReset();
    // The component returns null when Privy isn't configured, so the
    // tests always run in the configured path.
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "test-app-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders nothing when Privy is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: false,
      user: null,
      logout: vi.fn(),
    });
    mockUseAiAccess.mockReturnValue({ status: "signed-out" });

    const { container } = renderWithProviders(<AccountSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("signed in + approved → green 'AI & reminders enabled' label", () => {
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

    renderWithProviders(<AccountSection />);

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(/AI & reminders enabled/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/contact admin/i)
    ).not.toBeInTheDocument();
  });

  it("signed in + denied → amber 'Contact admin for AI access' label", () => {
    // The bug we're guarding against: a signed-in but un-whitelisted
    // user should NOT see the green "AI enabled" label.
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

    renderWithProviders(<AccountSection />);

    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(
      screen.getByText(/Contact admin for AI access/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/AI & reminders enabled/i)
    ).not.toBeInTheDocument();
  });

  it("signed in + loading → 'Checking AI access…' label", () => {
    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { email: { address: "alice@example.com" } },
      logout: vi.fn(),
    });
    mockUseAiAccess.mockReturnValue({ status: "loading" });

    renderWithProviders(<AccountSection />);

    expect(screen.getByText(/Checking AI access/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/AI & reminders enabled/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Contact admin/i)
    ).not.toBeInTheDocument();
  });

  it("signed out → Sign In button + feature list (no AI status label)", () => {
    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: false,
      user: null,
      logout: vi.fn(),
    });
    mockUseAiAccess.mockReturnValue({ status: "signed-out" });

    renderWithProviders(<AccountSection />);

    expect(screen.getByText(/Not signed in/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/Contact admin/i)
    ).not.toBeInTheDocument();
  });

  it("not-yet-ready → shows Loading… (no premature state flash)", () => {
    mockUsePrivy.mockReturnValue({
      ready: false,
      authenticated: false,
      user: null,
      logout: vi.fn(),
    });
    mockUseAiAccess.mockReturnValue({ status: "loading" });

    renderWithProviders(<AccountSection />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
