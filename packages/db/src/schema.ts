/**
 * Postgres schema — single source of truth for all 29 tables.
 *
 * Mirrors the @intake/types/records Dexie interfaces exactly (18 app tables),
 * includes 4 push notification tables that replace scripts/push-migration.sql,
 * 3 server-only AI tables (user_api_keys, user_key_shares, ai_usage), and
 * 4 server-only MCP-connector tables (mcp_oauth_clients, mcp_auth_codes,
 * mcp_access_tokens, mcp_audit_log) that have no Dexie counterpart.
 *
 * Conventions:
 *   - TS property: camelCase (matches Dexie interfaces)
 *   - SQL column:  snake_case (first arg to the column builder)
 *   - Unix-ms timestamps: bigint mode:"number" (matches Dexie's number-based timestamps)
 *   - Union types: text + CHECK constraint (D-04 — not pgEnum)
 *   - Arrays: native Postgres arrays (text[], integer[]) — D-03
 *   - user_id: text, NOT NULL, FK → neon_auth.users_sync(id) ON DELETE CASCADE (D-07)
 *   - Inner FKs (prescription_id, phase_id, etc.): declared without cascade (D-08)
 *   - Sync scaffolding on every app table: created_at / updated_at / deleted_at / device_id
 *
 * Parity enforcement: src/__tests__/schema-parity.test.ts (Plan 42-03) verifies that
 * every Dexie table field has a matching column here, with `userId` as the only
 * permitted Drizzle-only addition.
 *
 * NEVER edit this file without regenerating migrations: pnpm exec drizzle-kit generate
 */
import {
  pgSchema,
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  real,
  jsonb,
  serial,
  date,
  timestamp,
  check,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────
// neon_auth.users_sync — local mirror of authenticated users.
//
// Neon Auth's hosted user-sync was never enabled on this database, so this
// table is created and populated by the app itself: 0000_init.sql creates it
// and withAuth() upserts {id, email} on every authenticated request. Every
// other table's user_id FK points here, so the upsert must happen before any
// user-scoped insert.
// ─────────────────────────────────────────────────────────────────────────
const neonAuth = pgSchema("neon_auth");
export const usersSync = neonAuth.table("users_sync", {
  id: text("id").primaryKey(),
  email: text("email"),
});

// ─────────────────────────────────────────────────────────────────────────
// Health records
// ─────────────────────────────────────────────────────────────────────────

export const intakeRecords = pgTable(
  "intake_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    amount: integer("amount").notNull(),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    source: text("source"),
    note: text("note"),
    groupId: text("group_id"),
    originalInputText: text("original_input_text"),
    groupSource: text("group_source"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    typeCheck: check(
      "intake_records_type_check",
      sql`${t.type} IN ('water','salt','sugar','potassium')`,
    ),
    userUpdatedIdx: index("idx_intake_user_updated").on(t.userId, t.updatedAt),
    typeTimestampIdx: index("idx_intake_type_ts").on(t.type, t.timestamp),
    groupIdx: index("idx_intake_group").on(t.groupId),
  }),
);

export const weightRecords = pgTable(
  "weight_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    // Dexie stores kg as number — commonly decimals like 72.5. Use `real` for
    // 4-byte floating point. Non-breaking upgrade from `integer` since the
    // Dexie interface already accepts decimals.
    weight: real("weight").notNull(),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    note: text("note"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    userUpdatedIdx: index("idx_weight_user_updated").on(t.userId, t.updatedAt),
  }),
);

export const bloodPressureRecords = pgTable(
  "blood_pressure_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    systolic: integer("systolic").notNull(),
    diastolic: integer("diastolic").notNull(),
    heartRate: integer("heart_rate"),
    irregularHeartbeat: boolean("irregular_heartbeat"),
    position: text("position").notNull(),
    arm: text("arm").notNull(),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    note: text("note"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    positionCheck: check(
      "blood_pressure_records_position_check",
      sql`${t.position} IN ('standing','sitting')`,
    ),
    armCheck: check(
      "blood_pressure_records_arm_check",
      sql`${t.arm} IN ('left','right')`,
    ),
    userUpdatedIdx: index("idx_bp_user_updated").on(t.userId, t.updatedAt),
    timestampIdx: index("idx_bp_ts").on(t.timestamp),
  }),
);

export const eatingRecords = pgTable(
  "eating_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    grams: integer("grams"),
    note: text("note"),
    groupId: text("group_id"),
    originalInputText: text("original_input_text"),
    groupSource: text("group_source"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    userUpdatedIdx: index("idx_eating_user_updated").on(t.userId, t.updatedAt),
    groupIdx: index("idx_eating_group").on(t.groupId),
  }),
);

export const urinationRecords = pgTable(
  "urination_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    amountEstimate: text("amount_estimate"),
    note: text("note"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    userUpdatedIdx: index("idx_urination_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
  }),
);

export const defecationRecords = pgTable(
  "defecation_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    amountEstimate: text("amount_estimate"),
    note: text("note"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    userUpdatedIdx: index("idx_defecation_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
  }),
);

export const substanceRecords = pgTable(
  "substance_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    amountMg: integer("amount_mg"),
    // Standard drinks are often fractional (e.g. 1.5). Use real.
    amountStandardDrinks: real("amount_standard_drinks"),
    // Alcohol by volume %, the user-entered input value. Fractional (e.g. 4.2).
    abvPercent: real("abv_percent"),
    volumeMl: integer("volume_ml"),
    description: text("description").notNull(),
    source: text("source").notNull(),
    // Inner FK without cascade (D-08). Lazy callback so forward-ref works if needed.
    sourceRecordId: text("source_record_id").references(
      () => intakeRecords.id,
    ),
    aiEnriched: boolean("ai_enriched"),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    groupId: text("group_id"),
    originalInputText: text("original_input_text"),
    groupSource: text("group_source"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    typeCheck: check(
      "substance_records_type_check",
      sql`${t.type} IN ('caffeine','alcohol')`,
    ),
    sourceCheck: check(
      "substance_records_source_check",
      sql`${t.source} IN ('water_intake','eating','standalone')`,
    ),
    abvPercentRangeCheck: check(
      "substance_records_abv_percent_range",
      sql`${t.abvPercent} IS NULL OR (${t.abvPercent} >= 0 AND ${t.abvPercent} <= 100)`,
    ),
    userUpdatedIdx: index("idx_substance_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    typeTimestampIdx: index("idx_substance_type_ts").on(t.type, t.timestamp),
    groupIdx: index("idx_substance_group").on(t.groupId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// Medication domain
//
// NOTE: `prescriptions` is defined first because it is referenced by
// `medicationPhases`, `inventoryItems`, `dailyNotes`, and `doseLogs`.
// `titrationPlans` is placed above `medicationPhases` because Drizzle's
// `.references(() => titrationPlans.id)` evaluates the callback lazily but
// module-scope `const` declarations cannot reference symbols declared later
// in the same file (TDZ). Keep declaration order: prescriptions → titrationPlans
// → medicationPhases → phaseSchedules → inventoryItems → doseLogs → inventoryTransactions.
// Parity test (Plan 42-03) does not care about file order, only exports.
// ─────────────────────────────────────────────────────────────────────────

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    genericName: text("generic_name").notNull(),
    indication: text("indication").notNull(),
    notes: text("notes"),
    contraindications: text("contraindications").array(),
    warnings: text("warnings").array(),
    // Combination-drug active ingredients (mirrors Dexie CompoundStrength[]).
    compounds: jsonb("compounds").$type<{ name: string; strength: number }[]>(),
    isActive: boolean("is_active").notNull(),
    // NOTE: no timezone column — Prescription interface in @intake/types/records omits it.
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
  },
  (t) => ({
    userUpdatedIdx: index("idx_prescriptions_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    isActiveIdx: index("idx_prescriptions_active").on(t.isActive),
  }),
);

export const titrationPlans = pgTable(
  "titration_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    conditionLabel: text("condition_label").notNull(),
    recommendedStartDate: bigint("recommended_start_date", { mode: "number" }),
    status: text("status").notNull(),
    notes: text("notes"),
    warnings: text("warnings").array(),
    // NOTE: no timezone column — TitrationPlan interface omits it.
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
  },
  (t) => ({
    statusCheck: check(
      "titration_plans_status_check",
      sql`${t.status} IN ('draft','active','completed','cancelled')`,
    ),
    userUpdatedIdx: index("idx_titration_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    conditionIdx: index("idx_titration_condition").on(t.conditionLabel),
    statusIdx: index("idx_titration_status").on(t.status),
  }),
);

export const medicationPhases = pgTable(
  "medication_phases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    prescriptionId: text("prescription_id")
      .notNull()
      .references(() => prescriptions.id),
    type: text("type").notNull(),
    unit: text("unit").notNull(),
    startDate: bigint("start_date", { mode: "number" }).notNull(),
    endDate: bigint("end_date", { mode: "number" }),
    foodInstruction: text("food_instruction").notNull(),
    foodNote: text("food_note"),
    notes: text("notes"),
    status: text("status").notNull(),
    titrationPlanId: text("titration_plan_id").references(
      () => titrationPlans.id,
    ),
    // NOTE: no timezone column — MedicationPhase interface omits it.
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
  },
  (t) => ({
    typeCheck: check(
      "medication_phases_type_check",
      sql`${t.type} IN ('maintenance','titration')`,
    ),
    foodInstructionCheck: check(
      "medication_phases_food_instruction_check",
      sql`${t.foodInstruction} IN ('before','after','none')`,
    ),
    statusCheck: check(
      "medication_phases_status_check",
      sql`${t.status} IN ('active','completed','cancelled','pending')`,
    ),
    userUpdatedIdx: index("idx_phases_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    prescriptionIdx: index("idx_phases_prescription").on(t.prescriptionId),
    statusTypeIdx: index("idx_phases_status_type").on(t.status, t.type),
  }),
);

export const phaseSchedules = pgTable(
  "phase_schedules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    phaseId: text("phase_id")
      .notNull()
      .references(() => medicationPhases.id),
    /** @deprecated Kept for Dexie interface parity; scheduleTimeUTC is authoritative. */
    time: text("time").notNull(),
    scheduleTimeUTC: integer("schedule_time_utc").notNull(),
    // PhaseSchedule uses anchorTimezone instead of a plain `timezone` column.
    anchorTimezone: text("anchor_timezone").notNull(),
    // Dosages commonly decimal (e.g. 0.5 mg half-pill).
    dosage: real("dosage").notNull(),
    daysOfWeek: integer("days_of_week").array().notNull(),
    enabled: boolean("enabled").notNull(),
    unit: text("unit"),
    // NOTE: no `timezone` column — PhaseSchedule omits it; anchorTimezone covers it.
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
  },
  (t) => ({
    userUpdatedIdx: index("idx_phase_schedules_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    phaseIdx: index("idx_phase_schedules_phase").on(t.phaseId),
    enabledIdx: index("idx_phase_schedules_enabled").on(t.enabled),
  }),
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    prescriptionId: text("prescription_id")
      .notNull()
      .references(() => prescriptions.id),
    brandName: text("brand_name").notNull(),
    /** @deprecated Kept for Dexie interface parity; inventoryTransactions is authoritative. */
    currentStock: integer("current_stock"),
    strength: real("strength").notNull(),
    // Per-pill combination-drug breakdown (mirrors Dexie CompoundStrength[]).
    compounds: jsonb("compounds").$type<{ name: string; strength: number }[]>(),
    unit: text("unit").notNull(),
    pillShape: text("pill_shape").notNull(),
    pillColor: text("pill_color").notNull(),
    visualIdentification: text("visual_identification"),
    refillAlertDays: integer("refill_alert_days"),
    refillAlertPills: integer("refill_alert_pills"),
    isActive: boolean("is_active").notNull(),
    isArchived: boolean("is_archived"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    pillShapeCheck: check(
      "inventory_items_pill_shape_check",
      sql`${t.pillShape} IN ('round','oval','capsule','diamond','tablet')`,
    ),
    userUpdatedIdx: index("idx_inventory_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    prescriptionIdx: index("idx_inventory_prescription").on(t.prescriptionId),
    isActiveIdx: index("idx_inventory_active").on(t.isActive),
  }),
);

export const doseLogs = pgTable(
  "dose_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    prescriptionId: text("prescription_id")
      .notNull()
      .references(() => prescriptions.id),
    // Nullable for PRN ("as needed") doses, which have no phase/schedule. The
    // kindFieldsCheck below still requires both for scheduled doses.
    phaseId: text("phase_id").references(() => medicationPhases.id),
    scheduleId: text("schedule_id").references(() => phaseSchedules.id),
    inventoryItemId: text("inventory_item_id").references(
      () => inventoryItems.id,
    ),
    scheduledDate: text("scheduled_date").notNull(),
    scheduledTime: text("scheduled_time").notNull(),
    status: text("status").notNull(),
    // 'scheduled' = logged against a phase schedule; 'prn' = an as-needed dose
    // (e.g. furosemide) with no phase/schedule. NOT NULL DEFAULT backfills
    // every existing server row, so kind is always present server-side.
    kind: text("kind").notNull().default("scheduled"),
    // Optional explicit dose (mg) for a PRN dose when it isn't derivable from
    // the linked inventory item + quantity.
    doseMg: real("dose_mg"),
    actionTimestamp: bigint("action_timestamp", { mode: "number" }),
    rescheduledTo: text("rescheduled_to"),
    skipReason: text("skip_reason"),
    note: text("note"),
    // DoseLog DOES have a timezone column (see the DoseLog interface in @intake/types/records).
    timezone: text("timezone").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
  },
  (t) => ({
    statusCheck: check(
      "dose_logs_status_check",
      sql`${t.status} IN ('taken','skipped','rescheduled','pending')`,
    ),
    kindCheck: check(
      "dose_logs_kind_check",
      sql`${t.kind} IN ('scheduled','prn')`,
    ),
    // A scheduled dose must carry both phase and schedule; a PRN dose need not.
    kindFieldsCheck: check(
      "dose_logs_kind_fields_check",
      sql`${t.kind} = 'prn' OR (${t.phaseId} IS NOT NULL AND ${t.scheduleId} IS NOT NULL)`,
    ),
    userUpdatedIdx: index("idx_dose_logs_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    prescriptionDateIdx: index("idx_dose_logs_prescription_date").on(
      t.prescriptionId,
      t.scheduledDate,
    ),
    statusIdx: index("idx_dose_logs_status").on(t.status),
  }),
);

export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    amount: integer("amount").notNull(),
    note: text("note"),
    type: text("type").notNull(),
    doseLogId: text("dose_log_id").references(() => doseLogs.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    typeCheck: check(
      "inventory_transactions_type_check",
      sql`${t.type} IN ('refill','consumed','adjusted','initial')`,
    ),
    userUpdatedIdx: index("idx_inventory_tx_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    itemTimestampIdx: index("idx_inventory_tx_item_ts").on(
      t.inventoryItemId,
      t.timestamp,
    ),
    typeIdx: index("idx_inventory_tx_type").on(t.type),
  }),
);

export const dailyNotes = pgTable(
  "daily_notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    prescriptionId: text("prescription_id").references(() => prescriptions.id),
    doseLogId: text("dose_log_id").references(() => doseLogs.id),
    note: text("note").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    userUpdatedIdx: index("idx_daily_notes_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    dateIdx: index("idx_daily_notes_date").on(t.date),
    prescriptionIdx: index("idx_daily_notes_prescription").on(t.prescriptionId),
  }),
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    action: text("action").notNull(),
    details: text("details"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
    timezone: text("timezone").notNull(),
  },
  (t) => ({
    // All 29 AuditAction values copied verbatim from the AuditAction type in @intake/types/records.
    actionCheck: check(
      "audit_logs_action_check",
      sql`${t.action} IN (
        'ai_parse_request','ai_parse_success','ai_parse_error','data_export',
        'data_import','data_clear','settings_change','api_key_set','api_key_clear',
        'pin_set','pin_verify_success','pin_verify_failure','dose_taken',
        'dose_skipped','dose_rescheduled','dose_time_edited','prescription_added',
        'prescription_updated','inventory_adjusted','phase_activated','validation_error',
        'dose_untaken','prescription_deleted','phase_completed','phase_started',
        'stock_recalculated','inventory_added','inventory_deleted','titration_plan_updated',
        'timezone_adjusted'
      )`,
    ),
    userUpdatedIdx: index("idx_audit_user_updated").on(t.userId, t.updatedAt),
    actionTimestampIdx: index("idx_audit_action_ts").on(
      t.action,
      t.timestamp,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// User medical profile — mirrors the UserProfile interface in @intake/types/records.
// Treated as a per-user singleton by the app, but stored as a normal synced
// table (globally-unique `id`). No `timezone` column — UserProfile omits it.
// ─────────────────────────────────────────────────────────────────────────

export const userProfile = pgTable(
  "user_profile",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    conditions: text("conditions").array().notNull(),
    shareConditionsWithAI: boolean("share_conditions_with_ai").notNull(),
    // .default(false) keeps the ADD COLUMN migration safe on existing rows.
    shareMedicationsWithAI: boolean("share_medications_with_ai")
      .notNull()
      .default(false),
    aiInsightsConsentAt: bigint("ai_insights_consent_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
  },
  (t) => ({
    userUpdatedIdx: index("idx_user_profile_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// Cached AI analytics insight reports — mirrors the InsightReport interface
// in @intake/types/records. One row per generated "AI Insights" summary. No
// `timezone` column — InsightReport omits it.
// ─────────────────────────────────────────────────────────────────────────

export const insightReports = pgTable(
  "insight_reports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    generatedAt: bigint("generated_at", { mode: "number" }).notNull(),
    rangeStart: bigint("range_start", { mode: "number" }).notNull(),
    rangeEnd: bigint("range_end", { mode: "number" }).notNull(),
    narrative: text("narrative").notNull(),
    observations: text("observations").array().notNull(),
    // URLs cited by the model when web_search was used (deep mode). Null
    // for fast-mode reports and for legacy rows persisted before sources
    // were tracked.
    sources: text("sources").array(),
    personalised: boolean("personalised").notNull(),
    // "fast" = sync Sonnet summary; "deep" = async Opus + web-search deep
    // research. Nullable for backward compatibility with rows written before
    // the two-tier rollout (treated as "fast" by the client).
    mode: text("mode"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    deviceId: text("device_id").notNull(),
  },
  (t) => ({
    modeCheck: check(
      "insight_reports_mode_check",
      sql`${t.mode} IS NULL OR ${t.mode} IN ('fast','deep')`,
    ),
    userUpdatedIdx: index("idx_insight_reports_user_updated").on(
      t.userId,
      t.updatedAt,
    ),
    generatedAtIdx: index("idx_insight_reports_generated").on(t.generatedAt),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// Deep-research insight jobs — server-only state for async batch requests.
//
// Each row tracks one Anthropic Message Batches submission for the deep
// analytics summary (Opus 4.6 + web search). Polling endpoints look up the
// row, ask Anthropic for batch status, and on completion persist the result
// to `insight_reports` (synced) and flip status to "completed".
//
// Server-only — does NOT participate in Dexie sync. One pending job per user
// is enforced by a partial unique index on user_id.
// ─────────────────────────────────────────────────────────────────────────

export const insightJobs = pgTable(
  "insight_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    // Nullable: we reserve the pending-job lock BEFORE submitting to
    // Anthropic so a duplicate submission is rejected by the DB rather
    // than leaking a paid batch. The polling endpoint only treats jobs
    // with a non-null batch_id as actually submitted.
    batchId: text("batch_id"),
    status: text("status").notNull(),
    // The validated AnalyticsInsightsRequest that was submitted, so we can
    // re-run or audit later without depending on Anthropic retaining bodies.
    requestPayload: jsonb("request_payload").notNull(),
    // FK with ON DELETE SET NULL so a hard-deleted insight_reports row
    // doesn't leave a dangling reference on the historical job. Soft-delete
    // is the normal path; this guards the rare hard-delete (data clear).
    resultReportId: text("result_report_id").references(
      (): typeof insightReports.id => insightReports.id,
      { onDelete: "set null" },
    ),
    // Free-text error from Anthropic or from server-side validation on
    // completion (e.g. tool_use input failed schema). Populated when
    // status="failed".
    error: text("error"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    completedAt: bigint("completed_at", { mode: "number" }),
  },
  (t) => ({
    statusCheck: check(
      "insight_jobs_status_check",
      sql`${t.status} IN ('pending','completed','failed','expired')`,
    ),
    // One pending job per user — partial unique index, only enforced on
    // pending rows so completed/failed history can accumulate freely.
    onePendingPerUser: uniqueIndex("insight_jobs_one_pending_per_user_uq")
      .on(t.userId)
      .where(sql`status = 'pending'`),
    userCreatedIdx: index("idx_insight_jobs_user_created").on(
      t.userId,
      t.createdAt,
    ),
    batchIdx: index("idx_insight_jobs_batch").on(t.batchId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// Push notification tables (4)
//
// These tables replace scripts/push-migration.sql. Their SQL column shapes
// match exactly what src/lib/push-db.ts expects (SERIAL ids, TIMESTAMPTZ for
// created_at/updated_at on push_subscriptions, etc.) so the raw-SQL queries
// in push-db.ts continue to work unmodified apart from the table rename
// (push_dose_schedules → push_schedules, handled in Task 3 of this plan).
//
// The user_id FK is additive — push-db.ts INSERTs with user_id values that
// already come from Neon Auth sessions.
// ─────────────────────────────────────────────────────────────────────────

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersSync.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  authKey: text("auth_key").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const pushSchedules = pgTable(
  "push_schedules",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    timeSlot: text("time_slot").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    medicationsJson: text("medications_json").notNull(),
  },
  (t) => ({
    uniqueSlot: uniqueIndex("push_schedules_user_slot_dow_uq").on(
      t.userId,
      t.timeSlot,
      t.dayOfWeek,
    ),
  }),
);

export const pushSentLog = pgTable(
  "push_sent_log",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    timeSlot: text("time_slot").notNull(),
    sentDate: date("sent_date").notNull(),
    followUpIndex: integer("follow_up_index").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    uniqueSend: uniqueIndex("push_sent_log_uq").on(
      t.userId,
      t.timeSlot,
      t.sentDate,
      t.followUpIndex,
    ),
  }),
);

export const pushSettings = pgTable("push_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersSync.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  followUpCount: integer("follow_up_count").notNull().default(2),
  followUpIntervalMinutes: integer("follow_up_interval_minutes")
    .notNull()
    .default(10),
  dayStartHour: integer("day_start_hour").notNull().default(2),
});

// ─────────────────────────────────────────────────────────────────────────
// User-supplied AI provider keys.
//
// One row per user. Each provider column stores a versioned encrypted blob
// (see src/lib/key-vault.ts). The `*Last4` columns hold the last 4 plaintext
// characters for UI display only — never the whole key. Encryption secret
// lives in API_KEY_ENCRYPTION_SECRET; rotating it invalidates every stored
// key (users re-enter). KMS migration: add a "v2:" prefix to the blob in
// the same column.
// ─────────────────────────────────────────────────────────────────────────

export const userApiKeys = pgTable("user_api_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersSync.id, { onDelete: "cascade" }),
  anthropicKeyEncrypted: text("anthropic_key_encrypted"),
  anthropicLast4: text("anthropic_last4"),
  groqKeyEncrypted: text("groq_key_encrypted"),
  groqLast4: text("groq_last4"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────
// Key sharing — a grantor lets a grantee use the grantor's stored key for a
// specific provider. Both ids reference users_sync; the composite primary key
// (grantor, grantee, provider) prevents duplicate grants.
// ─────────────────────────────────────────────────────────────────────────

export const userKeyShares = pgTable(
  "user_key_shares",
  {
    grantorId: text("grantor_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    granteeId: text("grantee_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    granteeEmail: text("grantee_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.grantorId, t.granteeId, t.provider] }),
    providerCheck: check(
      "user_key_shares_provider_check",
      sql`${t.provider} IN ('anthropic','groq')`,
    ),
    granteeIdx: index("idx_user_key_shares_grantee").on(t.granteeId, t.provider),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// AI usage tracking — one row per AI call, fire-and-forget insert after the
// upstream provider responds. `userId` is the caller; `keyOwnerId` is whose
// key was used (self, a grantor, or null for the env-var fallback).
// ─────────────────────────────────────────────────────────────────────────

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    keyOwnerId: text("key_owner_id").references(() => usersSync.id, {
      onDelete: "set null",
    }),
    keySource: text("key_source").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    route: text("route").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheCreateTokens: integer("cache_create_tokens").notNull().default(0),
    audioSeconds: integer("audio_seconds"),
    status: text("status").notNull(),
    durationMs: integer("duration_ms"),
  },
  (t) => ({
    keySourceCheck: check(
      "ai_usage_key_source_check",
      sql`${t.keySource} IN ('own_stored','shared_from','env_var')`,
    ),
    providerCheck: check(
      "ai_usage_provider_check",
      sql`${t.provider} IN ('anthropic','groq')`,
    ),
    statusCheck: check(
      "ai_usage_status_check",
      sql`${t.status} IN ('success','error')`,
    ),
    userTsIdx: index("idx_ai_usage_user_ts").on(t.userId, t.timestamp),
    keyOwnerTsIdx: index("idx_ai_usage_owner_ts").on(t.keyOwnerId, t.timestamp),
  }),
);

// ─────────────────────────────────────────────────────────────────────────
// MCP (Model Context Protocol) custom connector for claude.ai.
//
// These four tables back an OAuth 2.1 + DCR (RFC 7591) authorization
// server that lets claude.ai's "Custom Connectors" feature query this
// app's data on behalf of an authenticated Neon Auth user. User identity
// is delegated to the existing Neon Auth Google sign-in flow; these
// tables only persist the OAuth state needed to mint and validate tokens
// scoped to a userId. See docs/mcp-connector.md.
//
// All four are server-only — they do NOT participate in Dexie sync.
// ─────────────────────────────────────────────────────────────────────────

export const mcpOauthClients = pgTable(
  "mcp_oauth_clients",
  {
    clientId: text("client_id").primaryKey(),
    clientSecretHash: text("client_secret_hash"),
    clientName: text("client_name").notNull(),
    redirectUris: text("redirect_uris").array().notNull(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull(),
    scope: text("scope"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    lastUsedAt: bigint("last_used_at", { mode: "number" }),
  },
  (t) => ({
    authMethodCheck: check(
      "mcp_oauth_clients_auth_method_check",
      sql`${t.tokenEndpointAuthMethod} IN ('none','client_secret_basic','client_secret_post')`,
    ),
  }),
);

export const mcpAuthCodes = pgTable(
  "mcp_auth_codes",
  {
    code: text("code").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => mcpOauthClients.clientId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull(),
    scope: text("scope").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    consumedAt: bigint("consumed_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    challengeMethodCheck: check(
      "mcp_auth_codes_challenge_method_check",
      sql`${t.codeChallengeMethod} IN ('S256','plain')`,
    ),
    clientIdx: index("idx_mcp_auth_codes_client").on(t.clientId),
    expiresIdx: index("idx_mcp_auth_codes_expires").on(t.expiresAt),
  }),
);

export const mcpAccessTokens = pgTable(
  "mcp_access_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    refreshTokenHash: text("refresh_token_hash").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => mcpOauthClients.clientId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    refreshExpiresAt: bigint("refresh_expires_at", { mode: "number" }),
    revokedAt: bigint("revoked_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    lastUsedAt: bigint("last_used_at", { mode: "number" }),
  },
  (t) => ({
    userIdx: index("idx_mcp_access_tokens_user").on(t.userId),
    expiresIdx: index("idx_mcp_access_tokens_expires").on(t.expiresAt),
  }),
);

export const mcpAuditLog = pgTable(
  "mcp_audit_log",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    tool: text("tool").notNull(),
    argsJson: text("args_json"),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
  },
  (t) => ({
    statusCheck: check(
      "mcp_audit_log_status_check",
      sql`${t.status} IN ('success','error')`,
    ),
    userTsIdx: index("idx_mcp_audit_user_ts").on(t.userId, t.timestamp),
  }),
);

// Native (Capacitor) Google sign-in bridge — server-only (no Dexie mirror).
//
// After the Neon Auth OAuth exchange completes INSIDE the system-browser Custom
// Tab (where the PKCE challenge cookie lives), the /auth/native-bridge page mints
// a one-time `code` bound to the resulting Neon session token and hands ONLY the
// code back to the app via a verified HTTPS App Link (never the token in a URL).
// The app exchanges it (POST /api/auth/native-claim) for the session token and
// uses it on the existing Bearer path. Single-use + short-lived: the row is
// deleted on claim and ignored past `expiresAt` (~60s). The session token lives
// here only for that window; the row is removed the instant it is claimed.
export const nativeAuthCodes = pgTable(
  "native_auth_codes",
  {
    code: text("code").primaryKey(),
    sessionToken: text("session_token").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => usersSync.id, { onDelete: "cascade" }),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    expiresIdx: index("idx_native_auth_codes_expires").on(t.expiresAt),
  }),
);
