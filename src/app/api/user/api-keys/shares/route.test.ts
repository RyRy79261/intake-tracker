/**
 * Tests for /api/user/api-keys/shares (GET / POST / DELETE).
 *
 * Strategy (mirrors src/__tests__/sync-push-route.test.ts and the sibling
 * api-keys/route.test.ts):
 *   - Mock @/lib/auth-middleware so withAuth is a pass-through HOF injecting
 *     a fixed auth context. It also catches handler errors and renders a
 *     generic 500 — the route has no try/catch, so this reproduces the
 *     Next.js runtime's behaviour for an uncaught error.
 *   - Mock @/lib/drizzle with a controllable stub `db`. Selects here end in
 *     orderBy(...) (GET) or limit(...) (POST); inserts end in
 *     onConflictDoNothing(); deletes end in where(...).
 *   - Mock @neondatabase/serverless's `neon` so the raw user-lookup
 *     tagged-template calls return controllable rows without a real DB.
 *   - Dynamically import the route AFTER mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Controllable stubs ───────────────────────────────────────────────────

// Each db.select(...) call shifts one result off this queue, in route order.
let drizzleResults: unknown[][] = [];
let drizzleShouldThrow = false;

// Each raw `neon` tagged-template call shifts one result off this queue.
let rawSqlResults: unknown[][] = [];
let rawSqlShouldThrow = false;

const insertCalls: { values: Record<string, unknown> }[] = [];
let deleteCount = 0;

function resetState() {
  drizzleResults = [];
  drizzleShouldThrow = false;
  rawSqlResults = [];
  rawSqlShouldThrow = false;
  insertCalls.length = 0;
  deleteCount = 0;
}

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string; email: string };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) => {
      try {
        return await handler({
          request,
          auth: {
            success: true,
            userId: "user-test",
            email: "test@example.test",
          },
        });
      } catch {
        // Replicates Next.js' behaviour for an uncaught handler error:
        // a generic 500 with no raw error detail leaked to the client.
        const { NextResponse } = await import("next/server");
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      }
    };
  },
}));

vi.mock("@/lib/drizzle", () => {
  function nextSelect() {
    if (drizzleShouldThrow) {
      return Promise.reject(new Error("DB_FAILURE postgres://user:pw@host/db"));
    }
    return Promise.resolve(drizzleResults.shift() ?? []);
  }
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          // GET issues orderBy(...); POST issues limit(...).
          orderBy: () => nextSelect(),
          limit: () => nextSelect(),
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          if (drizzleShouldThrow) {
            throw new Error("DB_FAILURE postgres://secret");
          }
          insertCalls.push({ values });
          return undefined;
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        if (drizzleShouldThrow) throw new Error("DB_FAILURE postgres://secret");
        deleteCount += 1;
        return undefined;
      },
    }),
  };
  return { db };
});

vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    // The route invokes neon(...) as a tagged template literal.
    return async () => {
      if (rawSqlShouldThrow) {
        throw new Error("raw pg connection failed: postgres://secret");
      }
      return rawSqlResults.shift() ?? [];
    };
  },
}));

const BASE = "https://example.test/api/user/api-keys/shares";

function getRequest(): NextRequest {
  return new NextRequest(BASE, { method: "GET" });
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest(BASE, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function deleteRequest(query?: string): NextRequest {
  const url = query ? `${BASE}?${query}` : BASE;
  return new NextRequest(url, { method: "DELETE" });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("/api/user/api-keys/shares", () => {
  beforeEach(() => {
    resetState();
    process.env.DATABASE_URL = "postgres://test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── GET ─────────────────────────────────────────────────────────────────

  it("GET happy path: returns granted + received shares with grantor emails resolved", async () => {
    drizzleResults = [
      // sharesGranted
      [
        {
          granteeId: "user-bob",
          granteeEmail: "bob@example.test",
          provider: "anthropic",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      // sharesReceived
      [
        {
          grantorId: "user-alice",
          provider: "groq",
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
      ],
    ];
    // getEmailById lookup for "user-alice".
    rawSqlResults = [[{ email: "alice@example.test" }]];

    const { GET } = await import("@/app/api/user/api-keys/shares/route");
    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      granted: Array<{ granteeId: string; granteeEmail: string; provider: string }>;
      received: Array<{ grantorEmail: string; provider: string }>;
    };
    expect(body.granted).toHaveLength(1);
    expect(body.granted[0]).toMatchObject({
      granteeId: "user-bob",
      granteeEmail: "bob@example.test",
      provider: "anthropic",
    });
    expect(body.received).toHaveLength(1);
    expect(body.received[0]!.grantorEmail).toBe("alice@example.test");
    expect(body.received[0]!.provider).toBe("groq");
    // Internal grantor ids must not be exposed on the received list.
    expect(body.received[0]).not.toHaveProperty("grantorId");
  });

  it("GET: maps an unresolvable grantor id to a safe placeholder", async () => {
    drizzleResults = [
      [],
      [{ grantorId: "user-ghost", provider: "anthropic", createdAt: new Date() }],
    ];
    rawSqlResults = [[]]; // getEmailById finds nobody

    const { GET } = await import("@/app/api/user/api-keys/shares/route");
    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      received: Array<{ grantorEmail: string }>;
    };
    expect(body.received[0]!.grantorEmail).toBe("(unknown)");
  });

  it("GET error path: a drizzle failure yields a generic 500, no raw leak", async () => {
    drizzleShouldThrow = true;
    const { GET } = await import("@/app/api/user/api-keys/shares/route");
    const res = await GET(getRequest());

    expect(res.status).toBe(500);
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("DB_FAILURE");
  });

  // ── POST ────────────────────────────────────────────────────────────────

  it("POST happy path: creates a share, persisting the grantee email lowercased", async () => {
    // own api-keys row — has an anthropic key configured.
    drizzleResults = [[{ userId: "user-test", anthropicKeyEncrypted: "v1:blob" }]];
    // findUserByEmail resolves the grantee (note mixed-case input email).
    rawSqlResults = [[{ id: "user-grantee", email: "Grantee@Example.test" }]];

    const { POST } = await import("@/app/api/user/api-keys/shares/route");
    const res = await POST(
      postRequest({ granteeEmail: "Grantee@Example.test", provider: "anthropic" }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.values).toMatchObject({
      // grantorId must come from the session, not the client.
      grantorId: "user-test",
      granteeId: "user-grantee",
      provider: "anthropic",
      granteeEmail: "grantee@example.test",
    });
  });

  it("POST validation: malformed JSON body -> 400", async () => {
    const { POST } = await import("@/app/api/user/api-keys/shares/route");
    const res = await POST(postRequest("{not valid json"));

    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({
      error: "Invalid request",
    });
    expect(insertCalls).toHaveLength(0);
  });

  it("POST validation: schema-invalid body (bad email) -> 400", async () => {
    const { POST } = await import("@/app/api/user/api-keys/shares/route");
    const res = await POST(
      postRequest({ granteeEmail: "not-an-email", provider: "anthropic" }),
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Invalid request",
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("POST validation: schema-invalid body (bad provider) -> 400", async () => {
    const { POST } = await import("@/app/api/user/api-keys/shares/route");
    const res = await POST(
      postRequest({ granteeEmail: "grantee@example.test", provider: "openai" }),
    );

    expect(res.status).toBe(400);
    expect(insertCalls).toHaveLength(0);
  });

  it("POST: 400 NO_OWN_KEY when the grantor lacks the requested key", async () => {
    drizzleResults = [[{ userId: "user-test", anthropicKeyEncrypted: null }]];

    const { POST } = await import("@/app/api/user/api-keys/shares/route");
    const res = await POST(
      postRequest({ granteeEmail: "grantee@example.test", provider: "anthropic" }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NO_OWN_KEY");
    expect(insertCalls).toHaveLength(0);
  });

  it("POST: 404 GRANTEE_NOT_FOUND when the grantee has no account", async () => {
    drizzleResults = [[{ userId: "user-test", groqKeyEncrypted: "v1:blob" }]];
    rawSqlResults = [[]]; // findUserByEmail finds nobody

    const { POST } = await import("@/app/api/user/api-keys/shares/route");
    const res = await POST(
      postRequest({ granteeEmail: "ghost@example.test", provider: "groq" }),
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("GRANTEE_NOT_FOUND");
    expect(insertCalls).toHaveLength(0);
  });

  it("POST: 400 when a user tries to share a key with themselves", async () => {
    drizzleResults = [[{ userId: "user-test", anthropicKeyEncrypted: "v1:blob" }]];
    rawSqlResults = [[{ id: "user-test", email: "test@example.test" }]];

    const { POST } = await import("@/app/api/user/api-keys/shares/route");
    const res = await POST(
      postRequest({ granteeEmail: "test@example.test", provider: "anthropic" }),
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(
      "yourself",
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("POST error path: a db failure yields a generic 500, no raw leak", async () => {
    drizzleShouldThrow = true;
    const { POST } = await import("@/app/api/user/api-keys/shares/route");
    const res = await POST(
      postRequest({ granteeEmail: "grantee@example.test", provider: "anthropic" }),
    );

    expect(res.status).toBe(500);
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("DB_FAILURE");
  });

  // ── DELETE ──────────────────────────────────────────────────────────────

  it("DELETE happy path: revokes a share for a valid granteeId + provider", async () => {
    const { DELETE } = await import("@/app/api/user/api-keys/shares/route");
    const res = await DELETE(
      deleteRequest("granteeId=user-bob&provider=anthropic"),
    );

    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toEqual({ ok: true });
    expect(deleteCount).toBe(1);
  });

  it("DELETE validation: missing granteeId -> 400", async () => {
    const { DELETE } = await import("@/app/api/user/api-keys/shares/route");
    const res = await DELETE(deleteRequest("provider=anthropic"));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "granteeId query param is required",
    );
    expect(deleteCount).toBe(0);
  });

  it("DELETE validation: missing/invalid provider -> 400", async () => {
    const { DELETE } = await import("@/app/api/user/api-keys/shares/route");
    const res = await DELETE(deleteRequest("granteeId=user-bob&provider=openai"));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(
      "provider",
    );
    expect(deleteCount).toBe(0);
  });

  it("DELETE error path: a db failure yields a generic 500, no raw leak", async () => {
    drizzleShouldThrow = true;
    const { DELETE } = await import("@/app/api/user/api-keys/shares/route");
    const res = await DELETE(deleteRequest("granteeId=user-bob&provider=groq"));

    expect(res.status).toBe(500);
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain("postgres://");
  });
});
