/**
 * Canonical client data-model record types for intake-tracker.
 *
 * Moved verbatim out of `apps/web/src/lib/db.ts` in Phase 3a so the type root
 * lives in `@intake/types` (the Dexie runtime — the `new Dexie()` instance, the
 * `AppDatabase` type and the `version().stores()` migration blocks — stays in
 * the app). `db.ts` re-exports every symbol here, so existing `@/lib/db` type
 * importers are unaffected.
 *
 * PARITY COUPLING (do not break):
 *   - These interfaces are mirrored field-for-field by the Drizzle tables in
 *     `@intake/db/schema`. `apps/web/src/__tests__/schema-parity.test.ts` fails
 *     the build if they drift. When you add/rename a field here, update
 *     `@intake/db/schema` in the same change.
 *   - `apps/web/src/__tests__/dexie-schema-extractor.ts` parses THIS file as
 *     text (single-file `ts.createSourceFile`) and requires every Dexie table
 *     interface it checks (the 18 in its TABLE_TO_INTERFACE map) to be declared
 *     here. Keep every record interface in this one file — do not split them
 *     across modules, or the single-file parse will miss them.
 *
 * This module is pure types (zero runtime, zero imports) — keep it that way.
 */

export interface IntakeRecord {
  id: string;
  type: "water" | "salt" | "sugar" | "potassium";
  amount: number; // ml for water, mg for salt, g for sugar, mg for potassium
  timestamp: number; // Unix timestamp in milliseconds
  source?: string; // "manual", "food:apple", "voice", etc.
  note?: string; // Optional note for the entry
  createdAt: number; // Unix ms — set once on creation
  updatedAt: number; // Unix ms — updated on every mutation
  deletedAt: number | null; // null = active, number = soft-deleted timestamp
  deviceId: string; // device identifier for sync conflict resolution
  timezone: string; // IANA timezone, e.g. "Europe/Berlin"
  groupId?: string; // shared key linking records in a composable group
  originalInputText?: string; // stored on primary record only, for AI re-run
  groupSource?: string; // "ai_food_parse" | "ai_substance_lookup" | "manual"
}

export type AuditAction =
  | "ai_parse_request"
  | "ai_parse_success"
  | "ai_parse_error"
  | "data_export"
  | "data_import"
  | "data_clear"
  | "settings_change"
  | "api_key_set"
  | "api_key_clear"
  | "pin_set"
  | "pin_verify_success"
  | "pin_verify_failure"
  | "dose_taken"
  | "dose_skipped"
  | "dose_rescheduled"
  | "dose_time_edited"
  | "prescription_added"
  | "prescription_updated"
  | "inventory_adjusted"
  | "phase_activated"
  | "validation_error"
  | "dose_untaken"
  | "prescription_deleted"
  | "phase_completed"
  | "phase_started"
  | "stock_recalculated"
  | "inventory_added"
  | "inventory_deleted"
  | "titration_plan_updated"
  | "timezone_adjusted";

export interface AuditLog {
  id: string;
  timestamp: number;
  action: AuditAction;
  details?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}

export interface WeightRecord {
  id: string;
  weight: number; // in kg
  timestamp: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}

export interface BloodPressureRecord {
  id: string;
  systolic: number; // top number (mmHg)
  diastolic: number; // bottom number (mmHg)
  heartRate?: number; // BPM (optional)
  irregularHeartbeat?: boolean; // optional flag for irregular heartbeat
  position: "standing" | "sitting";
  arm: "left" | "right";
  timestamp: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}

export interface EatingRecord {
  id: string;
  timestamp: number;
  grams?: number; // optional weight in grams
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
  groupId?: string; // shared key linking records in a composable group
  originalInputText?: string; // stored on primary record only, for AI re-run
  groupSource?: string; // "ai_food_parse" | "ai_substance_lookup" | "manual"
}

export interface UrinationRecord {
  id: string;
  timestamp: number;
  amountEstimate?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}

export interface DefecationRecord {
  id: string;
  timestamp: number;
  amountEstimate?: string; // "small" | "medium" | "large"
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}

export type PillShape = "round" | "oval" | "capsule" | "diamond" | "tablet";
export type FoodInstruction = "before" | "after" | "none";
export type DoseStatus = "taken" | "skipped" | "rescheduled" | "pending";

/**
 * One active ingredient of a combination drug, with its per-pill (or
 * per-reference-dose) strength. Combination tablets like Entresto/Vymada
 * carry two: e.g. `{ name: "Sacubitril", strength: 49 }` +
 * `{ name: "Valsartan", strength: 51 }` for a "Vymada 100" tablet.
 * The unit is shared with the parent record's `unit` field (normally "mg").
 */
export interface CompoundStrength {
  name: string;
  strength: number;
}

export interface Prescription {
  id: string;
  genericName: string;
  indication: string;
  notes?: string;
  contraindications?: string[];
  warnings?: string[];
  /**
   * Active ingredients for a combination drug. Absent ⇒ single-compound
   * prescription (the common case). When present (length ≥ 2) the strengths
   * describe one standard reference dose and fix the compound ratio used to
   * label doses. Non-indexed — no Dexie version bump required.
   */
  compounds?: CompoundStrength[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export type PhaseType = "maintenance" | "titration";

export interface MedicationPhase {
  id: string;
  prescriptionId: string;
  type: PhaseType;
  unit: string;
  startDate: number;
  endDate?: number;
  foodInstruction: FoodInstruction;
  foodNote?: string;
  notes?: string;
  status: "active" | "completed" | "cancelled" | "pending";
  titrationPlanId?: string; // links titration phases to their parent plan
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export type TitrationPlanStatus = "draft" | "active" | "completed" | "cancelled";

export interface TitrationPlan {
  id: string;
  title: string;
  conditionLabel: string; // e.g. "Heart failure", managed as unique labels
  recommendedStartDate?: number;
  status: TitrationPlanStatus;
  notes?: string;
  warnings?: string[]; // warning signs to look out for
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface PhaseSchedule {
  id: string;
  phaseId: string;
  /** @deprecated Use scheduleTimeUTC. Kept for v10 DB record compatibility. */
  time: string;
  scheduleTimeUTC: number; // minutes from midnight UTC (integer)
  anchorTimezone: string; // IANA timezone when schedule was created
  dosage: number;
  daysOfWeek: number[];
  enabled: boolean;
  unit?: string; // dosage unit for display, e.g. "mg"
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface InventoryItem {
  id: string;
  prescriptionId: string;
  brandName: string;
  /** @deprecated Use inventoryTransactions sum. Will be removed in Phase 3. */
  currentStock?: number;
  /** Sum of `compounds` strengths for a combination tablet; the single
   *  per-pill strength otherwise. Always the pill-math denominator. */
  strength: number;
  /**
   * Per-pill breakdown for a combination tablet (e.g. Vymada 100 ⇒
   * Sacubitril 49 + Valsartan 51). Absent ⇒ single-compound pill.
   * `strength` stays authoritative for dose math; this is descriptive.
   */
  compounds?: CompoundStrength[];
  unit: string;
  pillShape: PillShape;
  pillColor: string;
  visualIdentification?: string;
  refillAlertDays?: number;
  refillAlertPills?: number;
  isActive: boolean;
  isArchived?: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}

export interface InventoryTransaction {
  id: string;
  inventoryItemId: string;
  timestamp: number;
  amount: number;
  note?: string;
  type: "refill" | "consumed" | "adjusted" | "initial";
  doseLogId?: string; // links consumed transaction to the dose that caused it
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}

export interface DailyNote {
  id: string;
  date: string; // YYYY-MM-DD
  prescriptionId?: string;
  doseLogId?: string;
  note: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
}

export interface DoseLog {
  id: string;
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  inventoryItemId?: string;
  scheduledDate: string;
  scheduledTime: string;
  status: DoseStatus;
  actionTimestamp?: number;
  rescheduledTo?: string;
  skipReason?: string;
  note?: string;
  timezone: string; // IANA timezone string, e.g. "Africa/Johannesburg"
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface SubstanceRecord {
  id: string;
  type: 'caffeine' | 'alcohol';
  amountMg?: number;           // caffeine mg
  amountStandardDrinks?: number; // alcohol: metric standard drinks (derived from abvPercent + volumeMl)
  abvPercent?: number;          // alcohol: alcohol by volume %, the user-entered input value
  volumeMl?: number;            // liquid volume for fluid balance linking
  description: string;
  source: 'water_intake' | 'eating' | 'standalone';
  sourceRecordId?: string;      // links to original intake record if migrated
  aiEnriched?: boolean;         // true if AI has refined the estimate
  timestamp: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
  timezone: string;
  groupId?: string; // shared key linking records in a composable group
  originalInputText?: string; // stored on primary record only, for AI re-run
  groupSource?: string; // "ai_food_parse" | "ai_substance_lookup" | "manual"
}

/** Sync queue op-log row (Dexie v16+, Phase 43 D-01).
 *  `id` is auto-increment (++id). `op: 'delete'` exists for future hard-delete paths
 *  but is unused in the P43 pilot (soft-deletes go through upsert with deletedAt set). */
export interface SyncQueueRow {
  id?: number;
  tableName: string;
  recordId: string;
  op: "upsert" | "delete";
  enqueuedAt: number;
  attempts: number;
}

/** Per-table pull cursor (Dexie v16+, Phase 43 D-07). Singleton per tableName. */
export interface SyncMetaRow {
  tableName: string;
  lastPulledUpdatedAt: number;
  /**
   * Tiebreaker for the keyset cursor — the `id` of the last row consumed at
   * `lastPulledUpdatedAt`. Pagination orders by `(updatedAt, id)` so that a
   * page boundary landing inside a run of rows that share one `updatedAt`
   * (e.g. the v11 migration stamped every record with a single timestamp)
   * cannot strand the rows after the boundary. Absent on cursors written by
   * pre-keyset clients — readers default it to `""` (sorts before any id).
   */
  lastPulledId?: string;
}

/** Source of a captured error/warning. Device-local debug data, never synced. */
export type ErrorLogSource =
  | "window-error"
  | "unhandled-rejection"
  | "error-boundary"
  | "console-error"
  | "console-warn"
  | "api-error";

/** Captured error/warning. Local-only (Dexie v17+); not part of backup or sync. */
export interface ErrorLogEntry {
  id: string;
  timestamp: number;
  source: ErrorLogSource;
  message: string;
  stack?: string;
  componentStack?: string;
  route?: string;
  userAgent?: string;
  appVersion?: string;
}

/**
 * Single-user medical profile (Dexie v18). Holds user-reported medical
 * conditions that give AI analytics insights clinical context (e.g. why the
 * sodium and fluid limits matter). The app treats it as a singleton — the
 * service layer reads the most-recently-updated active row — but each row
 * carries a globally-unique `id` so it backs up and cloud-syncs through the
 * standard record-oriented engine alongside every other table.
 */
export interface UserProfile {
  id: string;
  conditions: string[]; // user-reported medical conditions, e.g. "HFrEF"
  shareConditionsWithAI: boolean; // opt-in: include conditions in AI insights
  shareMedicationsWithAI: boolean; // opt-in: include active medications in AI insights
  aiInsightsConsentAt: number | null; // when the user first consented; null = never
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

/**
 * A cached AI analytics insight report (Dexie v19). Each row is one generated
 * "AI Insights" summary — the narrative and observations the model produced
 * for a rolling analysis window. Persisting them gives the user a history of
 * past assessments and lets a fresh analysis optionally compare against the
 * previous one. Synced and backed up like every other record-oriented table.
 */
export interface InsightReport {
  id: string;
  generatedAt: number; // when the AI produced this report (Unix ms)
  rangeStart: number; // analysis window start (Unix ms)
  rangeEnd: number; // analysis window end (Unix ms)
  narrative: string; // plain-language summary
  observations: string[]; // specific factual observations
  // URLs the model cited via web_search (deep mode only). Optional —
  // fast-mode reports and legacy rows from before sources were tracked
  // leave this undefined.
  sources?: string[];
  personalised: boolean; // whether the user's medical profile fed the analysis
  // "fast" = sync Sonnet summary; "deep" = async Opus + web-search deep
  // research. Optional for rows written before the two-tier rollout — the
  // client treats `undefined` as "fast".
  mode?: "fast" | "deep";
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}
