/**
 * Tool-layer behaviour of the MCP connector: input validation, error
 * reporting, argument plumbing and the tool-set/consent contract.
 *
 * Runs a real McpServer and Client over the SDK's in-memory transport so the
 * SDK's own Zod validation is exercised. The query layer is mocked (it is
 * covered against real Postgres in mcp-queries.integration.test.ts).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const queries = vi.hoisted(() => ({
  getTodaySummary: vi.fn(),
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
vi.mock("@/lib/mcp/queries", () => queries);

const writeMcpAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mcp/audit", () => ({ writeMcpAudit }));

import { registerReadOnlyTools } from "@/lib/mcp/tools";
import { MCP_TOOL_NAMES } from "@/lib/mcp/tool-catalog";

const DAY_MS = 24 * 60 * 60_000;

async function connect(): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerReadOnlyTools(server);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  // Every client message carries the auth context withMcpAuth would set.
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) =>
    send(message, {
      ...options,
      authInfo: {
        token: "t",
        clientId: "client-1",
        scopes: [],
        extra: { userId: "user-1", clientId: "client-1" },
      },
    });
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content.map((c) => c.text).join("\n");
}

let client: Client;

beforeEach(async () => {
  for (const fn of Object.values(queries)) fn.mockReset().mockResolvedValue({});
  writeMcpAudit.mockReset();
  client = await connect();
});

describe("MCP tools — tool set", () => {
  it("registers exactly the tools the consent screen describes", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  it("describes the salt-typed intake as sodium mg", async () => {
    const { tools } = await client.listTools();
    const summary = tools.find((t) => t.name === "get_today_summary")!;
    expect(summary.description).toMatch(/sodium_mg/);
    expect(summary.description).not.toMatch(/salt_mg|water\/salt/);
    const history = tools.find((t) => t.name === "query_intake_history")!;
    expect(history.description).toMatch(/sodium/i);
  });
});

describe("MCP tools — input validation errors reach the model verbatim", () => {
  it("explains the 1-year range limit instead of reporting an internal error", async () => {
    const res = await client.callTool({
      name: "query_weight_history",
      arguments: { start_ms: 0, end_ms: 730 * DAY_MS },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/1 year/);
    expect(textOf(res)).not.toMatch(/internal error/i);
    expect(queries.queryWeightHistory).not.toHaveBeenCalled();
  });

  it("explains an inverted range", async () => {
    const res = await client.callTool({
      name: "query_intake_history",
      arguments: { type: "water", start_ms: 10 * DAY_MS, end_ms: DAY_MS },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/end_ms must be >= start_ms/);
  });

  it("rejects an unknown timezone with a readable message", async () => {
    const res = await client.callTool({
      name: "get_today_summary",
      arguments: { timezone: "Mars/Olympus" },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/IANA time zone/);
    expect(queries.getTodaySummary).not.toHaveBeenCalled();
  });

  it("still hides internal failures behind a generic message", async () => {
    queries.queryWeightHistory.mockRejectedValue(
      new Error('relation "weight_records" does not exist'),
    );
    const res = await client.callTool({
      name: "query_weight_history",
      arguments: { start_ms: 0, end_ms: DAY_MS },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(
      "An internal error occurred while processing your request.",
    );
    expect(writeMcpAudit).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" }),
    );
  });
});

describe("MCP tools — argument plumbing", () => {
  it("passes an explicit timezone through to get_today_summary", async () => {
    await client.callTool({
      name: "get_today_summary",
      arguments: { timezone: "Europe/Berlin" },
    });
    expect(queries.getTodaySummary).toHaveBeenCalledWith("user-1", {
      timezone: "Europe/Berlin",
    });
  });

  it("accepts sodium, and the legacy salt name, for intake history", async () => {
    for (const type of ["sodium", "salt"]) {
      queries.queryIntakeHistory.mockClear();
      const res = await client.callTool({
        name: "query_intake_history",
        arguments: { type, start_ms: 0, end_ms: DAY_MS },
      });
      expect(res.isError).toBeFalsy();
      expect(queries.queryIntakeHistory).toHaveBeenCalledWith(
        "user-1",
        "sodium",
        { start: 0, end: DAY_MS },
      );
    }
  });
});
