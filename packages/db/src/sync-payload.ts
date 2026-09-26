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
import * as schema from "./schema";

// ─────────────────────────────────────────────────────────────────────────
// Per-table row schemas
//
// Every data table has a `userId` column (Phase 42 SCHEMA-02). The server
// derives the user id from the Neon Auth session — .omit({userId: true})
// enforces at the type level that the client cannot forge it.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Columns the client may never supply. `userId` comes from the session (see
 * T-sync-05 above); `serverUpdatedAt` is the server-assigned pull cursor,
 * stamped by the push route on every write. Omitting them means a
 * client-sent value is stripped by the parser rather than trusted.
 */
const SERVER_ONLY_COLUMNS = { userId: true, serverUpdatedAt: true } as const;

const intakeRecordsRowSchema = createInsertSchema(schema.intakeRecords).omit(SERVER_ONLY_COLUMNS);
const weightRecordsRowSchema = createInsertSchema(schema.weightRecords).omit(SERVER_ONLY_COLUMNS);
const bloodPressureRecordsRowSchema = createInsertSchema(
  schema.bloodPressureRecords,
).omit(SERVER_ONLY_COLUMNS);
const eatingRecordsRowSchema = createInsertSchema(schema.eatingRecords).omit(SERVER_ONLY_COLUMNS);
const urinationRecordsRowSchema = createInsertSchema(
  schema.urinationRecords,
).omit(SERVER_ONLY_COLUMNS);
const defecationRecordsRowSchema = createInsertSchema(
  schema.defecationRecords,
).omit(SERVER_ONLY_COLUMNS);
const prescriptionsRowSchema = createInsertSchema(schema.prescriptions).omit(SERVER_ONLY_COLUMNS);
const medicationPhasesRowSchema = createInsertSchema(
  schema.medicationPhases,
).omit(SERVER_ONLY_COLUMNS);
const phaseSchedulesRowSchema = createInsertSchema(schema.phaseSchedules).omit(SERVER_ONLY_COLUMNS);
const inventoryItemsRowSchema = createInsertSchema(schema.inventoryItems).omit(SERVER_ONLY_COLUMNS);
const inventoryTransactionsRowSchema = createInsertSchema(
  schema.inventoryTransactions,
).omit(SERVER_ONLY_COLUMNS);
const doseLogsRowSchema = createInsertSchema(schema.doseLogs).omit(SERVER_ONLY_COLUMNS);
const dailyNotesRowSchema = createInsertSchema(schema.dailyNotes).omit(SERVER_ONLY_COLUMNS);
const auditLogsRowSchema = createInsertSchema(schema.auditLogs).omit(SERVER_ONLY_COLUMNS);
const substanceRecordsRowSchema = createInsertSchema(
  schema.substanceRecords,
).omit(SERVER_ONLY_COLUMNS);
const titrationPlansRowSchema = createInsertSchema(schema.titrationPlans).omit(SERVER_ONLY_COLUMNS);
const userProfileRowSchema = createInsertSchema(schema.userProfile).omit(SERVER_ONLY_COLUMNS);
const insightReportsRowSchema = createInsertSchema(schema.insightReports).omit(SERVER_ONLY_COLUMNS);
const userSettingsRowSchema = createInsertSchema(schema.userSettings).omit(SERVER_ONLY_COLUMNS);

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
  z.object({
    ...baseOpShape,
    tableName: z.literal("userProfile"),
    row: userProfileRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("insightReports"),
    row: insightReportsRowSchema,
  }),
  z.object({
    ...baseOpShape,
    tableName: z.literal("userSettings"),
    row: userSettingsRowSchema,
  }),
]);

export const pushBodySchema = z.object({
  ops: z.array(opSchema).max(500),
});

/**
 * Per-op schema, exported so the push route can validate each op
 * INDIVIDUALLY instead of rejecting the entire batch when one row is
 * malformed. A single bad record (e.g. a NaN that JSON-serialised to null in
 * a notNull column) must never wedge the whole sync queue — it gets
 * quarantined into the `rejected` array while every other op still applies.
 */
export const opSchema_ = opSchema;

/**
 * Outer envelope only — validates that `ops` is an array within the DoS cap,
 * WITHOUT validating each op's row shape. The route pairs this with per-op
 * `opSchema_` validation so malformed rows are isolated, not fatal.
 */
export const pushEnvelopeSchema = z.object({
  ops: z.array(z.unknown()).max(500),
});


// ─────────────────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────────────────

export type PushOp = z.infer<typeof opSchema>;
export type TombstoneOp = z.infer<typeof tombstoneOpSchema>;
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
  userProfile: schema.userProfile,
  insightReports: schema.insightReports,
  userSettings: schema.userSettings,
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
 *
 * Exported so the sync-table parity guard (sync-payload.property.test.ts) can
 * assert this list, the push union, `schemaByTableName`, and the topology /
 * test-side lists never drift apart.
 */
export const tableNameSchema = z.enum([
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
  "userProfile",
  "insightReports",
  "userSettings",
]);

// ─────────────────────────────────────────────────────────────────────────
// Tombstone-only delete op
//
// A delete whose local Dexie row is already gone (a hard delete, e.g.
// `phase-service` bulk-deleting phaseSchedules) cannot carry a full row — the
// engine has nothing left to read, so it synthesises `{id, updatedAt,
// deletedAt}`. That stub can never satisfy `opSchema_`, which requires every
// NOT NULL column, so such a delete was quarantined as "invalid" and dropped:
// the deletion never reached the server and the next pull resurrected the row
// (issue #354).
//
// The stub is nonetheless enough to *delete* with. The route falls back to
// this schema and applies the tombstone as an UPDATE against the existing
// server row, never an insert — so no NOT NULL column is ever needed, and a
// row that does not exist server-side is simply a no-op. `tableName` is
// validated against the same enum as everything else and the UPDATE is still
// scoped by `auth.userId`, so this widens the shape a delete may take without
// widening what a client can reach.
// ─────────────────────────────────────────────────────────────────────────

export const tombstoneRowSchema = z.object({
  id: z.string().min(1).max(200),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative(),
});

export const tombstoneOpSchema = z.object({
  queueId: z.number().int(),
  op: z.literal("delete"),
  tableName: tableNameSchema,
  row: tombstoneRowSchema,
});

/**
 * Per-table pull cursor — a keyset `(updatedAt, id)` pair.
 *
 * The cursor is OPAQUE to the client: it echoes back the `cursor` the last
 * pull returned. Despite the wire name, `updatedAt` holds the row's
 * server-assigned `server_updated_at` stamp, not the client's `updatedAt`
 * (audit sync-engine#3). Migration 0021 backfilled `server_updated_at =
 * updated_at`, so cursors saved before the switch stay valid.
 *
 * Pagination orders by `(serverUpdatedAt, id)`, so the cursor needs both halves:
 * `updatedAt` alone is not unique (the v11 migration stamped every existing
 * record with a single timestamp), and a 500-row page boundary landing
 * inside such a run would otherwise strand every row after it.
 *
 * A bare `number` is still accepted for backwards compatibility — a
 * service-worker-cached pre-keyset client sends `updatedAt` only. The route
 * normalises it to `{ updatedAt: n, id: "" }`.
 */
const cursorSchema = z.union([
  z.number().int().min(0),
  z.object({
    updatedAt: z.number().int().min(0),
    // `id` is only ever used inside an `id > ?` keyset comparison scoped by
    // userId — capped to a sane length so a hostile body can't bloat the query.
    id: z.string().max(200),
  }),
]);

/**
 * Pull request body shape.
 *
 * Shape: `{ cursors: { tableName: { updatedAt, id }, ... } }`.
 *   - Keys MUST be known tableName literals (enum validation blocks typos
 *     or cross-user fingerprinting via arbitrary keys).
 *   - Values are keyset cursors (or a legacy bare `updatedAt` number).
 *     Negative / non-integer `updatedAt` is rejected at the 400 boundary so
 *     the route never issues a WHERE clause with a suspect cursor.
 *   - Missing tableName keys default to cursor=0 server-side (= full pull
 *     for that table). That default lives in the route, not the schema.
 */
export const pullBodySchema = z.object({
  // `partialRecord` (zod/v4) allows missing tableName keys — a missing entry
  // means "cursor = 0 for that table" (full pull). `invalid_key` errors fire
  // on unknown keys for ordinary table names (T-43-04-05 cursor injection).
  //
  // Prototype-shaped keys (`__proto__`) are a separate quirk: zod's
  // `partialRecord` silently strips them BEFORE downstream validation
  // runs, so a `.refine()` on the partialRecord output can never see
  // them. The `z.preprocess` layer below validates the raw input's
  // OWN keys against the enum first, so `__proto__` (and any other
  // unknown key) is rejected at the boundary before partialRecord
  // normalises the shape.
  //
  // Runtime exposure is still zero — the route iterates
  // schemaByTableName, not body.cursors — but rejecting at the schema
  // boundary keeps the contract honest and protects future refactors.
  // Discovered by src/lib/sync-payload.property.test.ts PULL-2.
  cursors: z.preprocess((raw, ctx) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      // Let partialRecord emit the canonical "expected object" error.
      return raw;
    }
    for (const k of Object.keys(raw as Record<string, unknown>)) {
      if (!tableNameSchema.safeParse(k).success) {
        ctx.addIssue({
          code: "custom",
          message: `cursors contains an unknown table key: ${k}`,
          path: ["cursors", k],
        });
        return z.NEVER;
      }
    }
    return raw;
  }, z.partialRecord(tableNameSchema, cursorSchema)),
  // Which keyset the cursors are in. `"server"` = `(serverUpdatedAt, id)` —
  // sent by every client that stores the returned `cursor` (audit
  // sync-engine#3). Absent = a service-worker-cached older client that
  // derives its cursor from the last row's own `updatedAt`; it keeps being
  // paged by `(updatedAt, id)`, since server-stamp order would hand it pages
  // whose last row sits behind the page start and it would re-request the
  // same page forever. An older server strips the unknown key and answers in
  // `updatedAt` space without a `cursor`, which the client falls back to.
  cursorKind: z.literal("server").optional(),
});

export type PullBody = z.infer<typeof pullBodySchema>;

/**
 * Pull response shape — plain TS type, not a Zod schema. The route constructs
 * these objects directly; clients decode them as `PullResponse` for type
 * safety in the engine loop (Plan 06).
 *
 * Contract:
 *   - `result[tableName].rows`: rows past the cursor in `(serverUpdatedAt,
 *     id)` order. Tombstones (rows with non-null `deletedAt`) ARE included —
 *     the client applies them as soft-delete writes. `serverUpdatedAt` is
 *     stripped from every row; it is server-only.
 *   - `result[tableName].hasMore`: true iff the server had to cap the page.
 *     Clients keep calling pull until every entry reports `hasMore: false`.
 *   - `result[tableName].cursor`: the keyset position of the last returned
 *     row, present when `rows` is non-empty. The client stores it verbatim
 *     and sends it back as that table's cursor.
 *   - `serverTime`: `Date.now()` captured BEFORE any SELECT runs, on the same
 *     clock as `serverUpdatedAt`. Clients clamp their next cursor to
 *     `min(cursor, serverTime - 30s)` so rows written by a push still in
 *     flight during the query window aren't skipped.
 */
export type PullCursor = { updatedAt: number; id: string };

export type PullResponse = {
  result: Record<
    TableName,
    { rows: Record<string, unknown>[]; hasMore: boolean; cursor?: PullCursor }
  >;
  serverTime: number;
};
