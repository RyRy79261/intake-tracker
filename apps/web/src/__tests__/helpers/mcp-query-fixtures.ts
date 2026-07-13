/**
 * Fixture builders for MCP query-function integration tests.
 *
 * The MCP read queries in `src/lib/mcp/queries.ts` run against real Postgres
 * (see `mcp-queries.integration.test.ts`, which wires `setupTestDb()` into
 * `@intake/db/client` via `vi.mock`). Every record table carries a wall of
 * NOT NULL sync columns (createdAt/updatedAt/deviceId/timezone/…) that are
 * irrelevant to what a query test asserts, so these builders fill sane
 * defaults and let each test override only the fields under test.
 *
 * Ids are unique per process via a monotonic counter — no randomness, so
 * failures are reproducible.
 */
import type * as schema from "@intake/db/schema";

type WeightInsert = typeof schema.weightRecords.$inferInsert;
type SubstanceInsert = typeof schema.substanceRecords.$inferInsert;
type IntakeInsert = typeof schema.intakeRecords.$inferInsert;
type EatingInsert = typeof schema.eatingRecords.$inferInsert;
type PrescriptionInsert = typeof schema.prescriptions.$inferInsert;
type MedicationPhaseInsert = typeof schema.medicationPhases.$inferInsert;
type PhaseScheduleInsert = typeof schema.phaseSchedules.$inferInsert;
type DoseLogInsert = typeof schema.doseLogs.$inferInsert;
type InventoryItemInsert = typeof schema.inventoryItems.$inferInsert;
type InventoryTxInsert = typeof schema.inventoryTransactions.$inferInsert;

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** NOT NULL sync columns without `timezone` (medication-domain tables). */
function baseSync(ts: number) {
  return {
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null as number | null,
    deviceId: "test-device",
  };
}

/** NOT NULL sync columns for record tables that carry a `timezone` column. */
function syncColumns(ts: number) {
  return { ...baseSync(ts), timezone: "UTC" };
}

/**
 * A weight_records insert row. Defaults to 72.5 kg at `Date.now()`; pass
 * `timestamp`, `deletedAt`, `userId`, etc. to override.
 */
export function weightFixture(
  userId: string,
  overrides: Partial<WeightInsert> = {},
): WeightInsert {
  const ts = overrides.timestamp ?? Date.now();
  return {
    id: uid("weight"),
    userId,
    weight: 72.5,
    timestamp: ts,
    note: null,
    ...syncColumns(ts),
    ...overrides,
  };
}

/**
 * A substance_records insert row. Defaults to a standalone caffeine record;
 * pass `type: "alcohol"` with `abvPercent`/`amountStandardDrinks`/`volumeMl`
 * for a drink. `source` must be one of 'standalone' | 'water_intake' |
 * 'eating' and `type` one of 'caffeine' | 'alcohol' (CHECK-constrained).
 */
export function substanceFixture(
  userId: string,
  overrides: Partial<SubstanceInsert> = {},
): SubstanceInsert {
  const ts = overrides.timestamp ?? Date.now();
  return {
    id: uid("substance"),
    userId,
    type: "caffeine",
    description: "Espresso",
    source: "standalone",
    timestamp: ts,
    ...syncColumns(ts),
    ...overrides,
  };
}

/**
 * An intake_records insert row. Defaults to a 250 ml manual water entry; pass
 * `source: "substance:<id>"` to model the water half of a decomposed drink,
 * or `type`/`amount` for salt/sugar/potassium. `type` is CHECK-constrained to
 * 'water' | 'salt' | 'sugar' | 'potassium'.
 */
export function intakeFixture(
  userId: string,
  overrides: Partial<IntakeInsert> = {},
): IntakeInsert {
  const ts = overrides.timestamp ?? Date.now();
  return {
    id: uid("intake"),
    userId,
    type: "water",
    amount: 250,
    timestamp: ts,
    source: "manual",
    note: null,
    ...syncColumns(ts),
    ...overrides,
  };
}

/** An eating_records insert row (food log entry). `grams` is nullable. */
export function eatingFixture(
  userId: string,
  overrides: Partial<EatingInsert> = {},
): EatingInsert {
  const ts = overrides.timestamp ?? Date.now();
  return {
    id: uid("eating"),
    userId,
    timestamp: ts,
    grams: 100,
    note: null,
    ...syncColumns(ts),
    ...overrides,
  };
}

// ── Medication domain (FK chain: prescription → phase → schedule → dose) ──
// These tables have no `timezone` column, so they use baseSync (except
// dose_logs, which does carry timezone).

/** A prescriptions insert row. `isActive` true, live by default. */
export function prescriptionFixture(
  userId: string,
  overrides: Partial<PrescriptionInsert> = {},
): PrescriptionInsert {
  const ts = overrides.updatedAt ?? Date.now();
  return {
    id: uid("presc"),
    userId,
    genericName: "Furosemide",
    indication: "Heart failure",
    isActive: true,
    ...baseSync(ts),
    ...overrides,
  };
}

/** A medication_phases insert row. FK: prescriptionId → prescriptions.id. */
export function medicationPhaseFixture(
  userId: string,
  prescriptionId: string,
  overrides: Partial<MedicationPhaseInsert> = {},
): MedicationPhaseInsert {
  const ts = Date.now();
  return {
    id: uid("phase"),
    userId,
    prescriptionId,
    type: "maintenance",
    unit: "mg",
    startDate: ts,
    foodInstruction: "none",
    status: "active",
    ...baseSync(ts),
    ...overrides,
  };
}

/** A phase_schedules insert row. FK: phaseId → medication_phases.id. */
export function phaseScheduleFixture(
  userId: string,
  phaseId: string,
  overrides: Partial<PhaseScheduleInsert> = {},
): PhaseScheduleInsert {
  const ts = Date.now();
  return {
    id: uid("sched"),
    userId,
    phaseId,
    time: "08:00",
    scheduleTimeUTC: 360,
    anchorTimezone: "UTC",
    dosage: 1,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    unit: "mg",
    ...baseSync(ts),
    ...overrides,
  };
}

/**
 * A dose_logs insert row. `refs` must reference existing prescription/phase/
 * schedule rows (all three FKs are NOT NULL). dose_logs carries a `timezone`
 * column, so it uses syncColumns.
 */
export function doseLogFixture(
  userId: string,
  refs: { prescriptionId: string; phaseId: string; scheduleId: string },
  overrides: Partial<DoseLogInsert> = {},
): DoseLogInsert {
  const ts = Date.now();
  return {
    id: uid("dose"),
    userId,
    prescriptionId: refs.prescriptionId,
    phaseId: refs.phaseId,
    scheduleId: refs.scheduleId,
    scheduledDate: "2026-07-13",
    scheduledTime: "08:00",
    status: "taken",
    actionTimestamp: ts,
    ...syncColumns(ts),
    ...overrides,
  };
}

/**
 * An inventory_items insert row. FK: prescriptionId → prescriptions.id.
 * `currentStock` defaults to null so tests exercise the transaction-sum path;
 * pass it explicitly to test the legacy fallback.
 */
export function inventoryItemFixture(
  userId: string,
  prescriptionId: string,
  overrides: Partial<InventoryItemInsert> = {},
): InventoryItemInsert {
  const ts = Date.now();
  return {
    id: uid("inv"),
    userId,
    prescriptionId,
    brandName: "Lasix",
    strength: 40,
    unit: "mg",
    pillShape: "round",
    pillColor: "white",
    isActive: true,
    currentStock: null,
    ...syncColumns(ts),
    ...overrides,
  };
}

/**
 * An inventory_transactions insert row. FK: inventoryItemId → inventory_items.
 * `amount` is signed (refill/initial positive, consumed negative, adjustments
 * either way); `type` is CHECK-constrained to refill|consumed|adjusted|initial.
 */
export function inventoryTxFixture(
  userId: string,
  inventoryItemId: string,
  overrides: Partial<InventoryTxInsert> = {},
): InventoryTxInsert {
  const ts = Date.now();
  return {
    id: uid("invtx"),
    userId,
    inventoryItemId,
    timestamp: ts,
    amount: 30,
    type: "refill",
    ...syncColumns(ts),
    ...overrides,
  };
}
