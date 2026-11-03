/**
 * POST /api/sync/pull for journal entries: their text is stored encrypted
 * (lib/server/field-vault.ts) and leaves the server decrypted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

type StubRow = Record<string, unknown>;
let rowsByTableRef = new Map<unknown, StubRow[]>();
function resetDbState() {
  rowsByTableRef = new Map();
}

vi.mock("@/lib/auth-middleware", () => ({
  withAuth:
    (handler: (ctx: { request: NextRequest; auth: { success: true; userId: string } }) => Promise<Response>) =>
    async (request: NextRequest) =>
      handler({ request, auth: { success: true, userId: "user-test" } }),
}));

vi.mock("@intake/db/client", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          orderBy: () => ({ limit: async () => rowsByTableRef.get(table) ?? [] }),
        }),
      }),
    }),
  },
}));

function makePullRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/sync/pull", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("sync-pull-route: journal entries", () => {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  beforeEach(() => {
    resetDbState();
    process.env.API_KEY_ENCRYPTION_SECRET = Buffer.alloc(32, 9).toString("base64");
  });
  afterEach(() => {
    if (secret === undefined) delete process.env.API_KEY_ENCRYPTION_SECRET;
    else process.env.API_KEY_ENCRYPTION_SECRET = secret;
  });

  function storedRow(words: string, finding: string, overrides: StubRow = {}): StubRow {
    return {
      id: "j-1", userId: "user-test", timestamp: 1_000, timePrecision: "exact",
      words, finding, kind: "symptom", places: ["knee-l"], severity: 4, source: "voice",
      createdAt: 1_000, updatedAt: 1_000, deletedAt: null, deviceId: "dev-A",
      timezone: "Europe/Berlin", serverUpdatedAt: 1_500, ...overrides,
    };
  }

  async function pullJournal() {
    const { POST } = await import("@/app/api/sync/pull/route");
    const res = await POST(makePullRequest({ cursors: {}, cursorKind: "server" }));
    const body = (await res.json()) as { result: Record<string, { rows: StubRow[] }>; error?: string };
    expect(body.error, JSON.stringify(body)).toBeUndefined();
    return body.result.journalEntries!.rows;
  }

  it("decrypts the words and title for the device", async () => {
    const { schemaByTableName } = await import("@intake/db/sync-payload");
    const { encryptField } = await import("@/lib/server/field-vault");
    const aad = { userId: "user-test", tableName: "journalEntries" as const, rowId: "j-1" };
    rowsByTableRef.set(schemaByTableName.journalEntries, [
      storedRow(encryptField("My knee hurts", { ...aad, field: "words" }), encryptField("Knee pain", { ...aad, field: "finding" })),
    ]);
    const rows = await pullJournal();
    expect(rows[0]).toMatchObject({ words: "My knee hurts", finding: "Knee pain" });
    expect(rows[0]).not.toHaveProperty("serverUpdatedAt");
  });

  it("sends a placeholder for text that no longer decrypts, and keeps pulling", async () => {
    const { schemaByTableName } = await import("@intake/db/sync-payload");
    const { encryptField, UNREADABLE_TEXT } = await import("@/lib/server/field-vault");
    // Encrypted for another user: the AAD no longer matches.
    const aad = { userId: "someone-else", tableName: "journalEntries" as const, rowId: "j-1" };
    rowsByTableRef.set(schemaByTableName.journalEntries, [
      storedRow(encryptField("secret", { ...aad, field: "words" }), encryptField("Secret", { ...aad, field: "finding" })),
    ]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = await pullJournal();
    expect(rows[0]).toMatchObject({ words: UNREADABLE_TEXT.words, finding: UNREADABLE_TEXT.finding });
  });

  it("passes a deleted entry's blank content through", async () => {
    const { schemaByTableName } = await import("@intake/db/sync-payload");
    rowsByTableRef.set(schemaByTableName.journalEntries, [
      storedRow("", "", { places: [], severity: null, deletedAt: 2_000 }),
    ]);
    const rows = await pullJournal();
    expect(rows[0]).toMatchObject({ words: "", finding: "", deletedAt: 2_000 });
  });
});
