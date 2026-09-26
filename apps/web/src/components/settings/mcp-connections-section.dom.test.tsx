// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseAuth = vi.fn();
vi.mock("@/components/auth-guard", () => ({
  useAuth: () => mockUseAuth(),
}));

import { McpConnectionsSection } from "@/components/settings/mcp-connections-section";
import { renderWithProviders } from "@/__tests__/react-test-utils";

type Call = { url: string; method: string };

function stubConnections(connections: unknown[]) {
  const calls: Call[] = [];
  let current = connections;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (method === "DELETE") {
      const revoked = current.length;
      current = [];
      return Response.json({ revoked });
    }
    return Response.json({ connections: current });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const CLAUDE = {
  clientId: "c1",
  clientName: "claude.ai",
  tokenCount: 1,
  connectedAt: Date.UTC(2026, 8, 1),
  lastUsedAt: Date.UTC(2026, 8, 20),
};

describe("McpConnectionsSection", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ ready: true, authenticated: true, user: { id: "u" } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says when nothing is connected", async () => {
    stubConnections([]);

    renderWithProviders(<McpConnectionsSection />);

    expect(await screen.findByText(/no claude connector is connected/i)).toBeInTheDocument();
  });

  it("lists a connection and disconnects it", async () => {
    const calls = stubConnections([CLAUDE]);
    const user = userEvent.setup();

    renderWithProviders(<McpConnectionsSection />);

    expect(await screen.findByText("claude.ai")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /disconnect claude\.ai/i }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        url: expect.stringContaining("/api/mcp/connections?clientId=c1"),
        method: "DELETE",
      }),
    );
    expect(await screen.findByText(/no claude connector is connected/i)).toBeInTheDocument();
  });

  it("does not query while signed out", () => {
    mockUseAuth.mockReturnValue({ ready: true, authenticated: false, user: null });
    const calls = stubConnections([CLAUDE]);

    renderWithProviders(<McpConnectionsSection />);

    expect(screen.getByText(/sign in to manage claude connections/i)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
