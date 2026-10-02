/**
 * Integration tests for the server-assigned pull cursor (audit sync-engine#3)
 * against a real Postgres database.
 *
 * The pull cursor used to be the client-supplied `updatedAt`. A record written
 * offline (or pushed late for any reason) keeps its old `updatedAt`, which by
 * the time it reaches the server already sits below every other device's
 * cursor — so those devices never pulled it. Pull now pages by
 * `(server_updated_at, id)`, a stamp the push route sets on every write.
 *
 * Also covers audit sync-engine#10: a prescription with an empty indication
 * (the wizard default) used to be rejected by a NOT NULL constraint after
 * sanitizeRow turned "" into NULL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { setupTestDb, type TestDbContext } from "@/__tests__/helpers/test-db";
import * as schema from "@intake/db/schema";

let ctx: TestDbContext;
let PUSH: (req: NextRequest) => Promise<Response>;
let PULL: (req: NextRequest) => Promise<Response>;

// Top-level (Vitest 5 rejects nested vi.mock). The factories read `ctx`
// lazily: they run on the first import of the mocked module, which is the
// dynamic import inside beforeAll, after setupTestDb() has assigned it.
vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (
    handler: (ctx: {
      request: NextRequest;
      auth: { success: true; userId: string };
    }) => Promise<Response>,
  ) => {
    return async (request: NextRequest) =>
      handler({
        request,
        auth: { success: true, userId: "test-user-integration" },
      });
  },
}));
vi.mock("@intake/db/client", () => ({
  db: ctx.db,
}));

beforeAll(async () => {
  ctx = await setupTestDb();

  PUSH = (await import("@/app/api/sync/push/route")).POST;
  PULL = (await import("@/app/api/sync/pull/route")).POST;
}, 60_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await ctx?.teardown();
}, 30_000);

beforeEach(async () => {
  for (const table of [
    schema.doseLogs,
    schema.phaseSchedules,
    schema.medicationPhases,
    schema.prescriptions,
    schema.intakeRecords,
  ]) {
    await ctx.db.delete(table);
  }
});

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(`https://example.test${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const SIX_HOURS = 6 * 60 * 60 * 1000;

function intakeRow(overrides: Record<string, unknown> = {}) {
  const ts = Date.now() - SIX_HOURS;
  return {
    id: crypto.randomUUID(),
    type: "water",
    amount: 250,
    timestamp: ts,
    source: "manual",
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    deviceId: "phone",
    timezone: "UTC",
    ...overrides,
  };
}

type PullSlice = {
  rows: Record<string, unknown>[];
  hasMore: boolean;
  cursor?: { updatedAt: number; id: string };
};
type PullBody = { result: Record<string, PullSlice>; serverTime: number };

async function pull(cursors: Record<string, unknown>): Promise<PullBody> {
  const res = await PULL(
    post("/api/sync/pull", { cursors, cursorKind: "server" }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as PullBody;
}

describe("server-assigned pull cursor (real Postgres)", () => {
  it("a record pushed late is still pulled by a device whose cursor is past its updatedAt", async () => {
    // The tablet has been pulling all along: its cursor sits at "now - 30s".
    const tabletCursor = { updatedAt: Date.now() - 30_000, id: "" };

    // The phone landed after 6 hours offline and pushes what it logged.
    const offline = intakeRow();
    const pushRes = await PUSH(
      post("/api/sync/push", {
        ops: [{ queueId: 1, tableName: "intakeRecords", op: "upsert", row: offline }],
      }),
    );
    expect(pushRes.status).toBe(200);
    expect((await pushRes.json()).accepted).toHaveLength(1);

    const body = await pull({ intakeRecords: tabletCursor });
    expect(body.result.intakeRecords!.rows.map((r) => r.id)).toEqual([offline.id]);
    // LWW still sees the client's own clock.
    expect(body.result.intakeRecords!.rows[0]!.updatedAt).toBe(offline.updatedAt);
  });

  it("stamps server_updated_at on insert, update and tombstone-stub update", async () => {
    const row = intakeRow();
    const before = Date.now();
    await PUSH(
      post("/api/sync/push", {
        ops: [{ queueId: 1, tableName: "intakeRecords", op: "upsert", row }],
      }),
    );
    const [inserted] = await ctx.db
      .select()
      .from(schema.intakeRecords)
      .where(eq(schema.intakeRecords.id, row.id));
    expect(inserted!.serverUpdatedAt).toBeGreaterThanOrEqual(before);
    // Not the client clock.
    expect(inserted!.serverUpdatedAt).not.toBe(row.updatedAt);

    // Force the stamp back so the update below is observable.
    await ctx.db
      .update(schema.intakeRecords)
      .set({ serverUpdatedAt: 1 })
      .where(eq(schema.intakeRecords.id, row.id));
    await PUSH(
      post("/api/sync/push", {
        ops: [
          {
            queueId: 2,
            tableName: "intakeRecords",
            op: "upsert",
            row: { ...row, amount: 300, updatedAt: row.updatedAt + 1 },
          },
        ],
      }),
    );
    const [updated] = await ctx.db
      .select()
      .from(schema.intakeRecords)
      .where(eq(schema.intakeRecords.id, row.id));
    expect(updated!.amount).toBe(300);
    expect(updated!.serverUpdatedAt).toBeGreaterThanOrEqual(before);

    // The #355 tombstone-only stub path.
    await ctx.db
      .update(schema.intakeRecords)
      .set({ serverUpdatedAt: 1 })
      .where(eq(schema.intakeRecords.id, row.id));
    await PUSH(
      post("/api/sync/push", {
        ops: [
          {
            queueId: 3,
            tableName: "intakeRecords",
            op: "delete",
            row: { id: row.id, updatedAt: row.updatedAt + 2, deletedAt: row.updatedAt + 2 },
          },
        ],
      }),
    );
    const [tombstoned] = await ctx.db
      .select()
      .from(schema.intakeRecords)
      .where(eq(schema.intakeRecords.id, row.id));
    expect(tombstoned!.deletedAt).toBe(row.updatedAt + 2);
    expect(tombstoned!.serverUpdatedAt).toBeGreaterThanOrEqual(before);
  });

  it("ignores a client-supplied serverUpdatedAt", async () => {
    const row = { ...intakeRow(), serverUpdatedAt: 5 };
    await PUSH(
      post("/api/sync/push", {
        ops: [{ queueId: 1, tableName: "intakeRecords", op: "upsert", row }],
      }),
    );
    const [stored] = await ctx.db
      .select()
      .from(schema.intakeRecords)
      .where(eq(schema.intakeRecords.id, row.id));
    expect(stored!.serverUpdatedAt).toBeGreaterThan(5);
  });

  it("returns the keyset cursor and strips serverUpdatedAt from row payloads", async () => {
    const a = intakeRow();
    const b = intakeRow();
    await PUSH(
      post("/api/sync/push", {
        ops: [
          { queueId: 1, tableName: "intakeRecords", op: "upsert", row: a },
          { queueId: 2, tableName: "intakeRecords", op: "upsert", row: b },
        ],
      }),
    );

    const first = await pull({});
    const slice = first.result.intakeRecords!;
    expect(slice.rows).toHaveLength(2);
    for (const r of slice.rows) {
      expect(r).not.toHaveProperty("serverUpdatedAt");
    }
    expect(slice.cursor).toBeDefined();
    const last = slice.rows[slice.rows.length - 1]!;
    expect(slice.cursor!.id).toBe(last.id);

    // Resuming from the returned cursor yields nothing new.
    const second = await pull({ intakeRecords: slice.cursor });
    expect(second.result.intakeRecords!.rows).toHaveLength(0);
  });
});

describe("prescription indication is optional (real Postgres)", () => {
  it("accepts a prescription with an empty indication and stores NULL", async () => {
    const id = crypto.randomUUID();
    const res = await PUSH(
      post("/api/sync/push", {
        ops: [
          {
            queueId: 1,
            tableName: "prescriptions",
            op: "upsert",
            row: {
              id,
              genericName: "Furosemide",
              indication: "",
              isActive: true,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              deletedAt: null,
              deviceId: "phone",
            },
          },
        ],
      }),
    );
    const body = (await res.json()) as {
      accepted: unknown[];
      rejected: unknown[];
    };
    expect(body.rejected).toEqual([]);
    expect(body.accepted).toHaveLength(1);

    const [stored] = await ctx.db
      .select()
      .from(schema.prescriptions)
      .where(eq(schema.prescriptions.id, id));
    expect(stored!.indication).toBeNull();
  });

  it("accepts a prescription with no indication key at all", async () => {
    const id = crypto.randomUUID();
    const res = await PUSH(
      post("/api/sync/push", {
        ops: [
          {
            queueId: 1,
            tableName: "prescriptions",
            op: "upsert",
            row: {
              id,
              genericName: "Furosemide",
              isActive: true,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              deletedAt: null,
              deviceId: "phone",
            },
          },
        ],
      }),
    );
    const body = (await res.json()) as { accepted: unknown[]; rejected: unknown[] };
    expect(body.rejected).toEqual([]);
    expect(body.accepted).toHaveLength(1);
  });
});
