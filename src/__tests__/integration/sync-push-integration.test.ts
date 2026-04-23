/**
 * Integration tests for POST /api/sync/push against a real Postgres database.
 *
 * These tests catch the class of bugs that unit tests with mocked Drizzle miss:
 * constraint violations, type coercion, empty string handling, CHECK constraint
 * enforcement, and FK integrity.
 *
 * Infrastructure: testcontainers spins up a disposable Postgres 16 container.
 * Auth is still mocked (no real Neon Auth in Docker), but everything from the
 * Zod validation through Drizzle to Postgres is real.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { setupTestDb, type TestDbContext } from "../helpers/test-db";
import * as schema from "@/db/schema";

let ctx: TestDbContext;
let POST: (req: NextRequest) => Promise<Response>;

// ─────────────────────────────────────────────────────────────────────────
// Setup: start container, mock auth + drizzle, import route
// ─────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ctx = await setupTestDb();

  // Mock auth to inject our test user
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

  // Mock drizzle to return our real test DB instance
  vi.mock("@/lib/drizzle", () => ({
    db: ctx.db,
  }));

  // Dynamic import after mocks are registered
  const mod = await import("@/app/api/sync/push/route");
  POST = mod.POST;
}, 60_000); // Container startup can take a while

afterAll(async () => {
  vi.restoreAllMocks();
  await ctx?.teardown();
}, 30_000);

beforeEach(async () => {
  // Clean all app tables between tests (preserve neon_auth.users_sync)
  const tables = [
    schema.auditLogs,
    schema.substanceRecords,
    schema.inventoryTransactions,
    schema.doseLogs,
    schema.dailyNotes,
    schema.inventoryItems,
    schema.phaseSchedules,
    schema.medicationPhases,
    schema.titrationPlans,
    schema.prescriptions,
    schema.eatingRecords,
    schema.urinationRecords,
    schema.defecationRecords,
    schema.bloodPressureRecords,
    schema.weightRecords,
    schema.intakeRecords,
  ];
  for (const table of tables) {
    await ctx.db.delete(table);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function makePushRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.test/api/sync/push", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const BASE_TS = 1_700_000_000_000;

function validIntakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    type: "water",
    amount: 250,
    timestamp: BASE_TS,
    source: "manual",
    note: null,
    createdAt: BASE_TS,
    updatedAt: BASE_TS + 1000,
    deletedAt: null,
    deviceId: "dev-A",
    timezone: "UTC",
    ...overrides,
  };
}

function validEatingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    timestamp: BASE_TS,
    grams: 200,
    note: null,
    createdAt: BASE_TS,
    updatedAt: BASE_TS + 1000,
    deletedAt: null,
    deviceId: "dev-A",
    timezone: "UTC",
    ...overrides,
  };
}

function validWeightRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    weight: 75.5,
    timestamp: BASE_TS,
    note: null,
    createdAt: BASE_TS,
    updatedAt: BASE_TS + 1000,
    deletedAt: null,
    deviceId: "dev-A",
    timezone: "UTC",
    ...overrides,
  };
}

function validBpRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    systolic: 120,
    diastolic: 80,
    heartRate: 70,
    irregularHeartbeat: false,
    position: "sitting",
    arm: "left",
    timestamp: BASE_TS,
    note: null,
    createdAt: BASE_TS,
    updatedAt: BASE_TS + 1000,
    deletedAt: null,
    deviceId: "dev-A",
    timezone: "UTC",
    ...overrides,
  };
}

function validPrescriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    genericName: "Lisinopril",
    indication: "Hypertension",
    notes: null,
    contraindications: [],
    warnings: [],
    isActive: true,
    createdAt: BASE_TS,
    updatedAt: BASE_TS + 1000,
    deletedAt: null,
    deviceId: "dev-A",
    ...overrides,
  };
}

type PushResponse = {
  accepted: Array<{ queueId: number; serverUpdatedAt: number }>;
  rejected: Array<{ queueId: number; tableName: string; error: string }>;
};

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe("sync-push integration (real Postgres)", () => {
  describe("basic insert and read-back", () => {
    it("inserts an intake record into real Postgres and reads it back", async () => {
      const rowId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({ id: rowId }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);
      expect(body.rejected).toHaveLength(0);

      // Verify the row is actually in Postgres
      const rows = await ctx.db
        .select()
        .from(schema.intakeRecords)
        .where(eq(schema.intakeRecords.id, rowId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.type).toBe("water");
      expect(rows[0]!.amount).toBe(250);
      expect(rows[0]!.userId).toBe("test-user-integration");
    });

    it("inserts records across multiple tables in one batch", async () => {
      const intakeId = crypto.randomUUID();
      const weightId = crypto.randomUUID();
      const eatingId = crypto.randomUUID();

      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({ id: intakeId }),
          },
          {
            queueId: 2,
            tableName: "weightRecords",
            op: "upsert",
            row: validWeightRow({ id: weightId }),
          },
          {
            queueId: 3,
            tableName: "eatingRecords",
            op: "upsert",
            row: validEatingRow({ id: eatingId }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(3);
      expect(body.rejected).toHaveLength(0);

      // All three in the DB
      const intakes = await ctx.db.select().from(schema.intakeRecords);
      const weights = await ctx.db.select().from(schema.weightRecords);
      const eatings = await ctx.db.select().from(schema.eatingRecords);
      expect(intakes).toHaveLength(1);
      expect(weights).toHaveLength(1);
      expect(eatings).toHaveLength(1);
    });
  });

  describe("empty string sanitization (the bug that mocks missed)", () => {
    it("converts empty string source to null without Postgres error", async () => {
      const rowId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({ id: rowId, source: "" }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);
      expect(body.rejected).toHaveLength(0);

      const rows = await ctx.db
        .select()
        .from(schema.intakeRecords)
        .where(eq(schema.intakeRecords.id, rowId));
      expect(rows[0]!.source).toBeNull();
    });

    it("converts empty string note to null on eating records", async () => {
      const rowId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "eatingRecords",
            op: "upsert",
            row: validEatingRow({ id: rowId, note: "" }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);

      const rows = await ctx.db
        .select()
        .from(schema.eatingRecords)
        .where(eq(schema.eatingRecords.id, rowId));
      expect(rows[0]!.note).toBeNull();
    });

    it("handles multiple empty string fields on a single record", async () => {
      const rowId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({
              id: rowId,
              source: "",
              note: "",
              groupId: "",
              originalInputText: "",
              groupSource: "",
            }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);
      expect(body.rejected).toHaveLength(0);

      const rows = await ctx.db
        .select()
        .from(schema.intakeRecords)
        .where(eq(schema.intakeRecords.id, rowId));
      const row = rows[0]!;
      expect(row.source).toBeNull();
      expect(row.note).toBeNull();
      expect(row.groupId).toBeNull();
      expect(row.originalInputText).toBeNull();
      expect(row.groupSource).toBeNull();
    });
  });

  describe("CHECK constraint enforcement", () => {
    it("rejects invalid intake type via Postgres CHECK constraint", async () => {
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({ type: "juice" }),
          },
        ],
      });

      const res = await POST(req);
      // Zod should catch this before it reaches Postgres, but if not,
      // the Postgres CHECK constraint will reject it
      const body = (await res.json()) as PushResponse | { error: string };
      if (res.status === 400) {
        // Zod caught it — good
        expect(body).toHaveProperty("error");
      } else {
        // If it reached Postgres, it should be in rejected
        expect((body as PushResponse).rejected.length).toBeGreaterThan(0);
      }
    });

    it("rejects invalid blood pressure position via CHECK constraint", async () => {
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "bloodPressureRecords",
            op: "upsert",
            row: validBpRow({ position: "lying" }),
          },
        ],
      });

      const res = await POST(req);
      const body = (await res.json()) as PushResponse | { error: string };
      if (res.status === 400) {
        expect(body).toHaveProperty("error");
      } else {
        expect((body as PushResponse).rejected.length).toBeGreaterThan(0);
      }
    });
  });

  describe("LWW conflict resolution against real data", () => {
    it("newer client write wins over existing server row", async () => {
      const rowId = crypto.randomUUID();

      // Seed an existing row directly in the DB
      await ctx.db.insert(schema.intakeRecords).values({
        id: rowId,
        userId: ctx.testUserId,
        type: "water",
        amount: 100,
        timestamp: BASE_TS,
        source: "manual",
        createdAt: BASE_TS,
        updatedAt: BASE_TS + 1000,
        deletedAt: null,
        deviceId: "dev-server",
        timezone: "UTC",
      });

      // Push a newer update
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({
              id: rowId,
              amount: 500,
              updatedAt: BASE_TS + 2000,
            }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);
      expect(body.accepted[0]!.serverUpdatedAt).toBe(BASE_TS + 2000);

      // Verify the row was actually updated in Postgres
      const rows = await ctx.db
        .select()
        .from(schema.intakeRecords)
        .where(eq(schema.intakeRecords.id, rowId));
      expect(rows[0]!.amount).toBe(500);
    });

    it("server row wins on tie (strict > comparison)", async () => {
      const rowId = crypto.randomUUID();
      const tieTs = BASE_TS + 5000;

      await ctx.db.insert(schema.intakeRecords).values({
        id: rowId,
        userId: ctx.testUserId,
        type: "water",
        amount: 100,
        timestamp: BASE_TS,
        source: "manual",
        createdAt: BASE_TS,
        updatedAt: tieTs,
        deletedAt: null,
        deviceId: "dev-server",
        timezone: "UTC",
      });

      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({
              id: rowId,
              amount: 999,
              updatedAt: tieTs,
            }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted[0]!.serverUpdatedAt).toBe(tieTs);

      // Amount should still be the server's original value
      const rows = await ctx.db
        .select()
        .from(schema.intakeRecords)
        .where(eq(schema.intakeRecords.id, rowId));
      expect(rows[0]!.amount).toBe(100);
    });

    it("deleted server row prevents resurrection", async () => {
      const rowId = crypto.randomUUID();

      await ctx.db.insert(schema.intakeRecords).values({
        id: rowId,
        userId: ctx.testUserId,
        type: "water",
        amount: 100,
        timestamp: BASE_TS,
        createdAt: BASE_TS,
        updatedAt: BASE_TS + 1000,
        deletedAt: BASE_TS + 999,
        deviceId: "dev-server",
        timezone: "UTC",
      });

      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({
              id: rowId,
              updatedAt: BASE_TS + 9999,
              deletedAt: null,
            }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      // Server should ack with its own updatedAt, not accept the resurrection
      expect(body.accepted[0]!.serverUpdatedAt).toBe(BASE_TS + 1000);

      // Row should still be deleted in DB
      const rows = await ctx.db
        .select()
        .from(schema.intakeRecords)
        .where(eq(schema.intakeRecords.id, rowId));
      expect(rows[0]!.deletedAt).toBe(BASE_TS + 999);
    });
  });

  describe("FK constraint enforcement", () => {
    it("rejects a dose log with nonexistent prescription FK", async () => {
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "doseLogs",
            op: "upsert",
            row: {
              id: crypto.randomUUID(),
              prescriptionId: "nonexistent-rx",
              phaseId: "nonexistent-phase",
              scheduleId: "nonexistent-sched",
              scheduledDate: "2024-01-15",
              scheduledTime: "08:00",
              status: "taken",
              actionTimestamp: BASE_TS,
              timezone: "UTC",
              createdAt: BASE_TS,
              updatedAt: BASE_TS + 1000,
              deletedAt: null,
              deviceId: "dev-A",
            },
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      // FK violation should land in rejected, not crash the route
      expect(body.rejected).toHaveLength(1);
      expect(body.rejected[0]!.error).toBeTruthy();
    });
  });

  describe("array column handling", () => {
    it("stores and retrieves text[] arrays on prescriptions", async () => {
      const rxId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "prescriptions",
            op: "upsert",
            row: validPrescriptionRow({
              id: rxId,
              contraindications: ["Angioedema", "Pregnancy"],
              warnings: ["May cause dry cough"],
            }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);

      const rows = await ctx.db
        .select()
        .from(schema.prescriptions)
        .where(eq(schema.prescriptions.id, rxId));
      expect(rows[0]!.contraindications).toEqual(["Angioedema", "Pregnancy"]);
      expect(rows[0]!.warnings).toEqual(["May cause dry cough"]);
    });

    it("handles empty arrays", async () => {
      const rxId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "prescriptions",
            op: "upsert",
            row: validPrescriptionRow({
              id: rxId,
              contraindications: [],
              warnings: [],
            }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);

      const rows = await ctx.db
        .select()
        .from(schema.prescriptions)
        .where(eq(schema.prescriptions.id, rxId));
      expect(rows[0]!.contraindications).toEqual([]);
      expect(rows[0]!.warnings).toEqual([]);
    });
  });

  describe("numeric type coercion", () => {
    it("stores real/float values correctly on weight records", async () => {
      const rowId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "weightRecords",
            op: "upsert",
            row: validWeightRow({ id: rowId, weight: 72.35 }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const rows = await ctx.db
        .select()
        .from(schema.weightRecords)
        .where(eq(schema.weightRecords.id, rowId));
      expect(rows[0]!.weight).toBeCloseTo(72.35, 2);
    });

    it("stores bigint timestamps correctly", async () => {
      const rowId = crypto.randomUUID();
      const largeTs = 1_700_000_000_000;
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({
              id: rowId,
              timestamp: largeTs,
              createdAt: largeTs,
              updatedAt: largeTs + 1000,
            }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const rows = await ctx.db
        .select()
        .from(schema.intakeRecords)
        .where(eq(schema.intakeRecords.id, rowId));
      expect(rows[0]!.timestamp).toBe(largeTs);
      expect(rows[0]!.createdAt).toBe(largeTs);
    });
  });

  describe("upsert (onConflictDoUpdate) behavior", () => {
    it("updates existing record on conflict", async () => {
      const rowId = crypto.randomUUID();

      // First push — insert
      const req1 = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({
              id: rowId,
              amount: 250,
              updatedAt: BASE_TS + 1000,
            }),
          },
        ],
      });
      await POST(req1);

      // Second push — update same row with newer timestamp
      const req2 = makePushRequest({
        ops: [
          {
            queueId: 2,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({
              id: rowId,
              amount: 500,
              note: "updated",
              updatedAt: BASE_TS + 2000,
            }),
          },
        ],
      });
      const res = await POST(req2);
      expect(res.status).toBe(200);

      const rows = await ctx.db
        .select()
        .from(schema.intakeRecords)
        .where(eq(schema.intakeRecords.id, rowId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.amount).toBe(500);
      expect(rows[0]!.note).toBe("updated");
    });
  });

  describe("user isolation", () => {
    it("SELECT is scoped to userId — other users rows are invisible to LWW", async () => {
      const otherUserId = "other-user";
      await ctx.pool.query(
        `INSERT INTO neon_auth.users_sync (id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [otherUserId],
      );

      // Seed a row for the OTHER user
      const otherRowId = crypto.randomUUID();
      await ctx.db.insert(schema.intakeRecords).values({
        id: otherRowId,
        userId: otherUserId,
        type: "water",
        amount: 100,
        timestamp: BASE_TS,
        createdAt: BASE_TS,
        updatedAt: BASE_TS + 1000,
        deletedAt: null,
        deviceId: "dev-other",
        timezone: "UTC",
      });

      // Push a DIFFERENT row from our test user
      const ourRowId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({
              id: ourRowId,
              amount: 999,
              updatedAt: BASE_TS + 5000,
            }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);

      // Both rows exist independently
      const allRows = await ctx.db.select().from(schema.intakeRecords);
      expect(allRows).toHaveLength(2);
      const ourRow = allRows.find((r) => r.userId === "test-user-integration");
      const theirRow = allRows.find((r) => r.userId === otherUserId);
      expect(ourRow!.amount).toBe(999);
      expect(theirRow!.amount).toBe(100); // untouched
    });

    it("onConflictDoUpdate on shared PK overwrites cross-user (UUID collision guard)", async () => {
      // Documents known behavior: PK conflict resolution ignores userId.
      // In practice, client-generated UUIDs never collide. This test
      // verifies the behavior is understood, not that it's desirable.
      const otherUserId = "other-user";
      await ctx.pool.query(
        `INSERT INTO neon_auth.users_sync (id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [otherUserId],
      );

      const sharedId = "shared-id-collision";
      await ctx.db.insert(schema.intakeRecords).values({
        id: sharedId,
        userId: otherUserId,
        type: "water",
        amount: 100,
        timestamp: BASE_TS,
        createdAt: BASE_TS,
        updatedAt: BASE_TS + 1000,
        deletedAt: null,
        deviceId: "dev-other",
        timezone: "UTC",
      });

      // Push with the SAME id from a different user — LWW SELECT won't
      // find it (scoped to userId), so the route treats it as a new row
      // and issues INSERT ... ON CONFLICT DO UPDATE, which overwrites.
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({
              id: sharedId,
              amount: 999,
              updatedAt: BASE_TS + 5000,
            }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      // Only 1 row — the upsert overwrote on PK conflict
      const allRows = await ctx.db.select().from(schema.intakeRecords);
      expect(allRows).toHaveLength(1);
      expect(allRows[0]!.userId).toBe("test-user-integration");
      expect(allRows[0]!.amount).toBe(999);
    });
  });

  describe("users_sync auto-seeding (FK violation fix)", () => {
    it("succeeds even when user is not yet in users_sync", async () => {
      // Remove the pre-seeded test user from users_sync to simulate a fresh
      // Neon Auth user whose replication hasn't completed yet.
      await ctx.pool.query(
        `DELETE FROM neon_auth.users_sync WHERE id = $1`,
        ["test-user-integration"],
      );

      const rowId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({ id: rowId }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);
      expect(body.rejected).toHaveLength(0);

      // Verify the user was auto-seeded into users_sync
      const userRows = await ctx.pool.query(
        `SELECT id FROM neon_auth.users_sync WHERE id = $1`,
        ["test-user-integration"],
      );
      expect(userRows.rows).toHaveLength(1);

      // Verify the data row landed
      const rows = await ctx.db
        .select()
        .from(schema.intakeRecords)
        .where(eq(schema.intakeRecords.id, rowId));
      expect(rows).toHaveLength(1);
    });

    it("is idempotent when user already exists in users_sync", async () => {
      // User is already seeded by beforeAll — second upsert should be a no-op
      const rowId = crypto.randomUUID();
      const req = makePushRequest({
        ops: [
          {
            queueId: 1,
            tableName: "intakeRecords",
            op: "upsert",
            row: validIntakeRow({ id: rowId }),
          },
        ],
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushResponse;
      expect(body.accepted).toHaveLength(1);
      expect(body.rejected).toHaveLength(0);
    });
  });
});
