/**
 * Integration tests for the MCP reading and journal writes
 * (`src/lib/mcp/record-writes.ts`) and the new reads (journal, defecation,
 * profile, insight reports) against a real Postgres database.
 *
 * What matters: the rows look like the app's own (the push validator accepts
 * them back), journal text is stored as ciphertext and read back as plain
 * text, and delete reaches only the connector's own rows of the caller.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { setupTestDb, type TestDbContext } from "@/__tests__/helpers/test-db";
import * as schema from "@intake/db/schema";
import { prescriptionFixture } from "@/__tests__/helpers/mcp-query-fixtures";
import { opSchema_, type TableName } from "@intake/db/sync-payload";
import type * as RecordWritesMod from "@/lib/mcp/record-writes";
import type * as QueriesMod from "@/lib/mcp/queries";

const OTHER_USER_ID = "other-user-integration";
const NOW = 1_790_000_000_000;
const AT = NOW - 30 * 60_000;
const FULL_RANGE = { start: 0, end: Number.MAX_SAFE_INTEGER };

let ctx: TestDbContext;
let writes: typeof RecordWritesMod;
let queries: typeof QueriesMod;
let originalSecret: string | undefined;

vi.mock("@intake/db/client", () => ({
  get db() {
    return ctx.db;
  },
}));

beforeAll(async () => {
  originalSecret = process.env.API_KEY_ENCRYPTION_SECRET;
  process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
  ctx = await setupTestDb();
  writes = await import("@/lib/mcp/record-writes");
  queries = await import("@/lib/mcp/queries");
  await ctx.pool.query(
    `INSERT INTO neon_auth.users_sync (id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [OTHER_USER_ID],
  );
}, 60_000);

afterAll(async () => {
  if (originalSecret === undefined) delete process.env.API_KEY_ENCRYPTION_SECRET;
  else process.env.API_KEY_ENCRYPTION_SECRET = originalSecret;
  vi.restoreAllMocks();
  await ctx?.teardown();
}, 30_000);

beforeEach(async () => {
  await ctx.db.delete(schema.intakeRecords);
  await ctx.db.delete(schema.weightRecords);
  await ctx.db.delete(schema.bloodPressureRecords);
  await ctx.db.delete(schema.urinationRecords);
  await ctx.db.delete(schema.defecationRecords);
  await ctx.db.delete(schema.journalEntries);
  await ctx.db.delete(schema.prescriptions);
  await ctx.db.delete(schema.userProfile);
  await ctx.db.delete(schema.userSettings);
  await ctx.db.delete(schema.insightReports);
});

/** The row as pull sends it, pushed back unchanged: the validator must accept it. */
function expectPushable(tableName: TableName, row: Record<string, unknown>) {
  const { serverUpdatedAt: _stamp, userId: _user, ...pulled } = row;
  const parsed = opSchema_.safeParse({ queueId: 1, op: "upsert", tableName, row: pulled });
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
}

const base = { timestamp: AT, timezone: "Europe/Berlin" };

describe("reading writes", () => {
  it("logs sodium from salt grams with the entered source kept", async () => {
    const r = await writes.logSodium(ctx.testUserId, { amount: 2, unit: "g", source: "salt", ...base }, NOW);
    const [row] = await ctx.db.select().from(schema.intakeRecords).where(eq(schema.intakeRecords.id, r.id));
    expect(row).toMatchObject({
      userId: ctx.testUserId,
      type: "salt",
      amount: 786,
      sodiumSource: "salt",
      sourceAmount: 2,
      sourceUnit: "g",
      deviceId: "mcp-connector",
      serverUpdatedAt: NOW,
      timezone: "Europe/Berlin",
    });
    expectPushable("intakeRecords", row!);
  });

  it("logs weight, blood pressure, urination and defecation in the app's shape", async () => {
    const w = await writes.logWeight(ctx.testUserId, { weightKg: 81.4, note: " after breakfast ", ...base }, NOW);
    const bp = await writes.logBloodPressure(ctx.testUserId, { systolic: 128, diastolic: 82, heartRate: 64, ...base }, NOW);
    const u = await writes.logEstimate(ctx.testUserId, "urination", { amountEstimate: "large", ...base }, NOW);
    const d = await writes.logEstimate(ctx.testUserId, "defecation", { note: "loose", ...base }, NOW);

    const [wRow] = await ctx.db.select().from(schema.weightRecords).where(eq(schema.weightRecords.id, w.id));
    expect(wRow).toMatchObject({ weight: 81.4, note: "after breakfast", source: null });
    expectPushable("weightRecords", wRow!);

    const [bpRow] = await ctx.db.select().from(schema.bloodPressureRecords).where(eq(schema.bloodPressureRecords.id, bp.id));
    expect(bpRow).toMatchObject({ systolic: 128, diastolic: 82, heartRate: 64, position: "sitting", arm: "left" });
    expectPushable("bloodPressureRecords", bpRow!);

    const [uRow] = await ctx.db.select().from(schema.urinationRecords).where(eq(schema.urinationRecords.id, u.id));
    expect(uRow).toMatchObject({ amountEstimate: "large", note: null });
    expectPushable("urinationRecords", uRow!);

    const history = await queries.queryDefecationHistory(ctx.testUserId, FULL_RANGE);
    expect(history.items).toEqual([{ id: d.id, timestamp: AT, amountEstimate: null, note: "loose" }]);
  });
});

describe("journal", () => {
  it("stores the words and title encrypted and reads them back as plain text", async () => {
    const r = await writes.addJournalEntry(
      ctx.testUserId,
      { words: "Left knee aching after the walk", kind: "symptom", places: ["knee-l"], severity: 4, ...base },
      NOW,
    );
    expect("id" in r).toBe(true);
    if (!("id" in r)) return;

    const [stored] = await ctx.db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, r.id));
    expect(stored!.words).toMatch(/^f1:/);
    expect(stored!.finding).toMatch(/^f1:/);
    expect(stored).toMatchObject({ kind: "symptom", places: ["knee-l"], severity: 4, timePrecision: "exact", deviceId: "mcp-connector" });

    const read = await queries.queryJournal(ctx.testUserId, FULL_RANGE);
    expect(read.items).toHaveLength(1);
    expect(read.items[0]).toMatchObject({
      words: "Left knee aching after the walk",
      finding: "Left knee aching after the walk",
      placeLabels: ["Knee, left"],
    });
    expect(await queries.queryJournal(OTHER_USER_ID, FULL_RANGE)).toEqual({ items: [], truncated: false });
  });

  it("refuses a sided place without a side and an unknown place, writing nothing", async () => {
    const missing = await writes.addJournalEntry(ctx.testUserId, { words: "Sore knee", kind: "symptom", places: ["knee"], ...base }, NOW);
    expect(missing).toMatchObject({ added: false, message: expect.stringMatching(/which side/) });
    const unknown = await writes.addJournalEntry(ctx.testUserId, { words: "Sore", kind: "symptom", places: ["elbow"], ...base }, NOW);
    expect(unknown).toMatchObject({ added: false });
    expect(await ctx.db.select().from(schema.journalEntries)).toHaveLength(0);
  });

  it("returns the app's safety notices, with blood thinners from the medication list", async () => {
    await ctx.db.insert(schema.prescriptions).values(prescriptionFixture(ctx.testUserId, { genericName: "Apixaban" }));
    const r = await writes.addJournalEntry(ctx.testUserId, { words: "Big bruise on my arm", kind: "sign", places: ["arm-r"], ...base }, NOW);
    expect("notices" in r && r.notices.map((n) => n.level)).toEqual(["info"]);
  });

  it("delete blanks the entry and refuses the user's own entries", async () => {
    const r = await writes.addJournalEntry(ctx.testUserId, { words: "Dizzy on standing", kind: "symptom", ...base }, NOW);
    if (!("id" in r)) throw new Error("not added");
    expect(await writes.deleteLoggedRecord(OTHER_USER_ID, "journal_entry", r.id, NOW + 1)).toEqual({ deleted: false, reason: "not_found" });
    expect(await writes.deleteLoggedRecord(ctx.testUserId, "journal_entry", r.id, NOW + 1)).toEqual({ deleted: true, kind: "journal_entry", id: r.id });
    const [row] = await ctx.db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, r.id));
    expect(row).toMatchObject({ words: "", finding: "", places: [], severity: null, deletedAt: NOW + 1, serverUpdatedAt: NOW + 1 });
    expect((await queries.queryJournal(ctx.testUserId, FULL_RANGE)).items).toHaveLength(0);

    const mine = await writes.logWeight(ctx.testUserId, { weightKg: 80, ...base }, NOW);
    await ctx.db.update(schema.weightRecords).set({ deviceId: "phone" }).where(eq(schema.weightRecords.id, mine.id));
    expect(await writes.deleteLoggedRecord(ctx.testUserId, "weight", mine.id, NOW + 2)).toEqual({ deleted: false, reason: "not_connector_entry" });
  });

  it("deletes as sodium only a standalone sodium row, never part of a meal or drink", async () => {
    const sodium = await writes.logSodium(ctx.testUserId, { amount: 500, unit: "mg", source: "sodium", ...base }, NOW);
    const grouped = crypto.randomUUID();
    await ctx.db.insert(schema.intakeRecords).values({
      id: grouped,
      userId: ctx.testUserId,
      type: "water",
      amount: 250,
      timestamp: AT,
      source: "drink",
      groupId: crypto.randomUUID(),
      groupSource: "mcp_drink",
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      deviceId: "mcp-connector",
      timezone: "UTC",
    });
    expect(await writes.deleteLoggedRecord(ctx.testUserId, "sodium", grouped, NOW + 1)).toEqual({ deleted: false, reason: "not_found" });
    expect(await writes.deleteLoggedRecord(ctx.testUserId, "sodium", sodium.id, NOW + 1)).toMatchObject({ deleted: true });
  });
});

describe("profile and insight reports", () => {
  it("reads conditions and settings, and null settings before they sync", async () => {
    expect(await queries.getProfile(ctx.testUserId)).toEqual({ conditions: [], conditions_shared: false, settings: null });
    await ctx.db.insert(schema.userProfile).values({
      id: "p1",
      userId: ctx.testUserId,
      conditions: ["HFrEF"],
      shareConditionsWithAI: true,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      deviceId: "d",
    });
    const profile = await queries.getProfile(ctx.testUserId);
    expect(profile).toMatchObject({ conditions: ["HFrEF"], conditions_shared: true });

    // "Share conditions with AI" off: the conditions stay in the app.
    await ctx.db.update(schema.userProfile).set({ shareConditionsWithAI: false });
    expect(await queries.getProfile(ctx.testUserId)).toMatchObject({ conditions: [], conditions_shared: false });
  });

  it("lists reports newest first with mode defaulting to fast", async () => {
    const row = (id: string, generatedAt: number, mode: string | null) => ({
      id,
      userId: ctx.testUserId,
      generatedAt,
      rangeStart: 0,
      rangeEnd: generatedAt,
      narrative: "n",
      observations: ["o"],
      personalised: false,
      mode,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      deletedAt: null,
      deviceId: "d",
    });
    await ctx.db.insert(schema.insightReports).values([row("a", 1, null), row("b", 2, "deep")]);
    const { insight_reports } = await queries.listInsightReports(ctx.testUserId, 10);
    expect(insight_reports.map((r) => [r.id, r.mode])).toEqual([["b", "deep"], ["a", "fast"]]);
  });
});
