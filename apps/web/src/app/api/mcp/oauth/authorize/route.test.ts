/**
 * GET /api/mcp/oauth/authorize — the signed-out branch.
 *
 * Invariant under test: the endpoint sends a signed-out user to /auth AT
 * MOST ONCE per attempt. Coming back still signed out (the symptom of a
 * sign-in that never left a session cookie) must terminate on a page the
 * user has to click through, not redirect again — that ping-pong was the
 * MCP connector login loop.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getSessionMock = vi.fn();
vi.mock("@/lib/neon-auth", () => ({
  auth: { getSession: () => getSessionMock() },
}));

vi.mock("@intake/db/client", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  },
}));

const REDIRECT_URI = "https://claude.ai/api/organizations/o/mcp/callback";
const CLIENT = {
  clientId: "client-123",
  clientName: "claude.ai",
  redirectUris: [REDIRECT_URI],
};

vi.mock("@/lib/mcp/oauth", () => ({
  getClient: async (clientId: string) =>
    clientId === CLIENT.clientId ? CLIENT : null,
  issueAuthCode: async () => "auth-code-abc",
}));

let GET: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: null });
  const mod = await import("@/app/api/mcp/oauth/authorize/route");
  GET = mod.GET as typeof GET;
});

function authorizeParams(extra: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: "code",
    client_id: CLIENT.clientId,
    redirect_uri: REDIRECT_URI,
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
    state: "state-xyz",
    ...extra,
  });
}

function makeRequest(params: URLSearchParams, { retried = false } = {}) {
  const headers: Record<string, string> = {
    host: "app.test",
    "x-forwarded-proto": "https",
  };
  if (retried) headers.cookie = "mcp_signin_retry=1";
  return new NextRequest(
    `https://app.test/api/mcp/oauth/authorize?${params.toString()}`,
    { headers },
  );
}

/** The Set-Cookie value for the retry marker, if the response sets one. */
function retryCookie(res: Response): string | undefined {
  return res.headers
    .getSetCookie()
    .find((c) => c.startsWith("mcp_signin_retry="));
}

describe("authorize GET — signed out", () => {
  it("redirects to /auth carrying the full request as callbackURL", async () => {
    const res = await GET(makeRequest(authorizeParams()));

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth");

    const callbackURL = location.searchParams.get("callbackURL")!;
    expect(callbackURL.startsWith("/api/mcp/oauth/authorize?")).toBe(true);
    const returned = new URLSearchParams(
      callbackURL.slice(callbackURL.indexOf("?")),
    );
    // Every OAuth parameter survives the round trip...
    expect(returned.get("client_id")).toBe(CLIENT.clientId);
    expect(returned.get("state")).toBe("state-xyz");
    expect(returned.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(returned.get("code_challenge")).toBe("a".repeat(43));
  });

  it("marks the browser with an HttpOnly cookie rather than a query param", async () => {
    const res = await GET(makeRequest(authorizeParams()));

    // The marker must not be forgeable by the caller: it never appears in
    // the callback URL, and script can't read or set it.
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("callbackURL")).not.toContain(
      "mcp_signin",
    );

    const cookie = retryCookie(res)!;
    expect(cookie).toContain("mcp_signin_retry=1");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/mcp/oauth/authorize");
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it("still bounces when the caller fakes the retry marker in the query string", async () => {
    // A crafted first request must not be able to skip its own trip
    // through sign-in by asserting one already happened.
    const res = await GET(
      makeRequest(authorizeParams({ mcp_signin: "retry" })),
    );

    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/auth");
  });

  it("does NOT redirect again when the sign-in round trip already happened", async () => {
    const res = await GET(makeRequest(authorizeParams(), { retried: true }));

    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    const body = await res.text();
    expect(body).toContain("Sign in to continue");
    // The way onward is a link the user clicks, not an automatic bounce.
    expect(body).not.toContain("http-equiv=\"refresh\"");
    expect(body).toContain("/auth?callbackURL=");
    // Marker spent — the next attempt gets its own automatic bounce.
    expect(retryCookie(res)).toContain("Max-Age=0");
  });
});

describe("authorize GET — signed in", () => {
  it("renders the consent screen", async () => {
    getSessionMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "User@Example.test" } },
    });

    const res = await GET(makeRequest(authorizeParams()));

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Connect to intake-tracker");
    expect(body).toContain("user@example.test");
  });

  it("renders consent and retires the marker after a successful sign-in", async () => {
    getSessionMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.test" } },
    });

    const res = await GET(makeRequest(authorizeParams(), { retried: true }));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Connect to intake-tracker");
    expect(retryCookie(res)).toContain("Max-Age=0");
  });
});
