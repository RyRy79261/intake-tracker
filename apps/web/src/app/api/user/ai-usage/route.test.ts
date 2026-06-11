/**
 * Tests for GET /api/user/ai-usage.
 *
 * Strategy (mirrors src/__tests__/sync-push-route.test.ts):
 *   - Mock @/lib/auth-middleware so withAuth is a pass-through HOF that
 *     injects a fixed auth context. The real withAuth lets handler errors
 *     bubble to Next.js, which renders a generic 500; the mock reproduces
 *     that by catching and returning a generic 500 so the error path is
 *     testable in isolation.
 *   - Mock @intake/db/client with a controllable stub `db` whose chained
 *     select()/from()/where()/groupBy() resolves to per-test rows.
 *   - Mock @neondatabase/serverless's `neon` so the raw-SQL "asGrantor"
 *     query returns controllable rows without a real database.
 *   - Dynamically import the route AFTER mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Controllable stubs ───────────────────────────────────────────────────

// Each db.select(...) call shifts one result off this queue, in route order:
//   1) mineByProvider, 2) mineByRoute
let drizzleResults: unknown[][] = [];
let drizzleShouldThrow = false;

// Rows returned by the raw `neon` tagged-template query (asGrantor).
let rawSqlRows: unknown[] = [];
let rawSqlShouldThrow = false;

function resetState() {
  drizzleResults = [];
  drizzleShouldThrow = false;
  rawSqlRows = [];
  rawSqlShouldThrow = false;
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

vi.mock("@intake/db/client", () => {
  // Chainable builder: select().from().where().groupBy() -> Promise<rows>.
  function makeChain() {
    const chain: Record<string, unknown> = {};
    const step = () => chain;
    chain.from = step;
    chain.where = step;
    chain.groupBy = () => {
      if (drizzleShouldThrow) {
        return Promise.reject(new Error("DB_SECRET_CONNECTION_STRING leaked"));
      }
      return Promise.resolve(drizzleResults.shift() ?? []);
    };
    return chain;
  }
  return {
    db: {
      select: () => makeChain(),
    },
  };
});

vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    // The route invokes neon(...) as a tagged template literal.
    return async () => {
      if (rawSqlShouldThrow) {
        throw new Error("raw pg connection failed: postgres://secret");
      }
      return rawSqlRows;
    };
  },
}));

function makeRequest(url = "https://example.test/api/user/ai-usage"): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("GET /api/user/ai-usage", () => {
  beforeEach(() => {
    resetState();
    process.env.DATABASE_URL = "postgres://test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: returns aggregated mine + asGrantor with correct shape", async () => {
    drizzleResults = [
      // mineByProvider
      [
        {
          provider: "anthropic",
          calls: 5,
          inputTokens: 1200,
          outputTokens: 800,
          cacheReadTokens: 0,
          cacheCreateTokens: 0,
          audioSeconds: 0,
        },
      ],
      // mineByRoute
      [
        {
          route: "/api/ai/parse",
          provider: "anthropic",
          calls: 5,
          inputTokens: 1200,
          outputTokens: 800,
        },
      ],
    ];
    rawSqlRows = [
      {
        grantee_id: "user-bob",
        grantee_email: "bob@example.test",
        provider: "anthropic",
        calls: 3,
        input_tokens: 90,
        output_tokens: 40,
        audio_seconds: 0,
      },
    ];

    const { GET } = await import("@/app/api/user/ai-usage/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      windowDays: number;
      mine: { byProvider: unknown[]; byRoute: unknown[] };
      asGrantor: { byGrantee: Array<Record<string, unknown>> };
    };
    expect(body.windowDays).toBe(30); // default window
    expect(body.mine.byProvider).toHaveLength(1);
    expect(body.mine.byRoute).toHaveLength(1);
    expect(body.asGrantor.byGrantee).toEqual([
      {
        granteeId: "user-bob",
        granteeEmail: "bob@example.test",
        provider: "anthropic",
        calls: 3,
        inputTokens: 90,
        outputTokens: 40,
        audioSeconds: 0,
      },
    ]);
  });

  it("clamps the ?days window to the 1..365 range", async () => {
    drizzleResults = [[], []];
    rawSqlRows = [];

    const { GET } = await import("@/app/api/user/ai-usage/route");

    const tooBig = await GET(
      makeRequest("https://example.test/api/user/ai-usage?days=99999"),
    );
    expect(tooBig.status).toBe(200);
    expect(((await tooBig.json()) as { windowDays: number }).windowDays).toBe(365);

    drizzleResults = [[], []];
    const tooSmall = await GET(
      makeRequest("https://example.test/api/user/ai-usage?days=0"),
    );
    expect(((await tooSmall.json()) as { windowDays: number }).windowDays).toBe(1);

    drizzleResults = [[], []];
    const garbage = await GET(
      makeRequest("https://example.test/api/user/ai-usage?days=abc"),
    );
    // Non-finite -> falls back to default 30.
    expect(((await garbage.json()) as { windowDays: number }).windowDays).toBe(30);
  });

  it("maps a null grantee email to a safe placeholder", async () => {
    drizzleResults = [[], []];
    rawSqlRows = [
      {
        grantee_id: "user-ghost",
        grantee_email: null,
        provider: "groq",
        calls: 1,
        input_tokens: 0,
        output_tokens: 0,
        audio_seconds: 12,
      },
    ];

    const { GET } = await import("@/app/api/user/ai-usage/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      asGrantor: { byGrantee: Array<{ granteeEmail: string }> };
    };
    expect(body.asGrantor.byGrantee[0]!.granteeEmail).toBe("(unknown)");
  });

  it("error path: a drizzle failure yields a generic 500, no raw error leak", async () => {
    drizzleShouldThrow = true;

    const { GET } = await import("@/app/api/user/ai-usage/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("DB_SECRET_CONNECTION_STRING");
    expect(serialized).not.toContain("stack");
  });

  it("error path: a raw-SQL failure also yields a generic 500", async () => {
    drizzleResults = [[], []];
    rawSqlShouldThrow = true;

    const { GET } = await import("@/app/api/user/ai-usage/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain("postgres://secret");
  });
});
