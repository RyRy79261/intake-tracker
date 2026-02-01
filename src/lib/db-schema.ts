import { pgTable, text, integer, bigint, pgEnum, index } from "drizzle-orm/pg-core";

// Enums for type safety
export const intakeTypeEnum = pgEnum("intake_type", ["water", "salt"]);
export const bpPositionEnum = pgEnum("bp_position", ["standing", "sitting"]);
export const bpArmEnum = pgEnum("bp_arm", ["left", "right"]);

// Intake records (water and salt)
export const intakeRecords = pgTable(
  "intake_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: intakeTypeEnum("type").notNull(),
    amount: integer("amount").notNull(), // ml for water, mg for salt
    timestamp: bigint("timestamp", { mode: "number" }).notNull(), // Unix timestamp in ms
    source: text("source"), // "manual", "food:apple", "voice", etc.
    note: text("note"),
  },
  (table) => [
    index("intake_user_id_idx").on(table.userId),
    index("intake_timestamp_idx").on(table.timestamp),
    index("intake_type_idx").on(table.type),
  ]
);

// Weight records
export const weightRecords = pgTable(
  "weight_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    weight: integer("weight").notNull(), // stored in grams for precision (kg * 1000)
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    note: text("note"),
  },
  (table) => [
    index("weight_user_id_idx").on(table.userId),
    index("weight_timestamp_idx").on(table.timestamp),
  ]
);

// Blood pressure records
export const bloodPressureRecords = pgTable(
  "blood_pressure_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    systolic: integer("systolic").notNull(), // top number (mmHg)
    diastolic: integer("diastolic").notNull(), // bottom number (mmHg)
    heartRate: integer("heart_rate"), // BPM (optional)
    position: bpPositionEnum("position").notNull(),
    arm: bpArmEnum("arm").notNull(),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    note: text("note"),
  },
  (table) => [
    index("bp_user_id_idx").on(table.userId),
    index("bp_timestamp_idx").on(table.timestamp),
  ]
);

// Type exports for use in services
export type IntakeRecord = typeof intakeRecords.$inferSelect;
export type NewIntakeRecord = typeof intakeRecords.$inferInsert;

export type WeightRecord = typeof weightRecords.$inferSelect;
export type NewWeightRecord = typeof weightRecords.$inferInsert;

export type BloodPressureRecord = typeof bloodPressureRecords.$inferSelect;
export type NewBloodPressureRecord = typeof bloodPressureRecords.$inferInsert;
