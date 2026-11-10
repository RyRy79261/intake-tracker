/**
 * Tool-layer behaviour of the MCP connector: input validation, error
 * reporting, argument plumbing and the tool-set/consent contract.
 *
 * Runs a real McpServer and Client over the SDK's in-memory transport so the
 * SDK's own Zod validation is exercised. The query layer is mocked (it is
 * covered against real Postgres in mcp-queries.integration.test.ts).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { McpServer, InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";

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
  queryDefecationHistory: vi.fn(),
  queryJournal: vi.fn(),
  getProfile: vi.fn(),
  listInsightReports: vi.fn(),
}));
vi.mock("@/lib/mcp/queries", () => queries);

const writes = vi.hoisted(() => ({
  logFood: vi.fn(),
  logDrink: vi.fn(),
  deleteLoggedEntry: vi.fn(),
}));
vi.mock("@/lib/mcp/writes", () => writes);

const recordWrites = vi.hoisted(() => ({
  logSodium: vi.fn(),
  logWeight: vi.fn(),
  logBloodPressure: vi.fn(),
  logEstimate: vi.fn(),
  addJournalEntry: vi.fn(),
  deleteLoggedRecord: vi.fn(),
}));
vi.mock("@/lib/mcp/record-writes", () => recordWrites);

const medicationWrites = vi.hoisted(() => ({
  logDose: vi.fn(),
  logExtraMedicine: vi.fn(),
  refillStock: vi.fn(),
  deleteMedicationRecord: vi.fn(),
}));
vi.mock("@/lib/mcp/medication-writes", () => medicationWrites);

const writeMcpAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mcp/audit", () => ({ writeMcpAudit }));

import { registerReadOnlyTools, registerWriteTools } from "@/lib/mcp/tools";
import { MCP_TOOL_NAMES } from "@/lib/mcp/tool-catalog";

const DAY_MS = 24 * 60 * 60_000;

const READ_WRITE = ["intake-tracker:read", "intake-tracker:write", "intake-tracker:journal"];

async function connect(scopes: string[] = READ_WRITE): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerReadOnlyTools(server);
  registerWriteTools(server);
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
        scopes,
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
  for (const fn of Object.values(writes)) fn.mockReset().mockResolvedValue({});
  for (const fn of Object.values(recordWrites)) fn.mockReset().mockResolvedValue({});
  for (const fn of Object.values(medicationWrites)) fn.mockReset().mockResolvedValue({});
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

  it("uses the app's salt → sodium factor and names the entered-source fields", async () => {
    const { tools } = await client.listTools();
    const summary = tools.find((t) => t.name === "get_today_summary")!;
    const history = tools.find((t) => t.name === "query_intake_history")!;
    for (const t of [summary, history]) {
      expect(t.description).toContain("1 g salt is about 393 mg sodium");
      expect(t.description).not.toContain("400 mg");
    }
    expect(history.description).toMatch(/sodiumSource/);
    expect(history.description).toMatch(/MSG/);
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

const GROUP_ID = "6f1c1f9e-3a3c-4c9b-9d3e-2f6a8b1c0d4e";

describe("MCP tools — log tools", () => {
  it("logs the portion eaten, with nutrients mapped to the write layer", async () => {
    const res = await client.callTool({
      name: "log_food",
      arguments: {
        description: "Chicken laksa, 1 bowl",
        grams: 450,
        water_ml: 300,
        sodium_mg: 1200,
        sugar_g: 6,
        potassium_mg: 500,
        consumed_at_ms: Date.now() - 60_000,
        timezone: "Europe/Berlin",
      },
    });
    expect(res.isError).toBeFalsy();
    expect(writes.logFood).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        description: "Chicken laksa, 1 bowl",
        grams: 450,
        waterMl: 300,
        sodiumMg: 1200,
        sugarG: 6,
        potassiumMg: 500,
        timezone: "Europe/Berlin",
      }),
    );
  });

  it("defaults the time to now", async () => {
    const before = Date.now();
    await client.callTool({ name: "log_food", arguments: { description: "Toast" } });
    const ts = writes.logFood.mock.calls[0]![1].timestamp as number;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  it("keeps the free-text description out of the audit log", async () => {
    await client.callTool({
      name: "log_food",
      arguments: { description: "Something private", grams: 100 },
    });
    const event = writeMcpAudit.mock.calls[0]![0];
    expect(event.status).toBe("success");
    expect(JSON.stringify(event.argsForAudit)).not.toContain("private");
    expect(event.argsForAudit).toEqual({ grams: 100 });
  });

  it("refuses a time in the future", async () => {
    const res = await client.callTool({
      name: "log_food",
      arguments: { description: "Toast", consumed_at_ms: Date.now() + DAY_MS },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/future/);
    expect(writes.logFood).not.toHaveBeenCalled();
  });

  it("refuses values outside the app's ranges", async () => {
    const res = await client.callTool({
      name: "log_food",
      arguments: { description: "Toast", sodium_mg: 50_000 },
    });
    expect(res.isError).toBe(true);
    expect(writes.logFood).not.toHaveBeenCalled();
  });

  it("logs a drink with caffeine and alcohol", async () => {
    const res = await client.callTool({
      name: "log_drink",
      arguments: { description: "Irish coffee", volume_ml: 250, caffeine_mg: 80, abv_percent: 10 },
    });
    expect(res.isError).toBeFalsy();
    expect(writes.logDrink).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ volumeMl: 250, caffeineMg: 80, abvPercent: 10 }),
    );
  });

  it("explains why an entry the user logged can't be deleted", async () => {
    writes.deleteLoggedEntry.mockResolvedValue({
      deleted: false,
      reason: "not_connector_entry",
    });
    const res = await client.callTool({
      name: "delete_logged_entry",
      arguments: { group_id: GROUP_ID },
    });
    expect(writes.deleteLoggedEntry).toHaveBeenCalledWith("user-1", GROUP_ID);
    expect(textOf(res)).toMatch(/logged in the app/);
  });

  it("asks a read-only connection to reconnect instead of writing", async () => {
    const readOnly = await connect(["intake-tracker:read"]);
    for (const [name, args] of [
      ["log_food", { description: "Toast" }],
      ["log_drink", { description: "Water", volume_ml: 250 }],
      ["delete_logged_entry", { group_id: GROUP_ID }],
    ] as const) {
      const res = await readOnly.callTool({ name, arguments: args });
      expect(res.isError).toBe(true);
      expect(textOf(res)).toMatch(/connect it again/);
    }
    expect(writes.logFood).not.toHaveBeenCalled();
    expect(writes.logDrink).not.toHaveBeenCalled();
    expect(writes.deleteLoggedEntry).not.toHaveBeenCalled();
  });

  it("still lets a read-only connection read", async () => {
    const readOnly = await connect(["intake-tracker:read"]);
    const res = await readOnly.callTool({ name: "get_today_summary", arguments: {} });
    expect(res.isError).toBeFalsy();
  });

  it("refuses to read for a write-only grant", async () => {
    const writeOnly = await connect(["intake-tracker:write"]);
    const res = await writeOnly.callTool({ name: "get_today_summary", arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/not granted read access/);
    expect(queries.getTodaySummary).not.toHaveBeenCalled();
  });

  it("marks logging as additive and delete as destructive", async () => {
    const { tools } = await client.listTools();
    const hints = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    expect(hints.log_food).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(hints.log_drink).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(hints.delete_logged_entry).toMatchObject({ destructiveHint: true, idempotentHint: true });
  });
});

describe("MCP tools — readings and journal", () => {
  it("converts nothing itself: log_sodium passes what the user added", async () => {
    await client.callTool({ name: "log_sodium", arguments: { amount: 2, unit: "g", source: "salt", note: "on chips" } });
    expect(recordWrites.logSodium).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ amount: 2, unit: "g", source: "salt", note: "on chips" }),
    );
    const audit = writeMcpAudit.mock.calls.at(-1)![0] as { argsForAudit: Record<string, unknown> };
    expect(audit.argsForAudit).not.toHaveProperty("note");
  });

  it("refuses sodium outside the voice range", async () => {
    const res = await client.callTool({ name: "log_sodium", arguments: { amount: 100, unit: "g", source: "sodium" } });
    expect(res.isError).toBe(true);
    expect(recordWrites.logSodium).not.toHaveBeenCalled();
  });

  it("refuses a blood pressure whose systolic is not above diastolic", async () => {
    const res = await client.callTool({ name: "log_blood_pressure", arguments: { systolic: 80, diastolic: 90 } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/systolic must be higher/);
  });

  it("requires an amount for urination but not for defecation", async () => {
    expect((await client.callTool({ name: "log_urination", arguments: {} })).isError).toBe(true);
    await client.callTool({ name: "log_defecation", arguments: {} });
    expect(recordWrites.logEstimate).toHaveBeenCalledWith("user-1", "defecation", expect.any(Object));
  });

  it("keeps the journal's words out of the audit log", async () => {
    await client.callTool({
      name: "add_journal_entry",
      arguments: { words: "Chest felt tight on the stairs", kind: "symptom", places: ["chest"], severity: 6 },
    });
    const audit = writeMcpAudit.mock.calls.at(-1)![0] as { argsForAudit: Record<string, unknown> };
    expect(JSON.stringify(audit.argsForAudit)).not.toMatch(/tight|stairs/);
    expect(audit.argsForAudit).toMatchObject({ kind: "symptom", severity: 6, places: 1 });
  });

  it("lists every body place id in the journal tool's description", async () => {
    const { tools } = await client.listTools();
    const t = tools.find((x) => x.name === "add_journal_entry")!;
    expect(t.description).toContain("knee-l");
    expect(t.description).toContain("whole");
  });

  it("routes delete_logged_record by kind", async () => {
    const id = "6f1c2a8e-5b7d-4c3a-9e2f-1a2b3c4d5e6f";
    recordWrites.deleteLoggedRecord.mockResolvedValue({ deleted: false, reason: "not_connector_entry" });
    const res = await client.callTool({ name: "delete_logged_record", arguments: { kind: "weight", id } });
    expect(recordWrites.deleteLoggedRecord).toHaveBeenCalledWith("user-1", "weight", id);
    expect(textOf(res)).toMatch(/logged in the app/);
    await client.callTool({ name: "delete_logged_record", arguments: { kind: "stock_refill", id } });
    expect(medicationWrites.deleteMedicationRecord).toHaveBeenCalledWith("user-1", "stock_refill", id);
  });

  it("needs the write scope for every log tool", async () => {
    const readOnly = await connect(["intake-tracker:read"]);
    const res = await readOnly.callTool({ name: "log_weight", arguments: { weight_kg: 80 } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/can only read/);
    expect(recordWrites.logWeight).not.toHaveBeenCalled();
  });
});

describe("MCP tools — the journal needs its own grant", () => {
  it("asks a connection approved before the journal scope to reconnect", async () => {
    const old = await connect(["intake-tracker:read", "intake-tracker:write"]);
    for (const [name, args] of [
      ["query_journal", { start_ms: 0, end_ms: DAY_MS }],
      ["add_journal_entry", { words: "Sore knee", kind: "symptom" }],
      ["delete_logged_record", { kind: "journal_entry", id: "6f1c2a8e-5b7d-4c3a-9e2f-1a2b3c4d5e6f" }],
    ] as const) {
      const res = await old.callTool({ name, arguments: args });
      expect(res.isError, name).toBe(true);
      expect(textOf(res)).toMatch(/medical journal/);
    }
    expect(queries.queryJournal).not.toHaveBeenCalled();
    expect(recordWrites.addJournalEntry).not.toHaveBeenCalled();
    expect(recordWrites.deleteLoggedRecord).not.toHaveBeenCalled();

    // Other records still delete without it.
    await old.callTool({ name: "delete_logged_record", arguments: { kind: "weight", id: "6f1c2a8e-5b7d-4c3a-9e2f-1a2b3c4d5e6f" } });
    expect(recordWrites.deleteLoggedRecord).toHaveBeenCalled();
  });

  it("keeps a failed query's parameters out of the audit row", async () => {
    const err = new Error('Failed query: insert into "weight_records" values ($1)\nparams: 80,feeling dizzy');
    recordWrites.logWeight.mockRejectedValue(err);
    const res = await client.callTool({ name: "log_weight", arguments: { weight_kg: 80, note: "feeling dizzy" } });
    expect(textOf(res)).toMatch(/internal error/);
    const audit = writeMcpAudit.mock.calls.at(-1)![0] as { errorMessage: string };
    expect(audit.errorMessage).toContain("Failed query");
    expect(audit.errorMessage).not.toMatch(/dizzy/);
  });
});
