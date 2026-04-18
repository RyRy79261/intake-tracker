/**
 * Postgres schema — single source of truth for all 20 tables.
 *
 * Mirrors src/lib/db.ts Dexie v15 interfaces exactly (16 app tables) and
 * includes 4 push notification tables that replace scripts/push-migration.sql.
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
  serial,
  date,
  timestamp,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────
// Cross-schema reference: neon_auth.users_sync is managed by Neon Auth.
// Our migrations do NOT create or modify this table — only reference it.
// ─────────────────────────────────────────────────────────────────────────
const neonAuth = pgSchema("neon_auth");
export const usersSync = neonAuth.table("users_sync", {
  id: text("id").primaryKey(),
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
      sql`${t.type} IN ('water','salt')`,
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
    isActive: boolean("is_active").notNull(),
    // NOTE: no timezone column — Prescription interface in src/lib/db.ts omits it.
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
    phaseId: text("phase_id")
      .notNull()
      .references(() => medicationPhases.id),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => phaseSchedules.id),
    inventoryItemId: text("inventory_item_id").references(
      () => inventoryItems.id,
    ),
    scheduledDate: text("scheduled_date").notNull(),
    scheduledTime: text("scheduled_time").notNull(),
    status: text("status").notNull(),
    actionTimestamp: bigint("action_timestamp", { mode: "number" }),
    rescheduledTo: text("rescheduled_to"),
    skipReason: text("skip_reason"),
    note: text("note"),
    // DoseLog DOES have a timezone column (line 269 of src/lib/db.ts).
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
    // All 28 AuditAction values copied verbatim from src/lib/db.ts lines 24-53.
    actionCheck: check(
      "audit_logs_action_check",
      sql`${t.action} IN (
        'ai_parse_request','ai_parse_success','ai_parse_error','data_export',
        'data_import','data_clear','settings_change','api_key_set','api_key_clear',
        'pin_set','pin_verify_success','pin_verify_failure','dose_taken',
        'dose_skipped','dose_rescheduled','prescription_added','prescription_updated',
        'inventory_adjusted','phase_activated','validation_error','dose_untaken',
        'prescription_deleted','phase_completed','phase_started','stock_recalculated',
        'inventory_added','inventory_deleted','titration_plan_updated','timezone_adjusted'
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
