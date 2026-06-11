// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// useAuth gates the entire section: render in the authenticated branch so the
// provider cards are reachable.
const mockUseAuth = vi.fn();
vi.mock("@/components/auth-guard", () => ({
  useAuth: () => mockUseAuth(),
}));

import { AiKeysSection } from "@/components/settings/ai-keys-section";
import { renderWithProviders } from "@/__tests__/react-test-utils";

/**
 * Routes a fetch URL to a canned JSON response. `apiFetch` (used by the AI-key
 * hooks) ultimately calls global `fetch`, so stubbing it makes the section
 * render deterministically without a server.
 */
function stubFetch(routes: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = Object.keys(routes).find((key) => url.includes(key));
    const body = match ? routes[match] : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

const KEY_STATUS_CONFIGURED = {
  anthropic: { configured: true, last4: "AB12" },
  groq: null,
};
const NO_SHARES = { granted: [], received: [] };
const NO_USAGE = { windowDays: 30, mine: { byProvider: [], byRoute: [] }, asGrantor: { byGrantee: [] } };

describe("AiKeysSection", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the signed-out prompt when the user is not authenticated", () => {
    mockUseAuth.mockReturnValue({ ready: true, authenticated: false, user: null });

    renderWithProviders(<AiKeysSection />);

    expect(screen.getByText(/sign in to manage ai keys/i)).toBeInTheDocument();
    // No provider card should be rendered while signed out.
    expect(screen.queryByText(/add key/i)).not.toBeInTheDocument();
  });

  it("renders the configured key only as a masked last-4, never raw", async () => {
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { id: "u1", email: "user@example.com", name: "Ryan" },
    });
    vi.stubGlobal(
      "fetch",
      stubFetch({
        "/api/user/api-keys/shares": NO_SHARES,
        "/api/user/ai-usage": NO_USAGE,
        "/api/user/api-keys": KEY_STATUS_CONFIGURED,
      }),
    );

    renderWithProviders(<AiKeysSection />);

    // The masked last-4 is the only key material that ever reaches the DOM.
    expect(await screen.findByText("AB12")).toBeInTheDocument();
    expect(screen.getByText(/using your key ending in/i)).toBeInTheDocument();
    // A configured provider offers "Replace key"; an unconfigured one "Add key".
    expect(screen.getByRole("button", { name: /replace key/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add key/i })).toBeInTheDocument();
  });

  it("reveals a password-type key input when 'Add key' is clicked", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      ready: true,
      authenticated: true,
      user: { id: "u1", email: "user@example.com", name: "Ryan" },
    });
    vi.stubGlobal(
      "fetch",
      stubFetch({
        "/api/user/api-keys/shares": NO_SHARES,
        "/api/user/ai-usage": NO_USAGE,
        "/api/user/api-keys": { anthropic: null, groq: null },
      }),
    );

    renderWithProviders(<AiKeysSection />);

    const [firstAddButton] = await screen.findAllByRole("button", {
      name: /add key/i,
    });
    await user.click(firstAddButton!);

    const input = await screen.findByLabelText(/paste anthropic api key/i);
    // The key field must be masked (type=password) so pasted secrets aren't visible.
    expect(input).toHaveAttribute("type", "password");
  });
});
