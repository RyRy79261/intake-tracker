/**
 * HTTP wiring of the MCP endpoint on mcp-handler 2 / MCP SDK v2.
 *
 * tools.test.ts drives the tools over the SDK's in-memory transport; this
 * drives the real route handler with real `Request`s, so it pins what that
 * cannot: the `[transport]` guard, the bearer / whitelist gates, and that the
 * verified token reaches the tools as `ctx.http.authInfo` for a 2025-era
 * Streamable HTTP client (what claude.ai connectors speak), served by the
 * SDK's legacy fallback.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const lookupAccessToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mcp/oauth", () => ({ lookupAccessToken }));

const isEmailAllowed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mcp/whitelist", () => ({ isEmailAllowed }));

// checkWhitelist's `db.select().from().where().limit()` chain.
vi.mock("@intake/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ email: "owner@example.com" }] }),
      }),
    }),
  },
}));

const getTodaySummary = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mcp/queries", () => ({
  getTodaySummary,
  queryIntakeHistory: vi.fn(),
  queryWeightHistory: vi.fn(),
  queryBloodPressureHistory: vi.fn(),
  queryEatingHistory: vi.fn(),
  querySubstanceHistory: vi.fn(),
  queryUrinationHistory: vi.fn(),
  listMedications: vi.fn(),
  listTitrationPlans: vi.fn(),
  listRecentDoses: vi.fn(),
  getInventoryStatus: vi.fn(),
}));
vi.mock("@/lib/mcp/audit", () => ({ writeMcpAudit: vi.fn() }));

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { GET, POST, DELETE } from "@/app/api/mcp/[transport]/route";
import { MCP_TOOL_NAMES } from "@/lib/mcp/tool-catalog";

const LEGACY_PROTOCOL = "2025-06-18";

function rpc(
  body: Record<string, unknown>,
  { transport = "mcp", token = "valid-token" }: { transport?: string; token?: string | null } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": LEGACY_PROTOCOL,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const request = new Request(`https://intake.example/api/mcp/${transport}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", ...body }),
  });
  return POST(request, { params: Promise.resolve({ transport }) });
}

interface RpcResult {
  serverInfo: { name: string };
  tools: Array<{ name: string }>;
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

/** The JSON-RPC message in a JSON or single-event SSE response body. */
async function message(res: Response): Promise<{ result: RpcResult; error?: unknown }> {
  const text = await res.text();
  const data = text.trimStart().startsWith("{")
    ? text
    : text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
  return JSON.parse(data);
}

beforeEach(() => {
  lookupAccessToken.mockReset().mockImplementation(async (token: string) =>
    token === "valid-token"
      ? {
          userId: "user-1",
          clientId: "client-1",
          scope: "mcp:read",
          expiresAt: Date.now() + 60 * 60_000,
        }
      : null,
  );
  isEmailAllowed.mockReset().mockReturnValue(true);
  getTodaySummary.mockReset().mockResolvedValue({ water_ml: 1200 });
});

describe("MCP route — gates", () => {
  it("serves only the /api/mcp/mcp segment", async () => {
    const res = await rpc({ id: 1, method: "tools/list", params: {} }, { transport: "sse" });
    expect(res.status).toBe(404);
  });

  it("answers 401 with a WWW-Authenticate challenge without a bearer", async () => {
    const res = await rpc({ id: 1, method: "tools/list", params: {} }, { token: null });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate") ?? "").toMatch(/Bearer/);
  });

  it("answers 401 for an unknown token", async () => {
    const res = await rpc({ id: 1, method: "tools/list", params: {} }, { token: "nope" });
    expect(res.status).toBe(401);
  });

  it("answers 403 when the token is valid but the user left the whitelist", async () => {
    isEmailAllowed.mockReturnValue(false);
    const res = await rpc({ id: 1, method: "tools/list", params: {} });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden" });
  });
});

describe("MCP route — 2025-era Streamable HTTP client (legacy fallback)", () => {
  it("initializes", async () => {
    const res = await rpc({
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LEGACY_PROTOCOL,
        capabilities: {},
        clientInfo: { name: "route-test", version: "1.0.0" },
      },
    });
    expect(res.status).toBe(200);
    const msg = await message(res);
    expect(msg.error).toBeUndefined();
    expect(msg.result.serverInfo.name).toBe("intake-tracker");
  });

  it("lists exactly the read-only tools", async () => {
    const res = await rpc({ id: 2, method: "tools/list", params: {} });
    expect(res.status).toBe(200);
    const names = (await message(res)).result.tools.map((t) => t.name);
    expect(names.sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  it("hands the verified token's user to the tool", async () => {
    const res = await rpc({
      id: 3,
      method: "tools/call",
      params: { name: "get_today_summary", arguments: { timezone: "Europe/Berlin" } },
    });
    expect(res.status).toBe(200);
    const msg = await message(res);
    expect(msg.result.isError).toBeFalsy();
    expect(getTodaySummary).toHaveBeenCalledWith("user-1", { timezone: "Europe/Berlin" });
    expect(msg.result.content[0]?.text).toContain("1200");
  });
});

describe("MCP route — current SDK client (2026-07-28 protocol)", () => {
  it("connects, lists tools and calls one with the verified user", async () => {
    const methods = { GET, POST, DELETE } as const;
    const fetchIntoRoute = async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      const headers = new Headers(request.headers);
      headers.set("authorization", "Bearer valid-token");
      const handler = methods[request.method as keyof typeof methods];
      if (!handler) return new Response(null, { status: 405 });
      return handler(new Request(request, { headers }), {
        params: Promise.resolve({ transport: "mcp" }),
      });
    };
    // The v2 client defaults to the 2025 (legacy) sequence; pin the modern era
    // so this exercises the 2026-07-28 path rather than the legacy fallback.
    const client = new Client(
      { name: "route-test", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL("https://intake.example/api/mcp/mcp"), {
        fetch: fetchIntoRoute,
      }),
    );
    expect(client.getProtocolEra()).toBe("modern");
    expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());

    const res = await client.callTool({ name: "get_today_summary", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(getTodaySummary).toHaveBeenCalledWith("user-1", { timezone: undefined });
    await client.close();
  });
});
