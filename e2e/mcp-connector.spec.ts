import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * End-to-end driver for the MCP custom connector OAuth + Streamable HTTP
 * flow.
 *
 * We can't drive claude.ai's connector UI from CI, so we *impersonate* a
 * well-behaved MCP client and walk the full handshake:
 *
 *   1. GET /.well-known/oauth-authorization-server
 *   2. POST /api/mcp/oauth/register (DCR — public)
 *   3. GET  /api/mcp/oauth/authorize  → consent page (with session cookie)
 *   4. POST /api/mcp/oauth/authorize  → auth code redirect
 *   5. POST /api/mcp/oauth/token      → access + refresh tokens
 *   6. POST /api/mcp/mcp  initialize  → server info
 *   7. POST /api/mcp/mcp  tools/list  → 8 read-only tools
 *
 * Auth: globalSetup signs into Neon Auth via the /auth page and persists
 * the session cookie in `playwright/.auth/user.json`. We reuse that
 * session for step 3 so the user-facing consent screen renders without a
 * Google bounce.
 *
 * This spec is the moral equivalent of "did claude.ai connect?" — it
 * exercises the rewrite, the consent screen markup, the OAuth state
 * machine, the bearer-token validator, and the MCP JSON-RPC dispatch in
 * one pass.
 */

const PKCE_VERIFIER =
  "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(buf).toString("base64url");
}

async function registerClient(api: APIRequestContext, baseURL: string) {
  const res = await api.post(`${baseURL}/api/mcp/oauth/register`, {
    headers: { "content-type": "application/json" },
    data: {
      client_name: "playwright-mcp-client",
      redirect_uris: ["http://localhost:3000/playwright-callback"],
      token_endpoint_auth_method: "none",
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as {
    client_id: string;
    redirect_uris: string[];
    client_secret?: string;
  };
}

test.describe("MCP connector handshake", () => {
  test("OAuth metadata advertises the expected endpoints", async ({
    request,
    baseURL,
  }) => {
    const res = await request.get(
      `${baseURL}/.well-known/oauth-authorization-server`,
    );
    expect(res.status()).toBe(200);
    const meta = await res.json();
    expect(meta.authorization_endpoint).toContain("/api/mcp/oauth/authorize");
    expect(meta.token_endpoint).toContain("/api/mcp/oauth/token");
    expect(meta.registration_endpoint).toContain("/api/mcp/oauth/register");
    expect(meta.code_challenge_methods_supported).toContain("S256");
  });

  test("protected-resource metadata points back at the AS", async ({
    request,
    baseURL,
  }) => {
    const res = await request.get(
      `${baseURL}/.well-known/oauth-protected-resource`,
    );
    expect(res.status()).toBe(200);
    const meta = await res.json();
    expect(meta.resource).toContain("/api/mcp");
    expect(Array.isArray(meta.authorization_servers)).toBe(true);
  });

  test("DCR returns a client_id without authentication", async ({
    request,
    baseURL,
  }) => {
    const client = await registerClient(request, baseURL ?? "");
    expect(client.client_id).toMatch(/^mcp_client_/);
  });

  test("consent page renders for an authenticated user", async ({
    page,
    request,
    baseURL,
  }) => {
    test.skip(
      !process.env.NEON_AUTH_TEST_EMAIL,
      "needs a real Neon Auth session (set NEON_AUTH_TEST_EMAIL)",
    );
    const client = await registerClient(request, baseURL ?? "");
    const verifier = PKCE_VERIFIER;
    const challenge = await pkceChallenge(verifier);
    const state = `s-${Date.now()}`;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0]!,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      scope: "intake-tracker:read",
    });
    await page.goto(`/api/mcp/oauth/authorize?${params.toString()}`);
    await expect(page.getByText(/Connect to intake-tracker/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /approve/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /deny/i })).toBeVisible();
  });

  test(
    "full handshake: register → authorize → token → MCP tools/list",
    async ({ page, request, baseURL }) => {
      test.skip(
        !process.env.NEON_AUTH_TEST_EMAIL,
        "needs a real Neon Auth session (set NEON_AUTH_TEST_EMAIL)",
      );

      const client = await registerClient(request, baseURL ?? "");
      const verifier = PKCE_VERIFIER;
      const challenge = await pkceChallenge(verifier);
      const state = `s-${Date.now()}`;

      const params = new URLSearchParams({
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: client.redirect_uris[0]!,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        scope: "intake-tracker:read",
      });

      // Visit consent page so the cookie is exchanged for the form scope.
      await page.goto(`/api/mcp/oauth/authorize?${params.toString()}`);
      await expect(page.getByText(/Connect to intake-tracker/i)).toBeVisible();

      // Intercept the redirect to the bogus callback URL so we can capture
      // the authorization code without an actual server on localhost:3000
      // /playwright-callback.
      const navPromise = page.waitForURL(
        (url) =>
          url.toString().startsWith("http://localhost:3000/playwright-callback"),
        { timeout: 10_000, waitUntil: "commit" },
      );
      await page.getByRole("button", { name: /approve/i }).click();
      await navPromise;
      const callbackUrl = new URL(page.url());
      const code = callbackUrl.searchParams.get("code");
      const returnedState = callbackUrl.searchParams.get("state");
      expect(code).toBeTruthy();
      expect(returnedState).toBe(state);

      // Token exchange.
      const tokenRes = await request.post(`${baseURL}/api/mcp/oauth/token`, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        form: {
          grant_type: "authorization_code",
          code: code!,
          redirect_uri: client.redirect_uris[0]!,
          client_id: client.client_id,
          code_verifier: verifier,
        },
      });
      expect(tokenRes.status()).toBe(200);
      const tokens = (await tokenRes.json()) as {
        access_token: string;
        refresh_token: string;
        token_type: string;
        expires_in: number;
      };
      expect(tokens.token_type).toBe("Bearer");
      expect(tokens.access_token).toMatch(/^mcp_at_/);
      expect(tokens.refresh_token).toMatch(/^mcp_rt_/);

      // MCP initialize.
      const initRes = await request.post(`${baseURL}/api/mcp/mcp`, {
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${tokens.access_token}`,
          "mcp-protocol-version": "2025-06-18",
        },
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "playwright", version: "1.0.0" },
          },
        },
      });
      expect(initRes.status()).toBe(200);

      // tools/list — should surface all 8 read-only tools.
      const listRes = await request.post(`${baseURL}/api/mcp/mcp`, {
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${tokens.access_token}`,
          "mcp-protocol-version": "2025-06-18",
        },
        data: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
      });
      expect(listRes.status()).toBe(200);
      // mcp-handler may stream as SSE; parse either way.
      const body = await listRes.text();
      const expectedTools = [
        "get_today_summary",
        "query_intake_history",
        "query_weight_history",
        "query_blood_pressure_history",
        "query_eating_history",
        "list_medications",
        "list_recent_doses",
        "get_inventory_status",
      ];
      for (const name of expectedTools) {
        expect(body, `tools/list missing ${name}`).toContain(name);
      }
    },
  );

  test("MCP endpoint without a bearer returns 401 with WWW-Authenticate", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post(`${baseURL}/api/mcp/mcp`, {
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect(res.status()).toBe(401);
    const wwwAuth = res.headers()["www-authenticate"];
    expect(wwwAuth ?? "").toMatch(/Bearer/);
  });
});
