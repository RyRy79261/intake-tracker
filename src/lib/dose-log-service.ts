import { db, type DoseLog, type DoseStatus, type Prescription, type MedicationPhase, type PhaseSchedule, type InventoryItem } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { syncFields } from "./utils";
import { getDeviceTimezone } from "./timezone";
import { buildAuditEntry } from "./audit-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DoseLogWithDetails {
  log: DoseLog;
  prescription: Prescription;
  phase: MedicationPhase;
  schedule: PhaseSchedule;
  inventory?: InventoryItem;
}

export interface TakeDoseInput {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
  dosageMg: number;
}

export interface UntakeDoseInput {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
  dosageMg: number;
}

export interface SkipDoseInput {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
  dosageMg: number;
  reason?: string;
}

export interface RescheduleDoseInput {
  prescriptionId: string;
  phaseId: string;
  scheduleId: string;
  date: string;
  time: string;
  newTime: string;
  dosageMg: number;
}

// ---------------------------------------------------------------------------
// Fractional pill math helpers (exported for reuse)
// ---------------------------------------------------------------------------

/**
 * Calculate how many pills are consumed for a given dose.
 * Uses 4-decimal rounding to avoid floating-point noise.
 */
export function calculatePillsConsumed(doseMg: number, pillStrengthMg: number): number {
  if (pillStrengthMg === 0) return 0;
  const raw = doseMg / pillStrengthMg;
  return Math.round(raw * 10000) / 10000;
}

/**
 * Check whether a fractional pill amount is a "clean" fraction.
 * Clean fractions: whole numbers, 0.25, 0.333, 0.5, 0.667, 0.75
 * Uses 0.01 tolerance for floating-point comparison.
 */
export function isCleanFraction(pillsConsumed: number): boolean {
  const frac = Math.abs(pillsConsumed % 1);
  if (frac < 0.01) return true; // whole number
  const cleanFractions = [0.25, 0.333, 0.5, 0.667, 0.75];
  return cleanFractions.some(cf => Math.abs(frac - cf) < 0.01);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getDoseLogRaw(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
): Promise<DoseLog | undefined> {
  return db.doseLogs
    .where("scheduleId")
    .equals(scheduleId)
    .filter(
      (l) =>
        l.prescriptionId === prescriptionId &&
        l.phaseId === phaseId &&
        l.scheduledDate === date &&
        l.scheduledTime === time,
    )
    .first();
}

function buildDoseLog(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  status: DoseStatus,
  extra?: Partial<Pick<DoseLog, "rescheduledTo" | "skipReason" | "note" | "inventoryItemId">>,
): DoseLog {
  return {
    id: crypto.randomUUID(),
    prescriptionId,
    phaseId,
    scheduleId,
    scheduledDate: date,
    scheduledTime: time,
    status,
    actionTimestamp: Date.now(),
    ...extra,
    ...syncFields(),
  };
}

/**
 * Upsert a dose log record. Used inside transactions.
 */
async function upsertDoseLog(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
  status: DoseStatus,
  extra?: Partial<Pick<DoseLog, "rescheduledTo" | "skipReason" | "note" | "inventoryItemId">>,
): Promise<DoseLog> {
  const existing = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
  const now = Date.now();
  const timezone = getDeviceTimezone();

  if (existing) {
    const updates: Partial<DoseLog> = {
      status,
      actionTimestamp: now,
      timezone,
      updatedAt: now,
      ...extra,
    };
    await db.doseLogs.update(existing.id, updates);
    return { ...existing, ...updates };
  }

  const log = buildDoseLog(prescriptionId, phaseId, scheduleId, date, time, status, extra);
  await db.doseLogs.add(log);
  return log;
}

// ---------------------------------------------------------------------------
// Read functions — return T directly (throw on error)
// ---------------------------------------------------------------------------

export async function getDoseLogsForDate(date: string): Promise<DoseLog[]> {
  return db.doseLogs.where("scheduledDate").equals(date).toArray();
}

export async function getDoseLog(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  date: string,
  time: string,
): Promise<DoseLog | undefined> {
  return getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
}

export async function getDoseLogsWithDetailsForDate(date: string): Promise<DoseLogWithDetails[]> {
  const logs = await db.doseLogs.where("scheduledDate").equals(date).toArray();

  const activePrescriptions = await db.prescriptions.toArray();
  const prescriptionMap = new Map(activePrescriptions.map(p => [p.id, p]));

  const phases = await db.medicationPhases.toArray();
  const phaseMap = new Map(phases.map(p => [p.id, p]));

  const schedules = await db.phaseSchedules.toArray();
  const scheduleMap = new Map(schedules.map(s => [s.id, s]));

  const inventories = await db.inventoryItems.toArray();
  const inventoryMap = new Map<string, InventoryItem>();
  for (const inv of inventories) {
    if (inv.isActive && !inv.isArchived) {
      inventoryMap.set(inv.prescriptionId, inv);
    }
  }

  const result: DoseLogWithDetails[] = [];
  for (const log of logs) {
    const prescription = prescriptionMap.get(log.prescriptionId);
    const phase = phaseMap.get(log.phaseId);
    const schedule = scheduleMap.get(log.scheduleId);
    const inventory = inventoryMap.get(log.prescriptionId);

    if (prescription && phase && schedule) {
      result.push({
        log,
        prescription,
        phase,
        schedule,
        ...(inventory !== undefined && { inventory }),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Mutation functions — atomic transactions with audit logging
// ---------------------------------------------------------------------------

/**
 * Record a dose as taken. Atomic: dose log + stock decrement + audit log in
 * a single Dexie transaction. Fractional pill math uses dosageMg / pillStrength.
 */
export async function takeDose(input: TakeDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, phaseId, scheduleId, date, time, dosageMg } = input;

    const log = await db.transaction(
      "rw",
      [db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.auditLogs],
      async () => {
        const prev = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
        const wasTaken = prev?.status === "taken";

        let inventoryItemId: string | undefined = prev?.inventoryItemId;
        let pillsConsumed = 0;

        if (!wasTaken) {
          // Find active inventory for this prescription
          const inventory = await db.inventoryItems
            .where({ prescriptionId, isActive: 1 })
            .first();

          if (inventory) {
            inventoryItemId = inventory.id;
            pillsConsumed = calculatePillsConsumed(dosageMg, inventory.strength);
            const newStock = (inventory.currentStock ?? 0) - pillsConsumed;

            // Update stock (negative allowed per user decision)
            await db.inventoryItems.update(inventory.id, {
              currentStock: Math.round(newStock * 10000) / 10000,
              updatedAt: Date.now(),
            });

            // Record inventory transaction
            const sf = syncFields();
            await db.inventoryTransactions.add({
              id: crypto.randomUUID(),
              inventoryItemId: inventory.id,
              timestamp: Date.now(),
              amount: -pillsConsumed,
              type: "consumed" as const,
              ...(prev?.id !== undefined && { doseLogId: prev.id }),
              createdAt: sf.createdAt,
              updatedAt: sf.updatedAt,
              deletedAt: null,
              deviceId: sf.deviceId,
              timezone: sf.timezone,
            });
          }
        }

        // Upsert dose log
        const doseLog = await upsertDoseLog(
          prescriptionId, phaseId, scheduleId, date, time, "taken",
          inventoryItemId !== undefined ? { inventoryItemId } : undefined,
        );

        // Audit log
        const auditDetails: Record<string, unknown> = {
          prescriptionId, date, time, dosageMg, pillsConsumed, inventoryItemId,
        };
        if (pillsConsumed > 0 && !isCleanFraction(pillsConsumed)) {
          auditDetails.warning = "odd_fraction";
        }
        await db.auditLogs.add(buildAuditEntry("dose_taken", auditDetails));

        return doseLog;
      },
    );

    return ok(log);
  } catch (e) {
    return err("Failed to take dose", e);
  }
}

/**
 * Reverse a taken dose back to pending. Restores stock if previously consumed.
 */
export async function untakeDose(input: UntakeDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, phaseId, scheduleId, date, time, dosageMg } = input;

    const log = await db.transaction(
      "rw",
      [db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.auditLogs],
      async () => {
        const prev = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
        const wasTaken = prev?.status === "taken";
        let pillsConsumed = 0;

        if (wasTaken && prev?.inventoryItemId) {
          const inventory = await db.inventoryItems.get(prev.inventoryItemId);
          if (inventory) {
            pillsConsumed = calculatePillsConsumed(dosageMg, inventory.strength);
            const newStock = (inventory.currentStock ?? 0) + pillsConsumed;

            await db.inventoryItems.update(inventory.id, {
              currentStock: Math.round(newStock * 10000) / 10000,
              updatedAt: Date.now(),
            });

            const sf = syncFields();
            await db.inventoryTransactions.add({
              id: crypto.randomUUID(),
              inventoryItemId: inventory.id,
              timestamp: Date.now(),
              amount: pillsConsumed,
              type: "consumed",
              doseLogId: prev.id,
              createdAt: sf.createdAt,
              updatedAt: sf.updatedAt,
              deletedAt: null,
              deviceId: sf.deviceId,
              timezone: sf.timezone,
            });
          }
        }

        const doseLog = await upsertDoseLog(
          prescriptionId, phaseId, scheduleId, date, time, "pending",
        );

        await db.auditLogs.add(buildAuditEntry("dose_untaken", {
          prescriptionId, date, time, dosageMg, pillsConsumed,
          inventoryItemId: prev?.inventoryItemId,
        }));

        return doseLog;
      },
    );

    return ok(log);
  } catch (e) {
    return err("Failed to untake dose", e);
  }
}

/**
 * Skip a dose. If previously taken, reverses stock adjustment.
 */
export async function skipDose(input: SkipDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, phaseId, scheduleId, date, time, dosageMg, reason } = input;

    const log = await db.transaction(
      "rw",
      [db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.auditLogs],
      async () => {
        const prev = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
        let pillsConsumed = 0;

        // Reverse stock if previously taken
        if (prev?.status === "taken" && prev?.inventoryItemId) {
          const inventory = await db.inventoryItems.get(prev.inventoryItemId);
          if (inventory) {
            pillsConsumed = calculatePillsConsumed(dosageMg, inventory.strength);
            const newStock = (inventory.currentStock ?? 0) + pillsConsumed;

            await db.inventoryItems.update(inventory.id, {
              currentStock: Math.round(newStock * 10000) / 10000,
              updatedAt: Date.now(),
            });

            const sf = syncFields();
            await db.inventoryTransactions.add({
              id: crypto.randomUUID(),
              inventoryItemId: inventory.id,
              timestamp: Date.now(),
              amount: pillsConsumed,
              type: "consumed",
              doseLogId: prev.id,
              createdAt: sf.createdAt,
              updatedAt: sf.updatedAt,
              deletedAt: null,
              deviceId: sf.deviceId,
              timezone: sf.timezone,
            });
          }
        }

        const doseLog = await upsertDoseLog(
          prescriptionId, phaseId, scheduleId, date, time, "skipped",
          reason !== undefined ? { skipReason: reason } : undefined,
        );

        await db.auditLogs.add(buildAuditEntry("dose_skipped", {
          prescriptionId, date, time, dosageMg, pillsConsumed, reason,
          inventoryItemId: prev?.inventoryItemId,
        }));

        return doseLog;
      },
    );

    return ok(log);
  } catch (e) {
    return err("Failed to skip dose", e);
  }
}

/**
 * Reschedule a dose to a new time. If previously taken, reverses stock on old slot.
 * Marks old slot as "rescheduled", creates new slot as "pending".
 */
export async function rescheduleDose(input: RescheduleDoseInput): Promise<ServiceResult<DoseLog>> {
  try {
    const { prescriptionId, phaseId, scheduleId, date, time, newTime, dosageMg } = input;

    const log = await db.transaction(
      "rw",
      [db.doseLogs, db.inventoryItems, db.inventoryTransactions, db.auditLogs],
      async () => {
        const prev = await getDoseLogRaw(prescriptionId, phaseId, scheduleId, date, time);
        let pillsConsumed = 0;

        // Reverse stock if previously taken
        if (prev?.status === "taken" && prev?.inventoryItemId) {
          const inventory = await db.inventoryItems.get(prev.inventoryItemId);
          if (inventory) {
            pillsConsumed = calculatePillsConsumed(dosageMg, inventory.strength);
            const newStock = (inventory.currentStock ?? 0) + pillsConsumed;

            await db.inventoryItems.update(inventory.id, {
              currentStock: Math.round(newStock * 10000) / 10000,
              updatedAt: Date.now(),
            });

            const sf = syncFields();
            await db.inventoryTransactions.add({
              id: crypto.randomUUID(),
              inventoryItemId: inventory.id,
              timestamp: Date.now(),
              amount: pillsConsumed,
              type: "consumed",
              doseLogId: prev.id,
              createdAt: sf.createdAt,
              updatedAt: sf.updatedAt,
              deletedAt: null,
              deviceId: sf.deviceId,
              timezone: sf.timezone,
            });
          }
        }

        // Mark old slot as rescheduled
        await upsertDoseLog(
          prescriptionId, phaseId, scheduleId, date, time, "rescheduled",
          { rescheduledTo: newTime },
        );

        // Create new slot as pending
        const doseLog = await upsertDoseLog(
          prescriptionId, phaseId, scheduleId, date, newTime, "pending",
        );

        await db.auditLogs.add(buildAuditEntry("dose_rescheduled", {
          prescriptionId, date, time, newTime, dosageMg, pillsConsumed,
          inventoryItemId: prev?.inventoryItemId,
        }));

        return doseLog;
      },
    );

    return ok(log);
  } catch (e) {
    return err("Failed to reschedule dose", e);
  }
}

/**
 * Take all doses in a list. Each dose gets its own transaction —
 * one failure does not block others.
 */
export async function takeAllDoses(
  entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageMg: number }[],
  date: string,
  time: string,
): Promise<ServiceResult<void>> {
  const errors: string[] = [];

  for (const entry of entries) {
    const result = await takeDose({
      prescriptionId: entry.prescriptionId,
      phaseId: entry.phaseId,
      scheduleId: entry.scheduleId,
      date,
      time,
      dosageMg: entry.dosageMg,
    });
    if (!result.success) {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return err(`Failed to take ${errors.length} dose(s): ${errors.join("; ")}`);
  }
  return ok(undefined);
}

/**
 * Skip all doses in a list. Each dose gets its own transaction —
 * one failure does not block others.
 */
export async function skipAllDoses(
  entries: { prescriptionId: string; phaseId: string; scheduleId: string; dosageMg: number }[],
  date: string,
  time: string,
  reason?: string,
): Promise<ServiceResult<void>> {
  const errors: string[] = [];

  for (const entry of entries) {
    const result = await skipDose({
      prescriptionId: entry.prescriptionId,
      phaseId: entry.phaseId,
      scheduleId: entry.scheduleId,
      date,
      time,
      dosageMg: entry.dosageMg,
      ...(reason !== undefined && { reason }),
    });
    if (!result.success) {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return err(`Failed to skip ${errors.length} dose(s): ${errors.join("; ")}`);
  }
  return ok(undefined);
}
