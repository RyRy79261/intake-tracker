/**
 * Sync push payload schema — drizzle-zod discriminated union keyed by tableName.
 *
 * Rationale:
 *   - D-06 (43-CONTEXT.md): Push payload per op is
 *     `{queueId, tableName, op: 'upsert'|'delete', row: {...full record}}`.
 *     Full rows, not diffs — server does the LWW compare and writes, simple
 *     and idempotent. Validation is via drizzle-zod schemas derived from
 *     src/db/schema.ts (Phase 42 D-20 unlocks this).
 *   - D-12 (43-CONTEXT.md): Conflict edges use record-level LWW by
 *     `updatedAt`; exact tie → server row wins; non-null `deletedAt` on
 *     either side → deleted wins; server is authoritative on ack. This
 *     module produces the validated op shape that the push route feeds into
 *     the LWW merge.
 *   - Security threat model (43-RESEARCH.md §Security, T-sync-05):
 *     "User A's client sends ops for User B's records" is mitigated by
 *     calling `.omit({ userId: true })` on every createInsertSchema below —
 *     the server derives `auth.userId!` from the Neon Auth session and
 *     never trusts a client-supplied userId.
 *   - DoS mitigation (T-sync-06): `z.array(opSchema).max(500)` caps batches
 *     at 500 ops to block oversized payloads before any DB work.
 *
 * This module is consumed by:
 *   - src/app/api/sync/push/route.ts (POST handler — validates body)
 *   - Plan 04 pull route reuses `schemaByTableName` for table lookups
 *   - Plan 06 engine reuses `PushOp` / `PushBody` types for client payloads
 */
// NOTE: drizzle-zod v0.8.x emits zod v4 types. The installed zod package
// (3.25.x) ships the v4 API under the `zod/v4` subpath for forward-compat;
// importing `z` from `zod/v4` makes the discriminated-union options below
// match the ZodObject type emitted by `createInsertSchema`.
import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";
import * as schema from "@/db/schema";

// ─────────────────────────────────────────────────────────────────────────
// Per-table row schemas
//
// Every data table has a `userId` column (Phase 42 SCHEMA-02). The server
// derives the user id from the Neon Auth session — .omit({userId: true})
// enforces at the type level that the client cannot forge it.
// ─────────────────────────────────────────────────────────────────────────

const intakeRecordsRowSchema = createInsertSchema(schema.intakeRecords).omit({
  userId: true,
});
const weightRecordsRowSchema = createInsertSchema(schema.weightRecords).omit({
  userId: true,
});
const bloodPressureRecordsRowSchema = createInsertSchema(
  schema.bloodPressureRecords,
).omit({ userId: true });
const eatingRecordsRowSchema = createInsertSchema(schema.eatingRecords).omit({
  userId: true,
});
const urinationRecordsRowSchema = createInsertSchema(
  schema.urinationRecords,
).omit({ userId: true });
const defecationRecordsRowSchema = createInsertSchema(
  schema.defecationRecords,
).omit({ userId: true });
const prescriptionsRowSchema = createInsertSchema(schema.prescriptions).omit({
  userId: true,
});
const medicationPhasesRowSchema = createInsertSchema(
  schema.medicationPhases,
).omit({ userId: true });
const phaseSchedulesRowSchema = createInsertSchema(schema.phaseSchedules).omit({
  userId: true,
});
const inventoryItemsRowSchema = createInsertSchema(schema.inventoryItems).omit({
  userId: true,
});
const inventoryTransactionsRowSchema = createInsertSchema(
  schema.inventoryTransactions,
).omit({ userId: true });
const doseLogsRowSchema = createInsertSchema(schema.doseLogs).omit({
  userId: true,
});
const dailyNotesRowSchema = createInsertSchema(schema.dailyNotes).omit({
  userId: true,
});
const auditLogsRowSchema = createInsertSchema(schema.auditLogs).omit({
  userId: true,
});
const substanceRecordsRowSchema = createInsertSchema(
  schema.substanceRecords,
).omit({ userId: true });
const titrationPlansRowSchema = createInsertSchema(schema.titrationPlans).omit({
  userId: true,
});

// ─────────────────────────────────────────────────────────────────────────
// Discriminated union keyed by tableName
// ─────────────────────────────────────────────────────────────────────────

const baseOpShape = {
  queueId: z.number().int(),
  op: z.enum(["upsert", "delete"]),
} as const;

const opSchema = z.discriminatedUnion("tableName", [
  z.object({
    ...baseOpShape,
    tableName: z.literal("intakeRecords"),
    row: intakeRecordsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("weightRecords"),
    row: weightRecordsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("bloodPressureRecords"),
    row: bloodPressureRecordsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("eatingRecords"),
    row: eatingRecordsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("urinationRecords"),
    row: urinationRecordsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("defecationRecords"),
    row: defecationRecordsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("prescriptions"),
    row: prescriptionsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("medicationPhases"),
    row: medicationPhasesRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("phaseSchedules"),
    row: phaseSchedulesRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("inventoryItems"),
    row: inventoryItemsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("inventoryTransactions"),
    row: inventoryTransactionsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("doseLogs"),
    row: doseLogsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("dailyNotes"),
    row: dailyNotesRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("auditLogs"),
    row: auditLogsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("substanceRecords"),
    row: substanceRecordsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("titrationPlans"),
    row: titrationPlansRowSchema,
  }),
]);

export const pushBodySchema = z.object({
  ops: z.array(opSchema).max(500),
});

// ─────────────────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────────────────

export type PushOp = z.infer<typeof opSchema>;
export type PushBody = z.infer<typeof pushBodySchema>;
export type TableName = PushOp["tableName"];

// ─────────────────────────────────────────────────────────────────────────
// schemaByTableName — maps each tableName literal to its Drizzle table ref.
//
// The push route does: `const table = schemaByTableName[op.tableName];`
// then issues Drizzle queries against `table`. `as const` preserves the
// exact table-reference types so downstream Drizzle queries stay typed.
// ─────────────────────────────────────────────────────────────────────────

export const schemaByTableName = {
  intakeRecords: schema.intakeRecords,
  weightRecords: schema.weightRecords,
  bloodPressureRecords: schema.bloodPressureRecords,
  eatingRecords: schema.eatingRecords,
  urinationRecords: schema.urinationRecords,
  defecationRecords: schema.defecationRecords,
  prescriptions: schema.prescriptions,
  medicationPhases: schema.medicationPhases,
  phaseSchedules: schema.phaseSchedules,
  inventoryItems: schema.inventoryItems,
  inventoryTransactions: schema.inventoryTransactions,
  doseLogs: schema.doseLogs,
  dailyNotes: schema.dailyNotes,
  auditLogs: schema.auditLogs,
  substanceRecords: schema.substanceRecords,
  titrationPlans: schema.titrationPlans,
} as const;

// --- Pull side (D-07, D-08) ---
//
// The pull route returns changes newer than per-table `updatedAt` cursors.
// Responses are soft-capped per table with a `hasMore` flag so the client can
// re-call until every table reports `hasMore: false`. `serverTime` is the
// anchor the client uses to clamp its next cursor (Pattern 7 in
// 43-RESEARCH.md: `cursor = min(maxRowUpdatedAt, serverTime - skewMargin)`).
//
// Co-located with the push exports above so reviewers can audit the full
// sync payload contract in one file.

/**
 * Soft cap on rows returned per table per pull request.
 *
 * Rationale (43-RESEARCH.md Pattern 7 + Pitfall 6):
 *   - Keeps memory bounded on first-login bulk pulls and week-offline
 *     reconnects. Client re-calls pull until `hasMore` is false for every
 *     table.
 *   - Chosen to fit comfortably in a single Neon HTTP response while still
 *     making forward progress on large tables.
 *   - Detection idiom in the route: `limit(PULL_SOFT_CAP + 1)` — if the DB
 *     returned the extra row, `hasMore = true` and we slice the response
 *     back to the cap.
 */
export const PULL_SOFT_CAP = 500;

/**
 * Enum of every syncable table name — derived from the push discriminated
 * union above so the pull-side schema and the push-side schema always agree
 * on what "a valid table" means.
 */
const tableNameSchema = z.enum([
  "intakeRecords",
  "weightRecords",
  "bloodPressureRecords",
  "eatingRecords",
  "urinationRecords",
  "defecationRecords",
  "prescriptions",
  "medicationPhases",
  "phaseSchedules",
  "inventoryItems",
  "inventoryTransactions",
  "doseLogs",
  "dailyNotes",
  "auditLogs",
  "substanceRecords",
  "titrationPlans",
]);

/**
 * Pull request body shape.
 *
 * Shape (D-07): `{ cursors: { tableName: lastSeenUpdatedAtMs, ... } }`.
 *   - Keys MUST be known tableName literals (enum validation blocks typos
 *     or cross-user fingerprinting via arbitrary keys).
 *   - Values MUST be non-negative integers (milliseconds epoch). Negative
 *     or non-integer cursors are rejected at the 400 boundary so the route
 *     never issues a WHERE clause with a suspect cursor.
 *   - Missing tableName keys default to cursor=0 server-side (= full pull
 *     for that table). That default lives in the route, not the schema.
 */
export const pullBodySchema = z.object({
  cursors: z.record(tableNameSchema, z.number().int().min(0)),
});

export type PullBody = z.infer<typeof pullBodySchema>;

/**
 * Pull response shape — plain TS type, not a Zod schema. The route constructs
 * these objects directly; clients decode them as `PullResponse` for type
 * safety in the engine loop (Plan 06).
 *
 * Contract:
 *   - `result[tableName].rows`: rows with `updatedAt > cursor`, ordered ASC.
 *     Tombstones (rows with non-null `deletedAt`) ARE included — the client
 *     applies them as soft-delete writes.
 *   - `result[tableName].hasMore`: true iff the server had to cap the page.
 *     Clients keep calling pull until every entry reports `hasMore: false`.
 *   - `serverTime`: `Date.now()` captured BEFORE any SELECT runs. Clients
 *     clamp their next cursor to `min(maxRowUpdatedAt, serverTime - 30s)` so
 *     rows that were written during the query window aren't skipped.
 */
export type PullResponse = {
  result: Record<
    TableName,
    { rows: Record<string, unknown>[]; hasMore: boolean }
  >;
  serverTime: number;
};
