/**
 * Read-only Drizzle queries that back the MCP tools.
 *
 * Every function is user-scoped — the caller MUST pass the userId resolved
 * from the validated MCP bearer token. Cross-user reads are impossible
 * because every WHERE clause includes `eq(table.userId, userId)`.
 *
 * Tombstones (`deletedAt IS NOT NULL`) are filtered out — tools should
 * never expose soft-deleted rows to the model.
 *
 * Every query that scans a time range has a hard row cap (5000) returned
 * as a `truncated` flag so the model knows to narrow the window.
 */
import { and, asc, desc, eq, gte, isNull, lte, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import {
  intakeRecords,
  weightRecords,
  bloodPressureRecords,
  eatingRecords,
  substanceRecords,
  prescriptions,
  medicationPhases,
  phaseSchedules,
  inventoryItems,
  doseLogs,
  pushSettings,
} from "@/db/schema";

const MAX_ROWS = 5000;
const DEFAULT_DAY_START_HOUR = 2;

interface DateRange {
  start: number;
  end: number;
}

function notDeleted<T extends { deletedAt: unknown }>(table: T) {
  return isNull((table as { deletedAt: { name: string } }).deletedAt as never);
}

async function getDayStartHour(userId: string): Promise<number> {
  const rows = await db
    .select({ dayStartHour: pushSettings.dayStartHour })
    .from(pushSettings)
    .where(eq(pushSettings.userId, userId))
    .limit(1);
  return rows[0]?.dayStartHour ?? DEFAULT_DAY_START_HOUR;
}

function todayStartTimestamp(dayStartHour: number, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(dayStartHour, 0, 0, 0);
  const ts = d.getTime();
  return ts > now ? ts - 24 * 60 * 60_000 : ts;
}

// ─────────────────────────────────────────────────────────────────────────
// Today summary
// ─────────────────────────────────────────────────────────────────────────

export async function getTodaySummary(userId: string) {
  const dayStartHour = await getDayStartHour(userId);
  const startTs = todayStartTimestamp(dayStartHour);
  const nowTs = Date.now();

  const intake = await db
    .select({
      type: intakeRecords.type,
      total: sql<number>`sum(${intakeRecords.amount})`.as("total"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(intakeRecords)
    .where(
      and(
        eq(intakeRecords.userId, userId),
        gte(intakeRecords.timestamp, startTs),
        lte(intakeRecords.timestamp, nowTs),
        isNull(intakeRecords.deletedAt),
      ),
    )
    .groupBy(intakeRecords.type);

  const latestBp = await db
    .select({
      systolic: bloodPressureRecords.systolic,
      diastolic: bloodPressureRecords.diastolic,
      heartRate: bloodPressureRecords.heartRate,
      timestamp: bloodPressureRecords.timestamp,
    })
    .from(bloodPressureRecords)
    .where(
      and(
        eq(bloodPressureRecords.userId, userId),
        isNull(bloodPressureRecords.deletedAt),
      ),
    )
    .orderBy(desc(bloodPressureRecords.timestamp))
    .limit(1);

  const latestWeight = await db
    .select({
      weight: weightRecords.weight,
      timestamp: weightRecords.timestamp,
    })
    .from(weightRecords)
    .where(
      and(
        eq(weightRecords.userId, userId),
        isNull(weightRecords.deletedAt),
      ),
    )
    .orderBy(desc(weightRecords.timestamp))
    .limit(1);

  const doses = await db
    .select({
      status: doseLogs.status,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(doseLogs)
    .where(
      and(
        eq(doseLogs.userId, userId),
        gte(doseLogs.actionTimestamp, startTs),
        lte(doseLogs.actionTimestamp, nowTs),
        isNull(doseLogs.deletedAt),
      ),
    )
    .groupBy(doseLogs.status);

  const intakeTotals = {
    water_ml: 0,
    salt_mg: 0,
    sugar_g: 0,
  };
  for (const row of intake) {
    if (row.type === "water") intakeTotals.water_ml = Number(row.total) || 0;
    else if (row.type === "salt") intakeTotals.salt_mg = Number(row.total) || 0;
    else if (row.type === "sugar") intakeTotals.sugar_g = Number(row.total) || 0;
  }

  return {
    day_started_at: startTs,
    now: nowTs,
    intake: intakeTotals,
    latest_blood_pressure: latestBp[0] ?? null,
    latest_weight: latestWeight[0] ?? null,
    doses: doses.map((d) => ({ status: d.status, count: Number(d.count) })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// History queries
// ─────────────────────────────────────────────────────────────────────────

export async function queryIntakeHistory(
  userId: string,
  type: "water" | "salt" | "sugar" | "all",
  range: DateRange,
) {
  const typeFilter =
    type === "all"
      ? undefined
      : eq(intakeRecords.type, type);
  const rows = await db
    .select({
      id: intakeRecords.id,
      type: intakeRecords.type,
      amount: intakeRecords.amount,
      timestamp: intakeRecords.timestamp,
      source: intakeRecords.source,
      note: intakeRecords.note,
    })
    .from(intakeRecords)
    .where(
      and(
        eq(intakeRecords.userId, userId),
        gte(intakeRecords.timestamp, range.start),
        lte(intakeRecords.timestamp, range.end),
        isNull(intakeRecords.deletedAt),
        ...(typeFilter ? [typeFilter] : []),
      ),
    )
    .orderBy(asc(intakeRecords.timestamp))
    .limit(MAX_ROWS + 1);

  return capRows(rows);
}

export async function queryWeightHistory(userId: string, range: DateRange) {
  const rows = await db
    .select({
      id: weightRecords.id,
      weight: weightRecords.weight,
      timestamp: weightRecords.timestamp,
      note: weightRecords.note,
    })
    .from(weightRecords)
    .where(
      and(
        eq(weightRecords.userId, userId),
        gte(weightRecords.timestamp, range.start),
        lte(weightRecords.timestamp, range.end),
        isNull(weightRecords.deletedAt),
      ),
    )
    .orderBy(asc(weightRecords.timestamp))
    .limit(MAX_ROWS + 1);
  return capRows(rows);
}

export async function queryBloodPressureHistory(
  userId: string,
  range: DateRange,
) {
  const rows = await db
    .select({
      id: bloodPressureRecords.id,
      systolic: bloodPressureRecords.systolic,
      diastolic: bloodPressureRecords.diastolic,
      heartRate: bloodPressureRecords.heartRate,
      irregularHeartbeat: bloodPressureRecords.irregularHeartbeat,
      position: bloodPressureRecords.position,
      arm: bloodPressureRecords.arm,
      timestamp: bloodPressureRecords.timestamp,
      note: bloodPressureRecords.note,
    })
    .from(bloodPressureRecords)
    .where(
      and(
        eq(bloodPressureRecords.userId, userId),
        gte(bloodPressureRecords.timestamp, range.start),
        lte(bloodPressureRecords.timestamp, range.end),
        isNull(bloodPressureRecords.deletedAt),
      ),
    )
    .orderBy(asc(bloodPressureRecords.timestamp))
    .limit(MAX_ROWS + 1);
  return capRows(rows);
}

export async function queryEatingHistory(userId: string, range: DateRange) {
  const rows = await db
    .select({
      id: eatingRecords.id,
      grams: eatingRecords.grams,
      note: eatingRecords.note,
      originalInputText: eatingRecords.originalInputText,
      timestamp: eatingRecords.timestamp,
      groupId: eatingRecords.groupId,
    })
    .from(eatingRecords)
    .where(
      and(
        eq(eatingRecords.userId, userId),
        gte(eatingRecords.timestamp, range.start),
        lte(eatingRecords.timestamp, range.end),
        isNull(eatingRecords.deletedAt),
      ),
    )
    .orderBy(asc(eatingRecords.timestamp))
    .limit(MAX_ROWS + 1);
  const capped = capRows(rows);

  // Attach substance records (caffeine / alcohol) linked via groupId.
  const groupIds = Array.from(
    new Set(capped.items.map((r) => r.groupId).filter((g): g is string => !!g)),
  );
  let substances: Array<{
    groupId: string | null;
    type: string;
    amountMg: number | null;
    amountStandardDrinks: number | null;
    abvPercent: number | null;
    volumeMl: number | null;
    description: string;
    timestamp: number;
  }> = [];
  if (groupIds.length > 0) {
    substances = await db
      .select({
        groupId: substanceRecords.groupId,
        type: substanceRecords.type,
        amountMg: substanceRecords.amountMg,
        amountStandardDrinks: substanceRecords.amountStandardDrinks,
        abvPercent: substanceRecords.abvPercent,
        volumeMl: substanceRecords.volumeMl,
        description: substanceRecords.description,
        timestamp: substanceRecords.timestamp,
      })
      .from(substanceRecords)
      .where(
        and(
          eq(substanceRecords.userId, userId),
          inArray(substanceRecords.groupId, groupIds),
          isNull(substanceRecords.deletedAt),
        ),
      );
  }
  return {
    ...capped,
    substances,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Medication queries
// ─────────────────────────────────────────────────────────────────────────

export async function listMedications(userId: string) {
  const presc = await db
    .select({
      id: prescriptions.id,
      genericName: prescriptions.genericName,
      indication: prescriptions.indication,
      notes: prescriptions.notes,
      isActive: prescriptions.isActive,
    })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.userId, userId),
        eq(prescriptions.isActive, true),
        isNull(prescriptions.deletedAt),
      ),
    );

  if (presc.length === 0) return { medications: [] };

  const prescIds = presc.map((p) => p.id);

  const phases = await db
    .select({
      id: medicationPhases.id,
      prescriptionId: medicationPhases.prescriptionId,
      type: medicationPhases.type,
      unit: medicationPhases.unit,
      startDate: medicationPhases.startDate,
      endDate: medicationPhases.endDate,
      foodInstruction: medicationPhases.foodInstruction,
      status: medicationPhases.status,
    })
    .from(medicationPhases)
    .where(
      and(
        eq(medicationPhases.userId, userId),
        eq(medicationPhases.status, "active"),
        inArray(medicationPhases.prescriptionId, prescIds),
        isNull(medicationPhases.deletedAt),
      ),
    );

  const phaseIds = phases.map((p) => p.id);
  const schedules =
    phaseIds.length === 0
      ? []
      : await db
          .select({
            id: phaseSchedules.id,
            phaseId: phaseSchedules.phaseId,
            time: phaseSchedules.time,
            dosage: phaseSchedules.dosage,
            unit: phaseSchedules.unit,
            daysOfWeek: phaseSchedules.daysOfWeek,
            enabled: phaseSchedules.enabled,
          })
          .from(phaseSchedules)
          .where(
            and(
              eq(phaseSchedules.userId, userId),
              eq(phaseSchedules.enabled, true),
              inArray(phaseSchedules.phaseId, phaseIds),
              isNull(phaseSchedules.deletedAt),
            ),
          );

  return {
    medications: presc.map((p) => ({
      ...p,
      active_phases: phases
        .filter((ph) => ph.prescriptionId === p.id)
        .map((ph) => ({
          ...ph,
          schedules: schedules.filter((s) => s.phaseId === ph.id),
        })),
    })),
  };
}

export async function listRecentDoses(userId: string, limit: number) {
  const cap = Math.min(Math.max(limit, 1), 500);
  const rows = await db
    .select({
      id: doseLogs.id,
      prescriptionId: doseLogs.prescriptionId,
      scheduledDate: doseLogs.scheduledDate,
      scheduledTime: doseLogs.scheduledTime,
      status: doseLogs.status,
      actionTimestamp: doseLogs.actionTimestamp,
      skipReason: doseLogs.skipReason,
      note: doseLogs.note,
      genericName: prescriptions.genericName,
    })
    .from(doseLogs)
    // Scope the join by user + soft-delete so we never surface a dose
    // joined against a prescription that belongs to another user (FKs
    // prevent it today, but the explicit predicate is defence in depth)
    // or a soft-deleted prescription.
    .leftJoin(
      prescriptions,
      and(
        eq(doseLogs.prescriptionId, prescriptions.id),
        eq(prescriptions.userId, userId),
        isNull(prescriptions.deletedAt),
      ),
    )
    .where(and(eq(doseLogs.userId, userId), isNull(doseLogs.deletedAt)))
    .orderBy(desc(doseLogs.actionTimestamp))
    .limit(cap);
  return { doses: rows };
}

export async function getInventoryStatus(userId: string) {
  const rows = await db
    .select({
      id: inventoryItems.id,
      prescriptionId: inventoryItems.prescriptionId,
      brandName: inventoryItems.brandName,
      currentStock: inventoryItems.currentStock,
      strength: inventoryItems.strength,
      unit: inventoryItems.unit,
      refillAlertPills: inventoryItems.refillAlertPills,
      refillAlertDays: inventoryItems.refillAlertDays,
      isActive: inventoryItems.isActive,
      genericName: prescriptions.genericName,
    })
    .from(inventoryItems)
    .leftJoin(
      prescriptions,
      and(
        eq(inventoryItems.prescriptionId, prescriptions.id),
        eq(prescriptions.userId, userId),
        isNull(prescriptions.deletedAt),
      ),
    )
    .where(
      and(
        eq(inventoryItems.userId, userId),
        eq(inventoryItems.isActive, true),
        isNull(inventoryItems.deletedAt),
      ),
    );
  return { inventory: rows };
}

// ─────────────────────────────────────────────────────────────────────────

function capRows<T>(rows: T[]): { items: T[]; truncated: boolean } {
  if (rows.length > MAX_ROWS) {
    return { items: rows.slice(0, MAX_ROWS), truncated: true };
  }
  return { items: rows, truncated: false };
}

// Silence unused-warning for `notDeleted` (kept as a documented helper for
// future tools that want a typed predicate; not used internally because
// every call site spells out `isNull(table.deletedAt)` explicitly).
void notDeleted;
