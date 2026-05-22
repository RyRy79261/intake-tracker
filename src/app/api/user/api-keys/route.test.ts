/**
 * Tests for /api/user/api-keys (GET / PUT / DELETE).
 *
 * Strategy (mirrors src/__tests__/sync-push-route.test.ts):
 *   - Mock @/lib/auth-middleware so withAuth is a pass-through HOF injecting
 *     a fixed auth context. It also catches handler errors and renders a
 *     generic 500 — the route has no try/catch, so this reproduces the
 *     Next.js runtime's behaviour for an uncaught error.
 *   - Mock @/lib/drizzle with a controllable stub `db`: select() returns
 *     queued rows; insert()/update() capture their payloads.
 *   - The encryption layer (key-vault.ts) runs for real, so we set
 *     API_KEY_ENCRYPTION_SECRET. A test asserts the raw key is never
 *     returned — only `last4`.
 *   - Dynamically import the route AFTER mocks are registered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Controllable stubs ───────────────────────────────────────────────────

// Row returned by db.select()...limit(1) — the caller's stored key row.
let selectRow: Record<string, unknown> | undefined;
let dbShouldThrow = false;

const insertCalls: { values: Record<string, unknown>; set: Record<string, unknown> }[] = [];
const updateCalls: { set: Record<string, unknown> }[] = [];

function resetState() {
  selectRow = undefined;
  dbShouldThrow = false;
  insertCalls.length = 0;
  updateCalls.length = 0;
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
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            if (dbShouldThrow) {
              return Promise.reject(
                new Error("DB_FAILURE postgres://user:pw@host/db"),
              );
            }
            return Promise.resolve(selectRow ? [selectRow] : []);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          if (dbShouldThrow) throw new Error("DB_FAILURE postgres://secret");
          insertCalls.push({ values, set });
          return undefined;
        },
      }),
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          if (dbShouldThrow) throw new Error("DB_FAILURE postgres://secret");
          updateCalls.push({ set });
          return undefined;
        },
      }),
    }),
  };
  return { db };
});

const BASE = "https://example.test/api/user/api-keys";

function putRequest(body: unknown): NextRequest {
  return new NextRequest(BASE, {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function deleteRequest(provider?: string): NextRequest {
  const url = provider ? `${BASE}?provider=${provider}` : BASE;
  return new NextRequest(url, { method: "DELETE" });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("/api/user/api-keys", () => {
  beforeEach(() => {
    resetState();
    // 32 bytes base64 -> valid AES-256 master key for real encryption.
    process.env.API_KEY_ENCRYPTION_SECRET = Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── GET ────────────────────────────────────────────────────────────────

  it("GET: returns null providers when no row is stored", async () => {
    selectRow = undefined;
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(BASE, { method: "GET" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { anthropic: unknown; groq: unknown };
    expect(body.anthropic).toBeNull();
    expect(body.groq).toBeNull();
  });

  it("GET: exposes only configured + last4, never the encrypted blob", async () => {
    selectRow = {
      userId: "user-test",
      anthropicKeyEncrypted: "v1:aaa:bbb:ccc-SUPER-SECRET-CIPHERTEXT",
      anthropicLast4: "AB12",
      groqKeyEncrypted: null,
      groqLast4: null,
    };
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(BASE, { method: "GET" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      anthropic: { configured: boolean; last4: string } | null;
      groq: unknown;
    };
    expect(body.anthropic).toEqual({ configured: true, last4: "AB12" });
    expect(body.groq).toBeNull();
    // The encrypted ciphertext must never appear in the response.
    expect(JSON.stringify(body)).not.toContain("SUPER-SECRET-CIPHERTEXT");
  });

  // ── PUT ────────────────────────────────────────────────────────────────

  it("PUT happy path: stores an anthropic key and returns only last4", async () => {
    const rawKey = "sk-ant-api03-REALSECRETVALUE9999";
    const { PUT } = await import("./route");
    const res = await PUT(putRequest({ provider: "anthropic", key: rawKey }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean; last4: string };
    expect(body).toEqual({ configured: true, last4: "9999" });

    // CRITICAL: the raw key must never be returned to the client.
    expect(JSON.stringify(body)).not.toContain(rawKey);
    expect(JSON.stringify(body)).not.toContain("REALSECRETVALUE");

    // What is persisted must be the encrypted blob, not the plaintext key.
    expect(insertCalls).toHaveLength(1);
    const persisted = insertCalls[0]!.values;
    expect(persisted.anthropicKeyEncrypted).toMatch(/^v1:/);
    expect(persisted.anthropicKeyEncrypted).not.toContain(rawKey);
    expect(persisted.anthropicKeyEncrypted).not.toContain("REALSECRETVALUE");
    expect(persisted.anthropicLast4).toBe("9999");
    // The persisted userId must come from the session, not the client.
    expect(persisted.userId).toBe("user-test");
  });

  it("PUT validation: malformed JSON body -> 400", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(putRequest("{not valid json"));

    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({
      error: "Invalid request",
    });
    expect(insertCalls).toHaveLength(0);
  });

  it("PUT validation: schema-invalid body (bad provider) -> 400", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      putRequest({ provider: "openai", key: "sk-ant-longenough" }),
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "Invalid request",
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("PUT validation: too-short key -> 400 (zod min(8))", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(putRequest({ provider: "groq", key: "short" }));

    expect(res.status).toBe(400);
    expect(insertCalls).toHaveLength(0);
  });

  it("PUT validation: anthropic key with wrong prefix -> 400 format error", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      putRequest({ provider: "anthropic", key: "gsk_wrongprefixkey" }),
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(
      "sk-ant-",
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("PUT: missing encryption secret -> 503, key not persisted", async () => {
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    const { PUT } = await import("./route");
    const res = await PUT(
      putRequest({ provider: "groq", key: "gsk_validlookingkey12345" }),
    );

    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /encryption/i,
    );
    expect(insertCalls).toHaveLength(0);
  });

  // ── DELETE ───────────────────────────────────────────────────────────────

  it("DELETE happy path: clears the requested provider key", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE(deleteRequest("anthropic"));

    expect(res.status).toBe(200);
    expect((await res.json()) as { configured: boolean }).toEqual({
      configured: false,
    });
    expect(updateCalls).toHaveLength(1);
    // The cleared columns are set to SQL NULL.
    expect(updateCalls[0]!.set).toHaveProperty("anthropicKeyEncrypted");
    expect(updateCalls[0]!.set).toHaveProperty("anthropicLast4");
  });

  it("DELETE validation: missing/invalid provider query param -> 400", async () => {
    const { DELETE } = await import("./route");

    const missing = await DELETE(deleteRequest());
    expect(missing.status).toBe(400);

    const bad = await DELETE(deleteRequest("openai"));
    expect(bad.status).toBe(400);

    expect(updateCalls).toHaveLength(0);
  });

  // ── Error path ───────────────────────────────────────────────────────────

  it("error path: a db failure on PUT yields a generic 500, no raw leak", async () => {
    dbShouldThrow = true;
    const { PUT } = await import("./route");
    const res = await PUT(
      putRequest({ provider: "anthropic", key: "sk-ant-api03-validkey1234" }),
    );

    expect(res.status).toBe(500);
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("DB_FAILURE");
  });

  it("error path: a db failure on GET yields a generic 500, no raw leak", async () => {
    dbShouldThrow = true;
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(BASE, { method: "GET" }));

    expect(res.status).toBe(500);
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain("postgres://");
  });
});
