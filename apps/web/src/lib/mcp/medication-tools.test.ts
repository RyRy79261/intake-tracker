/**
 * Tool layer of the MCP medication writes: input validation, the write
 * scope, argument plumbing, refusals passed through as data, and audit args
 * that never carry free text. The writes are mocked (covered against real
 * Postgres in mcp-medication-writes.integration.test.ts).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { McpServer, InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";

const writes = vi.hoisted(() => ({
  logDose: vi.fn(),
  logExtraMedicine: vi.fn(),
  refillStock: vi.fn(),
}));
vi.mock("@/lib/mcp/medication-writes", () => writes);

const writeMcpAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mcp/audit", () => ({ writeMcpAudit }));

import { registerMedicationWriteTools } from "@/lib/mcp/medication-tools";

const READ_WRITE = ["intake-tracker:read", "intake-tracker:write"];

async function connect(scopes: string[] = READ_WRITE): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerMedicationWriteTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
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

/** The audit args of the last tool call. */
function lastAuditArgs(): Record<string, unknown> {
  const calls = writeMcpAudit.mock.calls;
  return (calls[calls.length - 1]![0] as { argsForAudit: Record<string, unknown> }).argsForAudit;
}

let client: Client;

beforeEach(async () => {
  for (const fn of Object.values(writes)) fn.mockReset().mockResolvedValue({ ok: true });
  writeMcpAudit.mockReset();
  client = await connect();
});

describe("medication tools — registration", () => {
  it("registers log_dose, log_extra_medicine and refill_stock as non-read-only tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["log_dose", "log_extra_medicine", "refill_stock"]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(false);
      expect(t.description).toMatch(/next time the app syncs/);
    }
    const logDose = tools.find((t) => t.name === "log_dose")!;
    expect(logDose.description).toMatch(/get_today_summary/);
    expect(logDose.description).toMatch(/list_medications/);
  });
});

describe("medication tools — validation", () => {
  it("rejects a malformed date and an unknown action before writing", async () => {
    const bad = await client.callTool({
      name: "log_dose",
      arguments: { schedule_id: "s1", date: "21/09/2026", action: "taken" },
    });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toMatch(/YYYY-MM-DD/);
    const action = await client.callTool({
      name: "log_dose",
      arguments: { schedule_id: "s1", date: "2026-09-21", action: "double" },
    });
    expect(action.isError).toBe(true);
    expect(writes.logDose).not.toHaveBeenCalled();
  });

  it("rejects a future taken time", async () => {
    const res = await client.callTool({
      name: "log_dose",
      arguments: { schedule_id: "s1", date: "2026-09-21", action: "taken", taken_at_ms: Date.now() + 86_400_000 },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/future/);
    expect(writes.logDose).not.toHaveBeenCalled();
  });

  it("needs a prescription_id or a medicine_name for an extra medicine", async () => {
    const res = await client.callTool({ name: "log_extra_medicine", arguments: { amount: 1, unit: "tablet" } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/prescription_id .* or medicine_name/);
    expect(writes.logExtraMedicine).not.toHaveBeenCalled();
  });

  it("bounds refill pills by the voice spec", async () => {
    for (const pills of [0, 10_001]) {
      const res = await client.callTool({ name: "refill_stock", arguments: { prescription_id: "p1", pills } });
      expect(res.isError).toBe(true);
    }
    expect(writes.refillStock).not.toHaveBeenCalled();
  });
});

describe("medication tools — scope", () => {
  it("refuses every medication write on a read-only grant", async () => {
    client = await connect(["intake-tracker:read"]);
    const calls = [
      { name: "log_dose", arguments: { schedule_id: "s1", date: "2026-09-21", action: "taken" } },
      { name: "log_extra_medicine", arguments: { medicine_name: "Paracetamol" } },
      { name: "refill_stock", arguments: { prescription_id: "p1", pills: 28 } },
    ];
    for (const call of calls) {
      const res = await client.callTool(call);
      expect(res.isError).toBe(true);
      expect(textOf(res)).toMatch(/can only read/);
    }
    for (const fn of Object.values(writes)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("medication tools — plumbing and audit", () => {
  it("passes log_dose args through and drops a reason that does not fit the action", async () => {
    await client.callTool({
      name: "log_dose",
      arguments: { schedule_id: "s1", date: "2026-09-21", action: "skipped", skip_reason: "Felt dizzy", taken_at_ms: Date.now() - 1000 },
    });
    expect(writes.logDose).toHaveBeenCalledWith("user-1", {
      scheduleId: "s1",
      date: "2026-09-21",
      action: "skipped",
      takenAt: undefined,
      skipReason: "Felt dizzy",
      timezone: undefined,
    });
    const audit = lastAuditArgs();
    expect(audit).toMatchObject({ schedule_id: "s1", date: "2026-09-21", action: "skipped" });
    expect(JSON.stringify(audit)).not.toMatch(/dizzy/i);
  });

  it("keeps the medicine name and note out of the audit", async () => {
    await client.callTool({
      name: "log_extra_medicine",
      arguments: { medicine_name: "Paracetamol", amount: 500, unit: "mg", note: "headache after lunch" },
    });
    expect(writes.logExtraMedicine).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ medicineName: "Paracetamol", amount: 500, unit: "mg", note: "headache after lunch" }),
    );
    const audit = JSON.stringify(lastAuditArgs());
    expect(audit).not.toMatch(/Paracetamol|headache/i);
    expect(lastAuditArgs()).toEqual({ amount: 500, unit: "mg" });
  });

  it("returns a refusal as data with its message, not as an internal error", async () => {
    writes.refillStock.mockResolvedValue({
      ok: false,
      reason: "no_stock_item",
      message: "Furosemide has no stock to refill.",
    });
    const res = await client.callTool({ name: "refill_stock", arguments: { prescription_id: "p1", pills: 28 } });
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toMatch(/no stock to refill/);
    expect(lastAuditArgs()).toEqual({ prescription_id: "p1", pills: 28 });
  });

  it("masks a thrown write as a generic error", async () => {
    writes.logDose.mockRejectedValue(new Error("relation dose_logs does not exist"));
    const res = await client.callTool({
      name: "log_dose",
      arguments: { schedule_id: "s1", date: "2026-09-21", action: "taken" },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).not.toMatch(/relation/);
  });
});
