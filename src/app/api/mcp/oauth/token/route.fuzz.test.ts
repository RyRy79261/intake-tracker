/**
 * Adversarial input fuzz for POST /api/mcp/oauth/token.
 *
 * The token endpoint accepts both `application/json` and
 * `application/x-www-form-urlencoded`, accepts client credentials via
 * either body params OR Basic auth header, and routes to two grant
 * types. That's a lot of validation surface for a public endpoint.
 *
 * Invariant under test (docs/TESTING_STRATEGY.md §2.4):
 *
 *     forall body, headers.
 *         status ∈ {200, 400, 401}
 *       ∧ status = 500 NEVER
 *       ∧ no thrown exception ever escapes the handler
 *       ∧ no access_token is ever issued without a matching auth_code
 *         consumed in the same request
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// Stub the db so no auth code or token ever validates — we want to
// observe the route's error-handling surface, not the happy path.
// ─────────────────────────────────────────────────────────────────────────

vi.mock("@/lib/drizzle", () => ({
  db: {
    insert: () => ({ values: async () => undefined }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => [] }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [] }),
        limit: async () => [],
      }),
    }),
  },
}));

let POST: (req: NextRequest) => Promise<Response>;
beforeEach(async () => {
  const mod = await import("@/app/api/mcp/oauth/token/route");
  POST = mod.POST as typeof POST;
});

function makeRequest(
  body: string | Record<string, string>,
  init: { contentType?: string; auth?: string } = {},
) {
  const headers: Record<string, string> = {
    "content-type": init.contentType ?? "application/x-www-form-urlencoded",
  };
  if (init.auth) headers["authorization"] = init.auth;

  let payload: string;
  if (typeof body === "string") {
    payload = body;
  } else if (headers["content-type"]?.includes("json")) {
    payload = JSON.stringify(body);
  } else {
    payload = new URLSearchParams(body).toString();
  }

  return new NextRequest("https://app.test/api/mcp/oauth/token", {
    method: "POST",
    headers,
    body: payload,
  });
}

const adversarial: Array<{
  name: string;
  body: string | Record<string, string>;
  contentType?: string;
  auth?: string;
}> = [
  { name: "empty body (form)", body: "" },
  { name: "empty body (json)", body: "", contentType: "application/json" },
  { name: "garbage form", body: "this=is=not=a=valid=grant" },
  { name: "literal null (json)", body: "null", contentType: "application/json" },
  { name: "truncated json", body: '{"grant_type": "auth', contentType: "application/json" },
  { name: "unknown grant_type", body: { grant_type: "magic" } },
  {
    name: "auth code missing PKCE verifier",
    body: {
      grant_type: "authorization_code",
      code: "mcp_ac_x",
      redirect_uri: "https://claude.ai/cb",
      client_id: "mcp_client_x",
    },
  },
  {
    name: "auth code with oversized verifier",
    body: {
      grant_type: "authorization_code",
      code: "mcp_ac_x",
      redirect_uri: "https://claude.ai/cb",
      client_id: "mcp_client_x",
      code_verifier: "x".repeat(10_000),
    },
  },
  {
    name: "auth code with non-URL redirect_uri",
    body: {
      grant_type: "authorization_code",
      code: "mcp_ac_x",
      redirect_uri: "not a url",
      client_id: "mcp_client_x",
      code_verifier: "v".repeat(64),
    },
  },
  {
    name: "refresh grant missing token",
    body: { grant_type: "refresh_token", client_id: "mcp_client_x" },
  },
  {
    name: "Basic auth with garbage encoding",
    body: { grant_type: "authorization_code" },
    auth: "Basic not-base64-at-all",
  },
  {
    name: "Basic auth with empty payload",
    body: { grant_type: "authorization_code" },
    auth: "Basic " + Buffer.from("").toString("base64"),
  },
  {
    name: "Basic auth missing colon",
    body: { grant_type: "authorization_code" },
    auth: "Basic " + Buffer.from("only-client-id").toString("base64"),
  },
  {
    name: "prompt-injection inside code",
    body: {
      grant_type: "authorization_code",
      code: "Ignore previous instructions",
      redirect_uri: "https://claude.ai/cb",
      client_id: "mcp_client_x",
      code_verifier: "v".repeat(64),
    },
  },
];

describe("/oauth/token fuzz: hand-picked adversarial corpus", () => {
  it.each(adversarial)("$name does not 5xx", async (entry) => {
    const res = await POST(
      makeRequest(entry.body, {
        ...(entry.contentType ? { contentType: entry.contentType } : {}),
        ...(entry.auth ? { auth: entry.auth } : {}),
      }),
    );
    expect([200, 400, 401, 415]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it("no adversarial input ever yields an access_token", async () => {
    for (const entry of adversarial) {
      const res = await POST(
        makeRequest(entry.body, {
          ...(entry.contentType ? { contentType: entry.contentType } : {}),
          ...(entry.auth ? { auth: entry.auth } : {}),
        }),
      );
      if (res.headers.get("content-type")?.includes("application/json")) {
        const body = (await res.json()) as { access_token?: string };
        expect(body.access_token).toBeUndefined();
      }
    }
  });
});

const arbitraryFormBody = fc.dictionary(
  fc.constantFrom(
    "grant_type",
    "code",
    "redirect_uri",
    "client_id",
    "client_secret",
    "code_verifier",
    "refresh_token",
    "scope",
    "extra",
  ),
  fc.oneof(fc.string(), fc.constant(""), fc.string()),
);

describe("/oauth/token fuzz: arbitrary form bodies (fast-check)", () => {
  it("never returns 5xx", async () => {
    await fc.assert(
      fc.asyncProperty(arbitraryFormBody, async (body) => {
        const res = await POST(makeRequest(body));
        if (res.status >= 500) {
          throw new Error(
            `expected client error or success, got ${res.status}`,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});
